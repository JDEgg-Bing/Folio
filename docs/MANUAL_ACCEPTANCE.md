# Markdown Editor V1 — GUI Manual Acceptance

由用户在 Windows 桌面应用中实际执行并填写。Agent 不预判 PASS。每个结果只填写 `PASS`、`FAIL` 或 `NOT TESTED`。

建议运行当前 Windows x64 目录版应用。测试 fixture 位于 `manual-tests/`。测试时如遇异常，先记录步骤和实际结果；本阶段不现场修复。

## Test Group A — Basic Editing

使用 `manual-tests/01-basic.md`。

| 项目 | 结果 | 备注 |
|---|---|---|
| 英文输入 | PASS| |
| 中文输入 | PASS | |
| Enter 换行 | PASS | |
| Backspace | PASS | |
| Delete | PASS | |
| 方向键 | PASS | |
| Home / End | PASS | |
| Ctrl+A | PASS | |
| Copy | PASS | |
| Paste | PASS | |
| Cut | PASS | |
| Undo | PASS | |
| Redo | PASS | |
| 连续快速 Undo / Redo 20 次 | PASS | |

## Test Group B — Chinese IME

使用真实中文拼音输入法和 `manual-tests/04-chinese-ime.md`。分别在普通中文段落、标题、粗体、斜体、inline code 中输入并确认文字。

| 项目 | 结果 | 备注 |
|---|---|---|
| 普通中文连续输入 | PASS | |
| 标题中输入中文 | PASS | |
| 粗体区域输入中文 | PASS | |
| 斜体区域输入中文 | PASS | |
| Inline code 区域输入中文 | PASS | |
| composition 候选过程中光标稳定 | PASS | |
| composition 候选框正常 | PASS | |
| composition 期间字符没有提前消失 | PASS | |
| delimiter 没有干扰 composition | PASS | |
| 确认候选后文字与源码正确 | PASS | |

发现异常时，先在 Bug Reports 记录操作步骤、Expected 和 Actual；不要在验收期间修改代码。

## Test Group C — Live Preview

使用 `manual-tests/02-live-preview.md`。每项分别测试鼠标点击进入/离开、← / →、↑ / ↓、Home、End、Backspace、Delete 和输入字符。

| 语法/行为 | 结果 | 备注 |
|---|---|---|
| Heading active/inactive | PASS | |
| Strong active/inactive | PASS | |
| Emphasis active/inactive | PASS | |
| Strike active/inactive | PASS | |
| Inline Code active/inactive | PASS | |
| Nested markup active/inactive | PASS | |
| Active line delimiter 可见 | PASS | |
| Inactive line delimiter 隐藏且样式存在 | PASS | |
| 光标/文字跳动 | PASS | 记录是否发生及步骤 |
| 布局异常 | PASS | 记录是否发生及步骤 |
| 字符被吞 | PASS | 记录是否发生及步骤 |
| selection 异常 | PASS | 记录是否发生及步骤 |

## Test Group D — Selection

使用 `manual-tests/02-live-preview.md`，选择范围覆盖普通文本、粗体、标题、隐藏 delimiter 和多个 Markdown 结构。

| 项目 | 结果 | 备注 |
|---|---|---|
| 单词选择 | PASS | |
| 整行拖选 | PASS | |
| 跨行拖选 | PASS | |
| Shift + Arrow | PASS | |
| Shift + Up / Down | PASS | |
| Ctrl+A | PASS | |
| Copy 复制 Markdown source | PASS | |
| Cut 删除正确 source | PASS | |
| Delete 删除正确 source | PASS | |
| 输入替换选区 | PASS | |
| Undo 恢复正确 source | NOT TESTED | |

## Test Group E — Search / Replace

| 项目 | 结果 | 备注 |
|---|---|---|
| Ctrl+F 打开 CodeMirror 搜索面板 | NOT TESTED | |
| 菜单 Find / Replace 打开同一搜索面板 | NOT TESTED | |
| Find next | NOT TESTED | |
| Find previous | NOT TESTED | |
| Replace | NOT TESTED | |
| Replace All | NOT TESTED | |
| Escape 关闭面板 | NOT TESTED | |

