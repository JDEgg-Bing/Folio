# Markdown 编辑器维护记录

## 1.2.2 图片与光标交互

日期：2026-10-12。保持现有 Lezer → DocumentModel → CodeMirror decorations 和独立导出架构。

问题定位与修复：

- 图片替换范围扩大到整个段落，且仅“独占段落”才能成为大图。改为语义层记录 `imageLayout`，独占源码一行即可成为图块；decoration 只覆盖图片源码，PDF／DOCX 通过共享分段函数依次输出相邻正文与图片。
- 图块上下外边距和裁剪按钮附加行干扰邻近正文。移除外边距，按钮定位在图片容器内；小图为控件保留容器尺寸，避免溢出到相邻文字。
- 图片加载后，即使 `requestMeasure` 已执行，编辑区的最小高度可能使外框尺寸不变，内部 height map 仍保存占位图高度。局部 ResizeObserver 通过测量请求和 StateEffect 更新 widget 的 `estimatedHeight`，修复加载后点击落在段尾的问题；保留已测量占位高度避免重新创建图片时闪缩。
- 键盘选区变化会恢复标记、增高空行并展开图片，视觉行导航使用了变化的布局。对原生上下移动／Shift 扩选事务加展示注解，保留预览选区；隐藏图片范围提供原生 atomic ranges，仍由 CodeMirror 计算视觉行和目标横坐标。
- 插图原来强制补两个换行，粘贴无入口。改为只补必要换行、连续图片单换行分隔；增加正文范围内的图片粘贴事件，复用图片票据、assets 导入和文档身份检查。支持原生文件、像素及 Windows STA 文件列表回退；普通文本、Markdown、网址保持原生粘贴。
- 异步粘贴书签记录粘贴时选区，映射无关编辑；选区内容被编辑则作废。取消保存、失败、切换文稿不会修改正文；成功是独立的单步撤销事务。

修改文件与职责：

| 文件 | 作用 |
| --- | --- |
| `src/document/model.ts` | 图片布局语义标记 |
| `src/document/DocumentStructureService.ts` | 独占源码行判断，包含缩进列表和引用 |
| `src/document/imageLayout.ts` | 导出共享段落分段，保持原语义树和源码 |
| `src/document/export/PdfRenderer.ts` | 按正文／图块顺序导出完整图片 |
| `src/document/export/DocxRenderer.ts` | 同一布局和尺寸判断，保留列表图片的编号上下文 |
| `src/renderer/editor/extensions/documentPreview.ts` | 精确替换范围、局部高度同步、图片点击与 atomic ranges |
| `src/renderer/styles/app.css` | 无上下外边距图块、容器内裁剪控件 |
| `src/renderer/editor/previewSelection.ts` | 原生垂直导航事务的展示注解 |
| `src/renderer/editor/createEditorState.ts` | 上下方向键及 Shift 的原生命令接入 |
| `src/renderer/editor/imageInsertion.ts` | 映射选区、最小换行、独立撤销事务 |
| `src/renderer/editor/EditorController.ts` | 粘贴选区书签入口 |
| `src/preload/preload.ts` | 正文局部 paste 事件和图片文件／像素快照 |
| `src/shared/desktopApi.ts` | 平台图片粘贴事件合同 |
| `src/renderer/platform/PlatformService.ts` | 平台接口 |
| `src/renderer/platform/ElectronPlatformService.ts` | Electron 事件转发 |
| `src/renderer/app/App.tsx` | 粘贴会话复用导入流程与文档身份检查 |
| `src/main/assets/clipboardImages.ts` | 隐藏 Windows STA 文件列表读取与像素回退 |
| `src/main/assets/registerAssets.ts` | 来源受限的图片字节／剪贴板 IPC |
| `src/main/assets/ImageAssetService.ts` | 与文件相同的格式、50 MiB、30 张及票据校验 |
| `tests/editor/imageEditing.test.ts` | 图文相邻、源码范围、导航展示、选区映射与撤销 |
| `tests/editor/imageInsertion.test.ts` | 最小换行与已有空行回归 |
| `tests/document/imageLayoutExport.test.ts` | PDF／DOCX 顺序、图片尺寸和列表编号 |
| `tests/files/imageAssets.test.ts` | 剪贴板字节导入和校验 |
| `scripts/editor-interaction-acceptance.cjs` | 真实鼠标、复制、加载／缩放／滚动、重复方向键验收 |
| `scripts/image-paste-acceptance.cjs` | 系统像素／文件列表、键盘／菜单、失败／取消／文稿切换验收 |
| `scripts/image-import-acceptance.cjs` | 拖入、菜单、重开及实际导出回归；显式点击正文避免误触裁剪 |
| `src/renderer/ui/HelpDialog.tsx`、`docs/USER_GUIDE.md` | 应用内外使用指南 |
| `package.json`、`package-lock.json`、`CHANGELOG.md`、`docs/CURRENT_STATE.md`、本文件 | 版本及维护记录 |

