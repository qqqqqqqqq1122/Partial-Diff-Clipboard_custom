'use strict';

// Custom wrapper around the original Partial Diff Clipboard bundle.
// Adds a persistent side-order toggle (status bar + diff editor title button)
// on top of the core extension without modifying its diff logic.
//
// Persistence strategy:
// - The button first stores the choice in the extension's globalState, which is
//   always available and survives restarts even before VS Code has registered
//   the new configuration key.
// - It also tries to mirror the value into the user setting
//   partialDiff.firstTextOnRight. If the key is not registered yet, the write
//   may be rejected; the globalState value remains authoritative until then.
// - When the setting is explicitly set (by the user or by a successful mirror),
//   the setting wins and the global override is cleared.

const vscode = require('vscode');
const core = require('./extension-core.js');

const CONFIG_SECTION = 'partialDiff';
const CONFIG_KEY = 'firstTextOnRight';
const STATE_KEY = 'partialDiff.firstTextOnRight';
const TOGGLE_COMMAND = 'extension.partialDiff.toggleSideOrder';
const CONTEXT_HAS_OUR_DIFF = 'partialDiff.hasOpenDiff';

const PARTIAL_DIFF_SCHEMES = new Set(['partialdiff', 'partialdiff-editable']);

function configValue() {
	try {
		const inspected = vscode.workspace.getConfiguration(CONFIG_SECTION).inspect(CONFIG_KEY);
		if (inspected && (inspected.globalValue !== undefined || inspected.workspaceValue !== undefined || inspected.workspaceFolderValue !== undefined)) {
			return inspected.value;
		}
	} catch (error) { /* inspect is unavailable in some hosts */ }
	return vscode.workspace.getConfiguration(CONFIG_SECTION).get(CONFIG_KEY);
}

function isOldTextOnRight() {
	if (typeof globalThis.__partialDiffFirstTextOnRight === 'boolean') {
		return globalThis.__partialDiffFirstTextOnRight;
	}
	return configValue() !== false;
}

function updateTarget() {
	try {
		const inspected = vscode.workspace.getConfiguration(CONFIG_SECTION).inspect(CONFIG_KEY);
		if (inspected && (inspected.workspaceValue !== undefined || inspected.workspaceFolderValue !== undefined)) {
			return vscode.ConfigurationTarget.Workspace;
		}
	} catch (error) { /* ignore */ }
	return vscode.ConfigurationTarget.Global;
}

function isOurDiffTab(tab) {
	const input = tab && tab.input;
	if (!input) { return false; }
	const original = input.original;
	const modified = input.modified;
	if (!original || !modified) { return false; }
	return PARTIAL_DIFF_SCHEMES.has(original.scheme) || PARTIAL_DIFF_SCHEMES.has(modified.scheme);
}

function hasOurDiff() {
	return vscode.window.tabGroups.all.some((group) => group.tabs.some(isOurDiffTab));
}

async function syncDiffContext() {
	await vscode.commands.executeCommand('setContext', CONTEXT_HAS_OUR_DIFF, hasOurDiff());
}

function activate(context) {
	core.activate(context);

	// Restore the button's remembered value unless the setting itself is explicit.
	let configExplicit = false;
	try {
		const inspected = vscode.workspace.getConfiguration(CONFIG_SECTION).inspect(CONFIG_KEY);
		configExplicit = !!inspected && (inspected.globalValue !== undefined || inspected.workspaceValue !== undefined || inspected.workspaceFolderValue !== undefined);
	} catch (error) { /* ignore */ }

	if (configExplicit) {
		globalThis.__partialDiffFirstTextOnRight = undefined;
		void context.globalState.update(STATE_KEY, undefined);
	} else {
		const stored = context.globalState.get(STATE_KEY);
		if (typeof stored === 'boolean') {
			globalThis.__partialDiffFirstTextOnRight = stored;
		}
	}

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.command = TOGGLE_COMMAND;
	context.subscriptions.push(statusBar);

	function refreshStatusBar() {
		const oldOnRight = isOldTextOnRight();
		statusBar.text = oldOnRight ? '$(arrow-swap) 旧→右' : '$(arrow-swap) 旧→左';
		statusBar.tooltip = oldOnRight
			? 'PartialDiff：第一次复制/选择的文字（旧）在右，当前选区（新）在左。点击切换，对下一次比较生效。'
			: 'PartialDiff：第一次复制/选择的文字（旧）在左，当前选区（新）在右。点击切换，对下一次比较生效。';
		statusBar.show();
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(TOGGLE_COMMAND, async () => {
			const next = !isOldTextOnRight();
			globalThis.__partialDiffFirstTextOnRight = next;
			await context.globalState.update(STATE_KEY, next);

			let synced = false;
			try {
				await vscode.workspace.getConfiguration(CONFIG_SECTION)
					.update(CONFIG_KEY, next, updateTarget());
				synced = true;
			} catch (error) {
				// The setting key may not be registered until VS Code is fully restarted.
				// The globalState value above keeps the toggle working in the meantime.
			}

			refreshStatusBar();
			vscode.window.setStatusBarMessage(
				next
					? (synced ? 'PartialDiff：旧→右 / 新→左（已保存，下一次比较生效）' : 'PartialDiff：旧→右 / 新→左（已记住，下一次比较生效）')
					: (synced ? 'PartialDiff：旧→左 / 新→右（已保存，下一次比较生效）' : 'PartialDiff：旧→左 / 新→右（已记住，下一次比较生效）'),
				3000
			);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(CONFIG_SECTION + '.' + CONFIG_KEY)) {
				// An explicit setting (user edit or successful mirror) takes precedence.
				globalThis.__partialDiffFirstTextOnRight = undefined;
				void context.globalState.update(STATE_KEY, undefined);
				refreshStatusBar();
			}
		}),
		vscode.window.tabGroups.onDidChangeTabs(() => { void syncDiffContext(); }),
		vscode.window.onDidChangeActiveTextEditor(() => { void syncDiffContext(); })
	);

	void syncDiffContext();
	refreshStatusBar();
}

function deactivate() {}

exports.activate = activate;
exports.deactivate = deactivate;
