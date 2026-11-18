# Change Log

## 1.0.4 (2026-11-18 15:17:09)
- The side-order toggle now immediately flips the currently open selection/clipboard diff: it reopens the diff with reversed URIs and a reversed title, then closes the old tab
- Editable temp documents remain open after the old tab closes, so editing and apply-back keep working (verified in a real VS Code 1.139 instance)
- Visible/open-editor diffs keep their order; the status bar message explains this
- Added a session text-key map in the core so the wrapper can distinguish selection/clipboard diffs from visible/open-editor diffs
- Extended the step010 harness to 94 checks

## 1.0.3 (2026-11-18 10:50:26)
- Added a persistent status bar button and a diff editor title button to switch the old/new side order
- The chosen order is saved to the extension globalState and mirrored to the global setting `partialDiff.firstTextOnRight` when the key is writable; it is restored after restart
- Added the `extension.partialDiff.toggleSideOrder` command
- Restructured the entry point: `dist/extension.js` is now the custom wrapper and `dist/extension-core.js` is the patched core bundle
- The toggle applies to the next comparison; the currently open diff is not live-swapped

## 1.0.2 (2026-11-18 10:22:06)
- Repackaged as **Partial Diff Clipboard_custom** for a public custom build
- Fixed editable diffs opening the two panes in the reverse order of the diff title
- Fixed comparison order: the first comparison text (first selection or clipboard content) is now shown on the right, the second text on the left; the diff title always matches the pane order
- Added `partialDiff.firstTextOnRight` (default: enabled; an unregistered/unset value also counts as enabled)
- Included `test/step010_test_harness.js`, a standalone behavior regression harness with a mocked VS Code API

## 2026-11-18 09:44:15 -- Local fixes (1.0.1)
- Fixed editable diffs opening the panes in the reverse order of the diff title
- Added `partialDiff.firstTextOnRight` (default: `true`)

## 1.0.1
- Rebranded

## 1.0.0
- Initial release