验证：459 项测试、TypeScript 和 OSS 检查通过。真实 Electron 编辑交互 14 项、打包版粘贴 12 项、拖入／菜单导入 9 项、裁剪 12 项通过。包括图片加载前后、80%／125% 缩放与滚动、相邻正文输入、正反拖选／双击／Ctrl+C、长行折行、粗体、嵌套任务／无序列表、连续上下移动与 Shift 扩选、文稿首尾、截图、Chromium Copy Image、Explorer 兼容 CF_HDROP 单／多文件、STA 回退、普通文本、导入失败、取消保存和异步切换文稿、保存重开、另存为及实际 PDF／DOCX。

桌面脚本使用隔离文稿和独立 user-data-dir。截图写入原生系统剪贴板；文件列表通过 Windows Forms 写入真实 CF_HDROP，使用 Electron／Chromium 原生键盘、鼠标与菜单输入。文件对话框结果和延迟失败场景由测试控制；这不等于人工操作物理鼠标、截图快捷键或资源管理器界面。证据保存在忽略目录 `out/editor-interaction/`、`out/image-paste/`、`out/image-import/`、`out/image-crop/`。

没有增加全局鼠标选择监听器，也未修改浏览器默认 Selection。表格／公式内部逐字映射仍沿用先点击进入源码的边界，未擅自重构编辑器。

重复验收时发现本机微信输入法 `wetype_server` 会在测试 Ctrl+C 后延迟复写系统剪贴板：图片样本经读回验证成功，随后在编辑器收到 paste 前变回先前文字，Win32 剪贴板所有者为该输入法进程。没有修改或关闭输入法。粘贴脚本移除场景前冗余的复制动作（精确选区已由替换结果验证，Ctrl+C 另由交互脚本验证），增加像素读回校验和失败诊断，连续三轮 12 项验收通过。编辑器仍按系统当时提供的内容粘贴，不缓存旧图片覆盖新剪贴板。

安装版复验：1.2.2 的原生图片上下文字输入、正反跨图拖选、双击复制、连续上下与 Shift 扩选 4 项通过；粘贴 12 项、导入 9 项、裁剪 12 项通过，包含实际 PDF／DOCX 导出。203 个安装程序文件与构建哈希一致，53 个原有用户资料文件及备份哈希一致，桌面和开始菜单入口指向新版。损坏图片失败场景使用受控的浏览器 File 字节事件进入真实 preload／IPC 校验，避免 Chromium 忽略损坏原生文件及输入法重写系统文件列表；正常像素、文件、键盘／菜单场景仍使用系统剪贴板。测试写文件列表的 PowerShell 冷启动等待延至 30 秒，生产读取超时保持 5 秒。

以下保留历史版本记录。

## 1.2.1 图片裁剪补充

问题定位：1.2.0 仅实现图片插入、资源解析和预览，未实现图片裁剪；不是用户文稿损坏或设置丢失。新增功能继续使用 CodeMirror 源文、PlatformService、受限 IPC 和 ImageAssetService，不更换解析或资源架构。