## Test Group F — File Lifecycle

对话框操作使用原生文件对话框；文件内容用外部文本工具检查。

| 项目 | 结果 | 备注 |
|---|---|---|
| New 创建空文档 | NOT TESTED | |
| Untitled 首次 Save 打开 Save As | NOT TESTED | |
| Save As 保存后文件存在且内容正确 | NOT TESTED | |
| 原生 Open 打开测试 Markdown | NOT TESTED | |
| 修改后 Ctrl+S 保存 | NOT TESTED | |
| 外部检查磁盘内容正确 | NOT TESTED | |
| Save As 到另一文件 | NOT TESTED | |
| 另存文件重新打开后源码正确 | NOT TESTED | |

## Test Group G — Dirty / Close

| 场景 | 结果 | 备注 |
|---|---|---|
| Clean 文档直接点 X 关闭 | NOT TESTED | |
| 修改后 X → Cancel：窗口仍开且内容不变 | NOT TESTED | |
| 修改后 X → Don't Save：关闭且文件不含未保存修改 | NOT TESTED | |
| 修改后 X → Save：保存后关闭 | NOT TESTED | |
| Save 后重新打开，内容存在 | NOT TESTED | |
| Untitled 修改后 X → Save → Save As Cancel：窗口仍开 | NOT TESTED | |

## Test Group H — Save State

| 操作 | 结果 | 备注 |
|---|---|---|
| 编辑后状态为 Modified | NOT TESTED | |
| Save 后状态为 Saved | NOT TESTED | |
| 再编辑后状态回到 Modified | NOT TESTED | |
| Undo 回到保存内容后状态为 Saved | NOT TESTED | |
| Redo 后状态为 Modified | NOT TESTED | |
| Ctrl+S 后立即继续输入，新输入仍为 Modified | NOT TESTED | |

## Test Group I — File Format

用外部脚本或文本工具检查保存后的字节/行尾/BOM。每一种文件都实际 Open → 不修改或编辑 → Save → 检查。

| 格式/行为 | 结果 | 备注 |
|---|---|---|
| LF | NOT TESTED | |
| CRLF | NOT TESTED | |
| UTF-8 BOM | NOT TESTED | |
| UTF-8 无 BOM | NOT TESTED | |
| 有末尾换行 | NOT TESTED | |
| 无末尾换行 | NOT TESTED | |
| 空文件 | NOT TESTED | |
| Mixed EOL 显示 warning | NOT TESTED | |
| Mixed EOL 保存后采用 dominant EOL | NOT TESTED | |

## Test Group J — Large Documents

依次打开 `manual-tests/05-large-100k.md`、`06-large-500k.md`、`07-large-1mb.md`。不要只根据是否崩溃判断性能；每个文件记录主观感受。

体验等级只填写：`Smooth`、`Minor lag`、`Major lag`、`Freeze`、`Crash`。

| 文档 | 体验 | 备注 |
|---|---|---|
| 100k characters | NOT TESTED | |
| 500k characters | NOT TESTED | |
| 1 MiB (1,048,576 characters) | NOT TESTED | |

每个文档分别执行：

| 操作 | 结果 | 备注 |
|---|---|---|
| 顶部滚动到底部 | NOT TESTED | |
| PageUp / PageDown | NOT TESTED | |
| 点击不同位置 | NOT TESTED | |
| 快速输入 | NOT TESTED | |
| 快速删除 | NOT TESTED | |
| Undo | NOT TESTED | |
| Ctrl+F | NOT TESTED | |
| Live Preview | NOT TESTED | |

## Bug Reports

每个失败单独复制以下模板；不要把多个失败合并成一个 BUG。

~~~text
BUG-ID:

测试组:

操作步骤:

Expected:

Actual:

是否可稳定复现:

严重程度: P0 数据丢失/崩溃 | P1 核心编辑不可正常使用 | P2 明显体验问题 | P3 边缘问题
~~~

## Acceptance Summary

用户完成测试后，在每项结果列填写且只填写 `PASS`、`FAIL` 或 `NOT TESTED`。尚未执行的项目保持 `NOT TESTED`；所有失败均须填写 Bug Reports。
