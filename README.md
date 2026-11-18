# Revision History

- 2026-11-18 10:22:06 -- 首次公开：修复 editable diff 左右栏与标题顺序不一致；新增 `partialDiff.firstTextOnRight`；发布 1.0.2 自定义 VSIX；加入 step010 行为回归脚本。
- 2026-11-18 10:25:09 -- 补充快捷键绑定说明：扩展本身不贡献快捷键，`Alt+C` 需在 `keybindings.json` 中自行绑定。

# Partial Diff Clipboard_custom

VS Code 扩展 **Partial Diff Clipboard** 的自定义构建版（v1.0.2），用于比较同一文件内的两段选区、不同文件/编辑器中的选区，或当前选区与剪贴板内容。

本构建重点解决两个问题：

1. **Editable diff 左右栏与标题不一致**：原版在调用 VS Code 内部 `_workbench.diff` 时把 `original` 与 `modified` 两个参数传反了，但标签标题仍按未反的顺序生成。
2. **默认顺序不符合“旧文本在右”的习惯**：本构建把第一次比较的文字（第一次 `Select for Compare` 的选区，或剪贴板内容）放在右栏，第二次的文字（当前选区）放在左栏；标签标题顺序始终与左右栏一致。

## 行为说明

| 操作 | 左栏 | 右栏 | 标签标题 |
| --- | --- | --- | --- |
| `Select for Compare` → `Compare with Selected` | 第二次选择的文字 | 第一次选择的文字 | `后选 ↔ 先选` |
| `Compare with Clipboard` | 当前编辑器选区 | 剪贴板内容（先复制的文字） | `文件名 (l.x) ↔ Clipboard` |
| `Compare Visible Editors` | 物理左侧编辑器 | 物理右侧编辑器 | 与左右栏一致 |
| `Compare Open Editors` | 标签顺序第一个 | 标签顺序第二个 | 与左右栏一致 |

扩展本身不贡献快捷键。若想用 `Alt+C` 触发，可在 VS Code 的 `keybindings.json` 中绑定：

```json
{
    "key": "alt+c",
    "command": "extension.partialDiff.compareWithClipboard",
    "when": "editorTextFocus"
}
```

Editable diff（`partialDiff.enableEditableDiffs`，默认开启）下，编辑任意一侧都会写回对应源文件的选区；剪贴板一侧保持只读。

## 设置

### `partialDiff.firstTextOnRight`

- 类型：`boolean`
- 默认：`true`
- 作用：把第一次比较的文字（第一次选择的选区，或剪贴板内容）放在右栏，第二次的文字放在左栏。
- 设为 `false`：恢复传统的“原文在左、比较文本在右”布局。
- 说明：为了兼容 VS Code 主进程尚未重新扫描扩展 `package.json` 的情况，代码把“未注册/未设置”也视为开启；只有显式写入 `false` 才关闭。

## 安装

### 方式一：安装 VSIX（推荐）

1. 下载仓库根目录的 `Partial-Diff-Clipboard_custom-1.0.2.vsix`。
2. 在 VS Code 中执行 `Extensions: Install from VSIX...`，选择该文件。
3. 执行 `Developer: Reload Window`。

该构建保留原扩展 ID `heel.partial-diff-clipboard`，安装 1.0.2 会升级/替换已安装的 1.0.1；命令 ID 与设置键保持不变。

### 方式二：手动替换已安装目录

将本仓库的 `dist/extension.js` 与 `package.json` 复制到：

`%USERPROFILE%\.vscode\extensions\heel.partial-diff-clipboard-1.0.1\dist\extension.js`

`%USERPROFILE%\.vscode\extensions\heel.partial-diff-clipboard-1.0.1\package.json`

然后执行 `Developer: Reload Window`。如果已安装目录名不同，请以实际目录名为准。

## step010 -- 行为回归测试

脚本路径：`test/step010_test_harness.js`

