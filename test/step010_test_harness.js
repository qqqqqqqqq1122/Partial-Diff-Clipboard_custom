'use strict';

// Standalone harness for the patched Partial Diff Clipboard extension.
// Mocks the vscode API, loads the real extension bundle, drives its commands,
// and asserts that pane contents and the diff title agree.

const Module = require('module');
const path = require('path');

class Position {
	constructor(line, character) { this.line = line; this.character = character; }
}
class Range {
	constructor(a, b, c, d) {
		if (a instanceof Position) { this.start = a; this.end = b; }
		else { this.start = new Position(a, b); this.end = new Position(c, d); }
	}
}
class Selection extends Range {
	constructor(a, b) { super(a, b); }
	get isEmpty() { return this.start.line === this.end.line && this.start.character === this.end.character; }
}

class Uri {
	constructor(scheme, uriPath, query) { this.scheme = scheme; this.path = uriPath; this.query = query || ''; }
	static parse(str) {
		const m = /^([a-zA-Z][\w+.-]*):([^?]*)(?:\?(.*))?$/.exec(str);
		if (!m) { throw new Error('Bad URI: ' + str); }
		return new Uri(m[1], m[2], m[3] || '');
	}
	static from(o) { return new Uri(o.scheme, o.path === undefined ? '' : o.path, o.query || ''); }
	toString() { return this.scheme + ':' + this.path + (this.query ? '?' + this.query : ''); }
}

class FakeDocument {
	constructor(text, uri, fileName) {
		this.text = text;
		this.uri = uri;
		this.fileName = fileName;
		this.lines = text.split('\n');
	}
	getText(range) {
		if (!range) { return this.text; }
		return this.text.slice(this.offsetAt(range.start), this.offsetAt(range.end));
	}
	offsetAt(pos) {
		let off = 0;
		for (let i = 0; i < pos.line; i++) { off += this.lines[i].length + 1; }
		return off + pos.character;
	}
	positionAt(off) {
		let line = 0, rem = off;
		while (line < this.lines.length - 1 && rem > this.lines[line].length) {
			rem -= this.lines[line].length + 1;
			line++;
		}
		return new Position(line, rem);
	}
}

function makeEditor(fileName, text, opts) {
	opts = opts || {};
	const uri = Uri.parse('file:///' + fileName);
	const doc = new FakeDocument(text, uri, fileName);
	let sel;
	if (opts.selectAll === false) { sel = new Selection(new Position(0, 0), new Position(0, 0)); }
	else { sel = new Selection(new Position(0, 0), new Position(0, text.length)); }
	state.sourceDocuments[uri.toString()] = doc;
	return { document: doc, selections: [sel], viewColumn: opts.viewColumn || 1 };
}

class WorkspaceEdit {
	constructor() { this.edits = []; }
	replace(uri, range, text) { this.edits.push({ uri, range, text }); }
}

class EventEmitter {
	constructor() { this.listeners = []; this.event = (cb) => { this.listeners.push(cb); return { dispose() {} }; }; }
	fire(data) { this.listeners.forEach((cb) => cb(data)); }
}

class FileSystemError extends Error {
	static FileNotFound(uri) { const e = new FileSystemError('FileNotFound: ' + uri); e.code = 'FileNotFound'; return e; }
	static FileExists(uri) { const e = new FileSystemError('FileExists: ' + uri); e.code = 'FileExists'; return e; }
	static NoPermissions(uri) { const e = new FileSystemError('NoPermissions: ' + uri); e.code = 'NoPermissions'; return e; }
}

// ---- shared mock state -------------------------------------------------
const state = {
	registered: new Map(),
	executeCalls: [],
	contexts: {},
	messages: [],
	clipboardText: '',
	contentProvider: null,
	fsProviders: {},
	sourceDocuments: {},
	textDocListeners: [],
	appliedEdits: [],
	config: {
		partialDiff: {
			enableEditableDiffs: false,
			firstTextOnRight: true,
			preComparisonTextNormalizationRules: [],
		},
		flat: {
			'diffEditor.renderSideBySide': true,
			'diffEditor.useInlineViewWhenSpaceIsLimited': true,
		},
	},
};