| 文件 | 作用 |
| --- | --- |
| `src/renderer/ui/ImageCropDialog.tsx` | 原生模态裁剪界面、拖选区域、像素输入、重置／取消、PNG 编码 |
| `src/renderer/editor/imageCrop.ts` | 像素边界与基于语法树的单图片源文替换；保留 alt／直接链接 title，引用式图片仅转换当前语句 |
| `src/renderer/editor/EditorController.ts` | 定位当前图片、提交独立的可撤销裁剪事务、预览操作回调 |
| `src/renderer/editor/extensions/documentPreview.ts` | 已加载本地图片旁显示裁剪按钮，按钮事件不触发源码切换 |
| `src/renderer/app/App.tsx` | 裁剪会话、文档身份和内容校验、保存位置保护、关闭后恢复编辑器焦点 |
| `src/shared/appMenu.ts` | “编辑 → 裁剪图片…”入口 |
| `src/shared/desktopApi.ts`、`src/preload/preload.ts`、`src/renderer/platform/PlatformService.ts`、`src/renderer/platform/ElectronPlatformService.ts` | 两个受限图片裁剪桥接方法 |
| `src/main/assets/registerAssets.ts` | 校验请求来源、文档句柄与参数 |
| `src/main/assets/ImageAssetService.ts` | 读取已有图片、验证 PNG 结果，复用串行导入、哈希命名、清单、回滚与另存迁移；原图不覆盖 |
| `src/renderer/styles/app.css` | 不覆盖正文的按钮和裁剪弹窗样式 |
| `src/renderer/ui/HelpDialog.tsx`、`docs/USER_GUIDE.md` | 内置及外部指南、入口发现与图片目录说明 |
| `tests/editor/imageCrop.test.ts`、`tests/files/imageAssets.test.ts`、`tests/ui/appMenu.test.ts` | 源文保留、引用隔离、撤销重做、边界、载荷验证、并发与菜单兼容 |
| `scripts/image-crop-acceptance.cjs` | 使用隔离资料和真实应用窗口验证裁剪像素、保存重开、导出与迁移 |
| `package.json`、`package-lock.json`、`CHANGELOG.md`、`docs/CURRENT_STATE.md` | 版本 1.2.1 与功能记录 |

验证：439 项测试通过，TypeScript 与 OSS 检查通过；真实打包窗口裁剪验收 12 项通过，包含相对／Windows 绝对／引用式图片、取消、拖动像素映射、原图保留、单步撤销重做、关闭预览后的菜单入口、重启、PNG 再裁剪、JPEG 裁剪、PDF／DOCX 与另存为。截图及报告存放在 `out/image-crop/`。裁剪上限 3200 万像素，PNG 载荷上限 24 MiB（含 base64）；动图结果为静态 PNG，网络图片沿用现有限制。

以下保留 1.2.0 维护记录。

日期：2026-10-12。范围：GFM 任务列表、无序列表、鼠标选择与图片导入。基于当前本地工作区实现，保留进入任务前已有的未提交改动。本记录涵盖编辑器修复；GitHub 推送与本机安装结果以部署操作回执为准。

## 阅读与架构结论

已阅读 README、ARCHITECTURE、CURRENT_STATE、长文档专题，以及 editor、preview、语义模型、图片服务、平台桥接和导出代码。

Markdown 源文只有 CodeMirror `EditorState.doc` 一个入口。`markdown({ extensions: [GFM, documentSyntax] })` 提供 Lezer 增量语法树：

1. `livePreview` 在可见范围遍历语法树，生成标题行样式、正文 mark 和标记替换 decoration。
2. `DocumentStructureService` 将同一语法树转换成带源码范围的 `DocumentModel`；`structureField` 和后台解析调度维护它。
3. `documentPreviewField` 消费模型，为公式、图片、表格和引用提供替换 widget。块级 decoration 由 StateField 直接提供。
4. PDF/DOCX 用完整语法树快照构建语义模型，独立输出；不读取编辑器 DOM 或当前选区。

`createEditorExtensions` 组合排版、历史、Markdown、结构模型、标题、字数、高亮、搜索、实时预览、折行及键盘映射。`EditorController` 添加图片书签、资源预览、滚动定位及 Compartment 中的图片解析服务。

图片路径：菜单／原生文件拖入 → preload → 主进程验证并生成票据 → 未保存文稿先保存 → `ImageAssetService` 复制图片与维护清单 → 平台返回相对链接 → 映射过编辑变化的书签 → 一次 CodeMirror 编辑事务。预览与导出共用主进程资源解析。

## 原因与修复

