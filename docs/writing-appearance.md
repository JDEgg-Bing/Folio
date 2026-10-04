# 科研文书排版与 Writing Appearance

## 架构边界

- `preferences/WritingAppearance.ts` 定义独立排版配置及校验；`typographyPresets.ts` 集中定义预设组合与旧设置迁移。
- `PreferencesService` 提供不可变快照、订阅、单次预设应用和版本化存储。只有本地存储适配器访问 localStorage。
- `appearance/writingFonts.ts` 生成本地字体别名；`writingTokens.ts` 生成 CSS 变量；`writingTheme.ts` 消费变量并根据既有语法树处理可见行布局。
- `AppearanceDialog` 只修改 Preferences。数值与字体输入保留临时草稿，失焦显示校验后的值；预设切换同步各输入框。
- `editor/wordCount.ts` 在 CodeMirror StateField 保存增量字数，`ui/StatusBar.tsx` 展示文档元信息、字数和光标位置。
- Markdown 文档、编辑历史、选择、保存快照和 Document Title 不依赖 Appearance。应用排版不会派发编辑事务、重建 EditorState 或改写源码。React 没有完整 Markdown 副本。

未来模块可复用同一 Preferences / Token 边界。本轮没有新增模块、语法或主题系统。

## 默认预设与可调参数

| 参数 | 科研文书 · 衬线（默认） | 科研文书 · 无衬线 | 范围 |
| --- | --- | --- | --- |
| typographyPreset | scientific-serif | scientific-sans | 两套预设 / custom |
| chineseFontFamily | SimSun | Microsoft YaHei | 本地字体名或逗号分隔字体组，1–200 字符 |
| latinFontFamily | Times New Roman | Segoe UI | 同上；独立保存 |
| fontSize | 16px | 16px | 12–32px |
| lineHeight | 1.45 | 1.4 | 1.2–2.4 |
| paragraphSpacing | 0.5 行 | 0.5 行 | 0–2 行 |
| contentWidth | 1200px | 1280px | 360–1800px |
| headingScale | 1.12 | 1.1 | 1–1.35 |
| writingLayout | compact | compact | compact / centered |
| listIndent | 28px | 28px | 12–64px |
| quoteIndent | 20px | 20px | 8–48px |
| quoteBorder | 无 | 极细左线 | 开 / 关 |
| inlineCodeStyle | 仅字体 | 仅字体 | plain / subtle |

预设应用是一次完整参数写入；随后改变任意参数会成为“自定义”，不恢复或重新套用预设。再次选择预设才覆盖当前组合。细节参数折叠展示，界面全部采用中文。

非法数值回退默认值；有限数值限制范围并保留两位小数。字体字符串拒绝 CSS 规则、函数、控制字符及超长输入。

## 中英文字体组合

按设置生成 `@font-face` 本地字体别名，通过互不重叠的 `unicode-range` 路由。Latin/数字、希腊字母及常见数学字符优先英文配置；CJK 字符、全角标点优先中文配置。各组都有本地回退字体，最后使用系统通用字体。不下载或打包字体，不引入字体枚举系统。已安装的 Noto / 思源字体可在字体输入框选择或输入。

这些规则同时用于标题、正文和强调。行内及围栏代码保留等宽字体区别、采用正文相近字号、无圆角；轻底色可选。未安装字体会回退，效果依赖系统字体；当前不提示缺失字体。

## 文稿层级与布局

标题字号统一采用 `1 + (headingScale - 1) × factor`；H1–H6 系数分别为 `2, 1, 0.45, 0.15, 0.05, 0`，字重分别为 `700, 650, 620, 600, 580, 560`。标题行距 1.25，上间距为正文大小乘 `0.35, 0.30, 0.22, 0.16, 0.12, 0.08`，下间距乘 `0.15, 0.12, 0.08, 0.06, 0.04, 0.02`。无下划线、边框、彩色标题或背景。

衬线默认字号：H1–H6 约为 `19.84, 17.92, 16.86, 16.29, 16.10, 16px`。无衬线约为 `19.20, 17.60, 16.72, 16.24, 16.08, 16px`。字重实际呈现受字体可用字重及系统合成影响。

非活动源码空行显示为 `fontSize × lineHeight × paragraphSpacing` 的段间距；衬线默认 11.6px，无衬线 11.2px。活动空行保留正常行高，便于输入与光标定位；代码块内部空行保留正常行高。多个源码空行仍各占间距，不删除或折叠源码。零间距下保留最小 2px 命中高度。