const commands = {
	registerCommand(name, cb, thisArg) {
		state.registered.set(name, { type: 'general', cb, thisArg });
		return { dispose() {} };
	},
	registerTextEditorCommand(name, cb, thisArg) {
		state.registered.set(name, { type: 'editor', cb, thisArg });
		return { dispose() {} };
	},
	executeCommand(...args) {
		state.executeCalls.push(args);
		if (args[0] === 'setContext') { state.contexts[args[1]] = args[2]; }
		return Promise.resolve(undefined);
	},
};

const workspace = {
	getConfiguration(section) {
		return {
			get(key) {
				return section ? (state.config[section] || {})[key] : state.config.flat[key];
			},
			update(key, value) { state.config.flat[key] = value; return Promise.resolve(); },
		};
	},
	registerTextDocumentContentProvider(scheme, provider) {
		state.contentProvider = provider;
		return { dispose() {} };
	},
	registerFileSystemProvider(scheme, provider) {
		state.fsProviders[scheme] = provider;
		return { dispose() {} };
	},
	onDidChangeTextDocument(cb) { state.textDocListeners.push(cb); return { dispose() {} }; },
	onDidCloseTextDocument() { return { dispose() {} }; },
	applyEdit(edit) { state.appliedEdits.push(edit); return Promise.resolve(true); },
	fs: {
		createDirectory(uri) { return Promise.resolve(state.fsProviders[uri.scheme].createDirectory(uri)); },
		writeFile(uri, content) {
			return Promise.resolve(state.fsProviders[uri.scheme].writeFile(uri, content, { create: true, overwrite: true }));
		},
		delete(uri) { return Promise.resolve(state.fsProviders[uri.scheme].delete(uri, { recursive: true })); },
	},
	openTextDocument(uri) {
		if (state.sourceDocuments[uri.toString()]) {
			return Promise.resolve(state.sourceDocuments[uri.toString()]);
		}
		const provider = state.fsProviders[uri.scheme];
		if (provider) {
			return Promise.resolve(new FakeDocument(provider.readFile(uri).toString('utf8'), uri, uri.path));
		}
		return Promise.resolve(new FakeDocument('', uri, uri.path));
	},
};

const windowMock = {
	visibleTextEditors: [],
	tabGroups: {
		all: [],
		onDidChangeTabs() { return { dispose() {} }; },
		close() { return Promise.resolve(true); },
	},
	onDidChangeWindowState() { return { dispose() {} }; },
	onDidChangeVisibleTextEditors() { return { dispose() {} }; },
	onDidChangeTextEditorSelection() { return { dispose() {} }; },
	showInformationMessage(msg) { state.messages.push(msg); return Promise.resolve(undefined); },
	showWarningMessage(msg) { state.messages.push(msg); return Promise.resolve(undefined); },
	showQuickPick(items) { return Promise.resolve(items.filter((i) => i.picked)); },
	showTextDocument() { return Promise.resolve(undefined); },
};

const vscodeMock = {
	workspace,
	window: windowMock,
	commands,
	env: { clipboard: { readText: () => Promise.resolve(state.clipboardText) } },
	Uri,
	Position,
	Range,
	Selection,
	WorkspaceEdit,
	EventEmitter,
	FileType: { File: 1, Directory: 2 },
	FileChangeType: { Changed: 1, Created: 2, Deleted: 3 },
	FilePermission: { Readonly: 1 },
	FileSystemError,
	ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
};

// ---- load extension ----------------------------------------------------
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
	if (request === 'vscode') { return vscodeMock; }
	return origLoad.apply(this, arguments);
};

const extensionPath = process.argv.length > 2
	? path.resolve(process.argv[2])
	: path.resolve(__dirname, '..', 'dist', 'extension.js');
const extension = require(extensionPath);

// ---- helpers -----------------------------------------------------------
function invoke(name, editor) {
	const entry = state.registered.get(name);
	if (!entry) { throw new Error('Command not registered: ' + name); }
	return entry.cb.call(entry.thisArg, editor);
}

function lastCall(commandId) {
	for (let i = state.executeCalls.length - 1; i >= 0; i--) {
		if (state.executeCalls[i][0] === commandId) { return state.executeCalls[i]; }
	}
	return null;
}

function contentOf(uri) {
	return state.contentProvider.provideTextDocumentContent(uri);
}

