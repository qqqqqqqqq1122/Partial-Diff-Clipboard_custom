# Change Log

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