列表项使用正文行距和稳定标记颜色、悬挂缩进，无额外项间留白。引用采用缩进和可选极细左线，不做卡片。非活动分隔线用低对比细线呈现；活动行恢复原始 Markdown。围栏代码非活动状态隐藏围栏及语言标记、弱化语法色；活动行保留源码。

设窗口可用编辑宽度为 W，两侧固定外边距 G = 24px，正文最大宽度为 C，则正文宽度 `min(C, W - 2G)`。Compact 左侧从 G 开始，剩余空间在右侧；Centered 将剩余空间平分。两种模式在小窗口均收缩，设置立即生效。正文最大宽度仍限制极宽屏幕上的行长。

## 持久化与迁移

继续使用 `markdown-editor.preferences.v1` 存储键以发现旧设置，写入载荷版本升级为 2。读取版本 1 时，旧 fontFamily 按字体名拆分中英文配置；旧像素段间距除以原字号与行距，转换成行单位。保留用户字号、宽度、布局等选择，标记自定义。新用户默认衬线预设。未知版本和损坏数据安全回退；存储失败通过中文提示报告，内存调整仍生效。

设置与文档完全分离，不向 Markdown 写私有 metadata，不把外观状态塞进 EditorState.doc。

## 状态栏

底栏 26px，无按钮。左侧显示磁盘文件名与已保存 / 已修改；未命名空白文档显示未保存。Document Title 仍独立用于原生窗口标题，H1 改动不会重命名磁盘文件。右侧显示字数与 `Ln x, Col y`。

字数基于 Markdown 源文：汉字逐字、其他字母和数字的连续串逐词，标点与空白分隔。初次加载按行统计；后续只减去受影响旧行、加上受影响新行的计数，同一行多次变化先合并，选区移动不重新统计。没有全文 HTML 渲染或 React 源码副本。

## 验证与限制

本轮新增 28 项测试（含新增边界参数用例），总计 113 项。覆盖两套预设、独立字体持久化、版本迁移、细调、布局、间距和宽度、源码不变、增量计数、撤销重做及状态栏。

桌面验收使用打包后的 Electron App 和隔离设置目录，打开同时包含 H1–H6、中英文正文、多段文字、列表、引用、行内代码、分隔线及围栏代码的 Markdown。运行证据位于忽略目录 `out/scientific-qa/`。

实际 Windows IME 候选词选择与原生文件选择对话框仍需人工验收。自动检查通过 Chromium composition/commit 事件验证中文合成输入，文件对话框返回临时路径，真实 IPC 和磁盘读写仍执行。

外观面板在小窗口需要滚动；缺失字体会自动回退，没有安装状态提示。活动空行回到正常行高会产生轻微段落高度变化。多个源码空行保留额外间距。Light/dark 继续采用既有系统颜色，无新主题系统。

## 本轮修改文件

- Preferences：`src/renderer/preferences/WritingAppearance.ts`、`PreferencesService.ts`、`typographyPresets.ts`。
- 字体与排版：`src/renderer/appearance/writingFonts.ts`、`writingTokens.ts`、`writingTheme.ts`。
- Editor 扩展与快照：`src/renderer/editor/wordCount.ts`、`EditorController.ts`、`createEditorState.ts`、`extensions/livePreview/index.ts`。
- 界面与菜单：`src/renderer/app/App.tsx`、`src/renderer/ui/AppearanceDialog.tsx`、`StatusBar.tsx`、`src/main/main.ts`。
- 样式：`src/renderer/styles/app.css`、`variables.css`。
- 测试：`tests/preferences/writingAppearance.test.ts`、`scientificTypography.test.ts`、`tests/editor/wordCount.test.ts`。
- 文档：`docs/writing-appearance.md`。

## 本轮最终验收结果

`npm run typecheck`、`npm test`（11 个测试文件 / 113 项）、`npm run package` 均通过。

打包 App 实际启动检查通过：衬线中英文使用 SimSun / Times New Roman，无衬线使用 Microsoft YaHei / Segoe UI；默认 1280px 窗口下衬线正文宽 1200px，左边距 24px、右余量 40px（含滚动条可用宽度差）；段间距实测 11.594px。H1–H6 无下划线。两种布局在 640×420 窗口无横向溢出。预设实时应用、细调保留、自定义重启恢复、状态栏保存状态、Undo/Redo、Search、打开/保存、标题与首次保存建议、合成中文输入、排版不改源码均通过。