let failures = 0;
function check(label, actual, expected) {
	const ok = actual === expected;
	if (!ok) { failures++; }
	console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
	if (!ok) {
		console.log('      expected: ' + JSON.stringify(expected));
		console.log('      actual  : ' + JSON.stringify(actual));
	}
}
function checkTrue(label, actual) { check(label, !!actual, true); }

(async function main() {
	extension.activate({ subscriptions: [] });

	// ---------- Test A: Select for Compare -> Compare with Selected ----------
	const first = makeEditor('first.txt', 'first text');
	const second = makeEditor('second.txt', 'second text');
	windowMock.visibleTextEditors = [first, second];
	state.config.partialDiff.enableEditableDiffs = false;
	state.config.partialDiff.firstTextOnRight = true;

	await invoke('extension.partialDiff.selectForCompare', first);
	await invoke('extension.partialDiff.compareWithSelected', second);

	let call = lastCall('vscode.diff');
	check('A panel left holds the SECOND selection', contentOf(call[1]), 'second text');
	check('A panel right holds the FIRST selection', contentOf(call[2]), 'first text');
	check('A title matches left/right order', call[3], 'second.txt (l.1) \u2194 first.txt (l.1)');

	// ---------- Test B: Compare with Clipboard ----------
	state.clipboardText = 'clip content';
	const editor = makeEditor('editor.txt', 'selected text');
	windowMock.visibleTextEditors = [editor];
	await invoke('extension.partialDiff.compareWithClipboard', editor);

	call = lastCall('vscode.diff');
	check('B left holds current editor selection', contentOf(call[1]), 'selected text');
	check('B right holds the clipboard (first copied)', contentOf(call[2]), 'clip content');
	check('B title matches left/right order', call[3], 'editor.txt (l.1) \u2194 Clipboard');

	// ---------- Test C: Compare Visible Editors stays spatial ----------
	const leftEditor = makeEditor('left-pane.txt', 'LEFT PANE', { selectAll: false, viewColumn: 1 });
	const rightEditor = makeEditor('right-pane.txt', 'RIGHT PANE', { selectAll: false, viewColumn: 2 });
	windowMock.visibleTextEditors = [rightEditor, leftEditor]; // deliberately out of order
	await invoke('extension.partialDiff.compareVisibleEditors');

	call = lastCall('vscode.diff');
	check('C left pane text stays on the left', contentOf(call[1]), 'LEFT PANE');
	check('C right pane text stays on the right', contentOf(call[2]), 'RIGHT PANE');
	check('C title matches left/right order', call[3], 'left-pane.txt \u2194 right-pane.txt');

	// ---------- Test C2: visible editors in editable mode stay spatial ----------
	state.config.partialDiff.enableEditableDiffs = true;
	state.executeCalls.length = 0;
	await invoke('extension.partialDiff.compareVisibleEditors');
	call = lastCall('_workbench.diff');
	checkTrue('C2 editable visible-editor diff opened', call !== null);
	const fsC2 = state.fsProviders['partialdiff-editable'];
	check('C2 editable left pane holds the left text', fsC2.readFile(call[1]).toString('utf8'), 'LEFT PANE');
	check('C2 editable right pane holds the right text', fsC2.readFile(call[2]).toString('utf8'), 'RIGHT PANE');
	check('C2 editable visible-editor title', call[3], 'left-pane.txt \u2194 right-pane.txt');

	// ---------- Test D: option off restores stock order ----------
	state.config.partialDiff.enableEditableDiffs = false;
	state.config.partialDiff.firstTextOnRight = false;
	windowMock.visibleTextEditors = [first, second];
	await invoke('extension.partialDiff.selectForCompare', first);
	await invoke('extension.partialDiff.compareWithSelected', second);

	call = lastCall('vscode.diff');
	check('D option off: first text on left', contentOf(call[1]), 'first text');
	check('D option off: second text on right', contentOf(call[2]), 'second text');
	check('D option off: title order', call[3], 'first.txt (l.1) \u2194 second.txt (l.1)');

	// ---------- Test D2: unregistered setting (undefined) defaults to ON ----------
	delete state.config.partialDiff.firstTextOnRight;
	await invoke('extension.partialDiff.selectForCompare', first);
	await invoke('extension.partialDiff.compareWithSelected', second);

	call = lastCall('vscode.diff');
	check('D2 undefined setting: second text on left', contentOf(call[1]), 'second text');
	check('D2 undefined setting: first text on right', contentOf(call[2]), 'first text');
	check('D2 undefined setting: title order', call[3], 'second.txt (l.1) \u2194 first.txt (l.1)');

	// ---------- Test E: editable diff path (default) ----------
	state.config.partialDiff.enableEditableDiffs = true;
	state.config.partialDiff.firstTextOnRight = true;
	state.executeCalls.length = 0;

	await invoke('extension.partialDiff.selectForCompare', first);
	await invoke('extension.partialDiff.compareWithSelected', second);

	call = lastCall('_workbench.diff');
	checkTrue('E editable diff was opened', call !== null);
	const fsProvider = state.fsProviders['partialdiff-editable'];
	const leftUri = call[1];  // _workbench.diff(original/left, modified/right, title, options)
	const rightUri = call[2];
	check('E editable left temp holds the SECOND selection', fsProvider.readFile(leftUri).toString('utf8'), 'second text');
	check('E editable right temp holds the FIRST selection', fsProvider.readFile(rightUri).toString('utf8'), 'first text');
	check('E editable title matches left/right order', call[3], 'second.txt (l.1) \u2194 first.txt (l.1)');
	checkTrue('E editable left side (second selection) is editable', call[4][1].originalEditable === true);

	// ---------- Test F: editable clipboard path ----------
	state.clipboardText = 'clip content';
	const ed2 = makeEditor('editor.txt', 'selected text');
	windowMock.visibleTextEditors = [ed2];
	state.executeCalls.length = 0;
	await invoke('extension.partialDiff.compareWithClipboard', ed2);

	call = lastCall('_workbench.diff');
	checkTrue('F editable clipboard diff was opened', call !== null);
	const leftUri2 = call[1];
	const rightUri2 = call[2];
	check('F editable left temp holds current selection', fsProvider.readFile(leftUri2).toString('utf8'), 'selected text');
	check('F editable right temp holds clipboard', fsProvider.readFile(rightUri2).toString('utf8'), 'clip content');
	check('F clipboard temp is read-only', /-readonly\.txt$/.test(rightUri2.path), true);
	check('F editable clipboard title', call[3], 'editor.txt (l.1) \u2194 Clipboard');

	// ---------- Test G: edit the LEFT pane -> applies back to SECOND source ----------
	state.appliedEdits.length = 0;
	fsProvider.writeFile(leftUri, Buffer.from('EDITED SECOND', 'utf8'), { create: false, overwrite: true });
	state.textDocListeners.forEach((cb) => cb({ document: { uri: leftUri } }));
	await new Promise((resolve) => setTimeout(resolve, 650));

	check('G left-pane edit produced one apply-back', state.appliedEdits.length, 1);
	if (state.appliedEdits.length > 0) {
		const edit = state.appliedEdits[0].edits[0];
		check('G apply-back targets the second source', edit.uri.toString(), 'file:///second.txt');
		check('G apply-back text', edit.text, 'EDITED SECOND');
	}

	// ---------- Test H: edit the RIGHT pane -> applies back to FIRST source ----------
	state.appliedEdits.length = 0;
	fsProvider.writeFile(rightUri, Buffer.from('EDITED FIRST', 'utf8'), { create: false, overwrite: true });
	state.textDocListeners.forEach((cb) => cb({ document: { uri: rightUri } }));
	await new Promise((resolve) => setTimeout(resolve, 650));

	check('H right-pane edit produced one apply-back', state.appliedEdits.length, 1);
	if (state.appliedEdits.length > 0) {
		const edit = state.appliedEdits[0].edits[0];
		check('H apply-back targets the first source', edit.uri.toString(), 'file:///first.txt');
		check('H apply-back text', edit.text, 'EDITED FIRST');
	}

	console.log('');
	if (failures === 0) {
		console.log('ALL CHECKS PASSED');
		process.exit(0);
	} else {
		console.log(failures + ' CHECK(S) FAILED');
		process.exit(1);
	}
})().catch((err) => {
	console.error('HARNESS ERROR:', err && err.stack || err);
	process.exit(2);
});