| 问题 | 原因 | 修复 |
| --- | --- | --- |
| 任务列表显示原始标记 | GFM 已生成 Task/TaskMarker，但预览未处理；语义转换把 Task 当 raw | 用局部 checkbox 替换 TaskMarker，点击只更改中间一个字符；Task 转成带 checked 状态的段落，保留内部格式与图片；PDF/DOCX 输出任务状态 |
| 无序列表显示连字符 | ListMark 没有预览转换 | 仅将 BulletList 的标记替换成圆点；任务项同一行的圆点隐藏；保留缩进、正文和有序编号 |
| 拖选偏移／失败 | 鼠标选区变化立即恢复标记和切换空行／widget 高度，命中布局在手势中变化；widget 吞事件且点击固定定位 | 预览位置与真实选区分离：select.pointer 沿用手势开始时布局，键盘编辑／显式定位恢复源码策略；后台无选择事务也不重置布局；普通 widget 让 CodeMirror 处理选择，非空选区不触发点击定位 |
| 后续任务段落可能隐藏父项 | Lezer 也允许同一列表项后续段落为 Task，直接从 ListMark 替换到 Task 会跨行 | 仅同一行隐藏任务项的列表前缀；后续任务保留父项正文与圆点，避免非法跨行 ViewPlugin 替换 |
| 菜单缺少插图 | 只有拖入入口 | 增加“编辑 → 插入图片…”及受限 asset:choose IPC，复用原有票据、保存保护、文档身份和异步书签 |
| 资源目录／路径兼容 | 新导入使用文稿名.assets；绝对 Windows 路径中括号前反斜杠会被当作转义；混合拖入会连非图片一起验证 | 新图片进入同目录 assets，保留哈希命名、去重、清单与回滚；保留旧链接和迁移；保护 Windows/UNC 分隔符；混合拖入仅处理支持的图片 |
| 并发导入丢清单风险 | 导入分别读取和覆盖清单 | 串行执行资源导入，失败后后续导入仍可执行 |
| 文末插图变行内图片 | 一个换行不能分隔 Markdown 段落 | 按已有 0／1／2 个换行补足段落边界，空结果不插入文字 |

没有全局鼠标选择监听器，没有调用 Selection API 修改浏览器选区，也没有建立第二套 Markdown 解析器或更换编辑核心。

## 修改文件与作用

以下仅列本次修改，不包含进入任务前已有的工作区改动。

| 文件 | 本次作用 |
| --- | --- |
| `src/renderer/editor/extensions/livePreview/index.ts` | 任务 checkbox、无序圆点、同一行前缀范围与稳定预览位置 |
| `src/renderer/editor/previewSelection.ts`（新增） | 保存用于预览的位置，保留 CodeMirror 对真实选区的管理 |
| `src/renderer/editor/createEditorState.ts` | 注册预览位置 StateField |
| `src/renderer/appearance/writingTheme.ts` | 空行与引用排版消费稳定预览位置 |
| `src/renderer/editor/extensions/documentPreview.ts` | widget 选择事件、点击保护及任务内图片边界 |
| `src/renderer/styles/editor.css` | 圆点与 checkbox 的局部样式 |
| `src/document/model.ts` | 增加任务段落 checked 状态 |
| `src/document/DocumentStructureService.ts` | 识别 Task，保留任务内格式和资源节点 |
| `src/document/export/PdfRenderer.ts` | 输出任务状态，正确区分任务与普通列表圆点 |
| `src/document/export/DocxRenderer.ts` | 输出任务状态并保留有序编号与图片 |
| `src/main/assets/ImageAssetService.ts` | assets 目录、并发清单保护及 Windows 路径修复 |
| `src/main/assets/registerAssets.ts` | 原生选图对话框与票据返回 |
| `src/preload/preload.ts` | 选图桥接及混合拖入图片过滤 |
| `src/shared/desktopApi.ts` | chooseImages 接口 |
| `src/renderer/platform/PlatformService.ts` | 平台选图契约 |
| `src/renderer/platform/ElectronPlatformService.ts` | Electron 选图接口适配 |
| `src/shared/appMenu.ts` | 插入图片菜单命令 |
| `src/renderer/app/App.tsx` | 菜单与拖入共用导入流程、保存保护及文档身份检查 |
| `src/renderer/editor/EditorController.ts` | 菜单使用当前光标建立图片书签 |
| `src/renderer/editor/imageInsertion.ts` | 独立段落边界与空结果保护 |
| `tests/editor/listPreview.test.ts`（新增） | 嵌套、大小写、有序列表、源码范围及选择布局回归 |
| `tests/editor/imageInsertion.test.ts`（新增） | 四种插入边界、空结果和失效书签 |
| `tests/document/taskLists.test.ts`（新增） | 语义状态、嵌套格式／图片及 PDF/DOCX 输出 |
| `tests/files/imageAssets.test.ts` | 新目录、旧目录迁移、重开、Windows/UNC、并发和失败恢复 |
| `tests/ui/appMenu.test.ts` | 新命令的共享菜单契约 |
| `scripts/editor-interaction-acceptance.cjs`（新增） | 当前编辑器源码在 Electron 中的真实鼠标／键盘验收 |
| `scripts/image-import-acceptance.cjs`（新增） | 打包应用的菜单、文件拖入、重开／重启和真实导出验收 |
| `README.md`、`README.en.md` | 更新附件分享说明 |
| `docs/USER_GUIDE.md` | 插图、任务列表和选择行为说明 |
| `docs/long-document-editing.md` | 更新预览位置策略、资源目录与兼容说明 |
| `docs/EDITOR_MAINTENANCE.md`（新增） | 本次定位、文件清单、验证与边界 |