该脚本用一套模拟的 VS Code API 直接加载 `dist/extension.js`，驱动扩展注册的命令，检查：

- 左右栏实际内容与标签标题是否一致；
- `Compare with Selected` 与 `Compare with Clipboard` 的“第一次在右、第二次在左”顺序；
- `Compare Visible Editors` 在普通与 editable 模式下保持物理左右；
- `partialDiff.firstTextOnRight` 为 `true`、`false`、未注册三种情况；
- editable diff 左右两侧修改后的回写目标与文本；
- 剪贴板临时文件只读。

运行：

```bash
node test/step010_test_harness.js
```

可选参数：扩展入口文件路径，默认使用 `dist/extension.js`。

```bash
node test/step010_test_harness.js "D:/path/to/dist/extension.js"
```

当前版本共 35 项检查，全部通过。

## 构建 VSIX（手工步骤）

1. 准备原始 1.0.1 VSIX 的 OPC 外壳：`[Content_Types].xml` 与 `extension.vsixmanifest`。
2. 在 `extension.vsixmanifest` 中把 `<Identity ... Version="1.0.1" ... />` 改为 `1.0.2`，把 `<DisplayName>` 改为 `Partial Diff Clipboard_custom`。
3. 将本仓库的 `package.json`、`changelog.md`、`LICENSE.txt`、`icon.png`、`README.md`、`dist/extension.js` 放入 VSIX 的 `extension/` 目录，并把 `README.md` 在包内命名为 `readme.md`。
4. 将 `[Content_Types].xml`、`extension.vsixmanifest`、`extension/` 打成一个 ZIP，扩展名改为 `.vsix`，得到 `Partial-Diff-Clipboard_custom-1.0.2.vsix`。

## 目录结构

- `dist/extension.js` -- 已修补的扩展入口（webpack bundle）
- `package.json` -- 扩展清单，新增 `partialDiff.firstTextOnRight`
- `changelog.md` -- 变更记录
- `LICENSE.txt` -- MIT 许可证
- `icon.png` -- 扩展图标
- `test/step010_test_harness.js` -- 行为回归测试脚本
- `Partial-Diff-Clipboard_custom-1.0.2.vsix` -- 可直接安装的构建产物
- `README.md` -- 本文件

## 修补位置（维护者参考）

- `dist/extension.js` 中的 `takeDiff(e, t)`：当 `partialDiff.firstTextOnRight` 不为 `false` 且文本键为 `reg1`/`reg2` 或 `clipboard`/`reg2` 时，交换左右文本键，再用交换后的顺序生成标题、临时文件和 editable diff 两侧。
- `dist/extension.js` 中的 `executeDiffUris(e, t, i, r)`：把传给 `_workbench.diff` 的参数改为 `(e, t, i, ...)`，即 `original/左` 在前、`modified/右` 在后。
- `package.json` 中的 `partialDiff.firstTextOnRight`：新增的顺序偏好配置。

## 来源与许可

- 基于 `heel.partial-diff-clipboard` 1.0.1（MIT License，Copyright (c) 2026 heel）。
- 该扩展的上游项目：`https://github.com/ryu1kn/vscode-partial-diff`（MIT License）。
- 本项目是个人自定义构建，与上游作者及 `heel` 发布者没有官方关联。
- 许可证全文见 `LICENSE.txt`。

## 已知限制

- 修改已安装扩展的 `package.json` 后，VS Code 主进程不会因为窗口 reload 而重新扫描配置贡献。本构建已在代码层把“未注册/未设置”视为开启，所以行为不需要依赖配置注册；若要在设置界面看到并切换 `partialDiff.firstTextOnRight`，需要完全退出 VS Code 后重新启动。
- 安装或替换扩展文件后，必须执行 `Developer: Reload Window`。
- Editable diff 会临时把工作区的 `diffEditor.renderSideBySide` 设为 `true`、`diffEditor.useInlineViewWhenSpaceIsLimited` 设为 `false`，并在相关 diff 关闭后恢复原值。
