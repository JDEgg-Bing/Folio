# Markdown 编辑器维护记录

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