## 测试结果

最终单元测试：**32 个文件、427 项全部通过**；基线为 29 个文件、410 项。类型检查、公开文档检查和 Windows x64 应用打包通过。

| 范围 | 验证结果 |
| --- | --- |
| `- [ ] todo`、`- [x] done`、`- [X] nested` | checkbox 状态正确；点击更新源码；撤销／重做正确 |
| 嵌套与普通无序列表 | 圆点正确、正文保留原生文本、源码不被预览改写 |
| 有序列表、代码块、转义标记 | 编号和原始编辑内容保留，不误识别为任务 |
| 正向／反向拖选 | 连续重复实测源码范围精确，修复基线 15→34 实际只到 32 的问题 |
| 双击与 Ctrl+C | Electron 输入与系统剪贴板结果正确；打包应用也通过 |
| 跨段落／公式／表格 | 选择中保持布局，复制对应完整 Markdown 范围；点击表格仍进入源码 |
| 菜单插图与取消 | 复制至 assets、插入相对链接；取消保持源码和附件不变 |
| 拖入图片与文本的混合文件 | 通过 Chromium 文件拖放输入走实际 preload/IPC，只导入图片 |
| 保存重开与应用重启 | 新 assets 与旧 .assets 图片均实际加载成功 |
| 未保存文稿取消保存 | 不插入图片，不创建文稿或新附件 |
| Windows／UNC／file URL／中文空格 | 路径解析单元测试通过 |
| PDF／DOCX | 打包应用真实导出三张本地图片和任务状态；DOCX 嵌入媒体检查通过；无资源诊断 |

最终桌面证据位于忽略目录：`out/editor-interaction/run-1791771121220/` 和 `out/image-import/run-1791771129580/`，包含 results.json、截图及导出文件。

复验：

```powershell
npm run typecheck
npm test
npm run oss:check
npm run package
# 使用已安装的 Playwright；外部安装可通过 MARKDOWN_PLAYWRIGHT_MODULE 指定包路径。
node scripts/editor-interaction-acceptance.cjs
node scripts/image-import-acceptance.cjs
```

## 保留的架构边界

鼠标选择保持当前预览布局；键盘编辑或移动光标才恢复当前行 Markdown 标记。列表正文是原生文本，其选择可精确映射至源码。

公式和表格仍为整段源码的替换 widget；渲染内部没有逐字源码映射。需要精确选择单元格／公式内部文字时，先点击进入源码。此次修复了跨 widget 的选区与复制，没有擅自重建表格编辑器。

桌面验收使用 Electron/Chromium 的真实鼠标键盘输入和系统剪贴板；文件对话框的返回结果由脚本控制，文件拖入由 Chromium 输入协议携带实际路径。这不等于人工操作物理鼠标、系统文件对话框或实体输入法的全面验收。
