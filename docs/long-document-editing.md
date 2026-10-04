# 长文档编辑与中文体验

本轮在现有 CodeMirror 核心和排版设置之上增加结构模型、目录、公式、图片、表格、内部引用及导出边界。Markdown 源文仍只有 `EditorState.doc` 一个编辑入口。目录、编号、预览和外观设置不写入源文，不进入撤销历史。

## 使用方式

- “视图 → 文档目录”（Ctrl+Shift+O）打开目录。宽窗口右侧显示 260px 面板，窗口小于 960px 时覆盖显示，可关闭。目录按真实标题级别缩进，点击定位，按正文顶部阅读位置标记当前章节。
- “视图 → 文档预览”独立控制数学公式、图片、表格、内部引用。四项默认开启，目录默认隐藏。设置重启后恢复。
- 进入公式、图片、表格的源码范围后显示 Markdown；离开后恢复预览。合成输入期间保留已有预览 DOM，并映射其范围，结束后刷新，避免干扰输入法锚点。
- 公式支持 `$…$`、`\(...\)`、独占行的 `$$…$$` 与 `\[…\]`，排除代码、转义及常见金额。未闭合公式保留源码；渲染错误显示中文提示并可点击编辑。
- 图片支持本地 PNG、JPEG、WebP、GIF、BMP、AVIF、SVG，单张不超过 50 MB。相对路径以文档目录为基准。网络图片显示原语法与提示，不请求网络。
- GFM 表格支持对齐、粗体、斜体、代码、公式、图片与内部引用；宽表只在表格区域内横向滚动。点击整张表恢复源码编辑。

### 编号与引用

```markdown
## 研究方法 {#sec:methods}

![实验装置](论文.assets/device.png){#fig:device}

| 参数 | 数值 |
| --- | --- |
| E | 210 |
{#tbl:parameters}

$$
E = mc^2
$$
{#eq:energy}

参见 [@sec:methods]、[@fig:device]、[@tbl:parameters] 和 [@eq:energy]。
```

ID 后缀允许中英文字母、数字、点、下划线和连字符，长度 1–80。标题 ID 放末尾；图片 ID 紧邻图片；表格和独立公式 ID 放在紧接的下一行。仅显式 ID 的图、表、独立公式分别连续编号，章节引用显示规范化标题文字。重复 ID 不选择目标，缺失引用保留原文与中文提示；解析尚未完成时显示等待状态。

### 图片附件

拖入图片先绑定文档身份及插入位置，再进行异步验证与复制。未保存文档先选择保存位置，取消不复制、不插入。导入成功后通过一次编辑事务插入标准图片语法，可一次撤销／重做；撤销不删除附件。

首次导入创建 `<文档名>.assets/`，按内容哈希命名，资源清单 `.markdown-editor-assets.json` 留在该目录。跨目录另存复制源文仍引用的托管附件，保留附件目录名和相对链接；同目录另存不复制。外部图片不迁移，路径失效时在预览中提示。冲突、损坏清单、复制或文档写入失败都保护已有文件并回滚本次新附件。

## 架构边界

```text
CodeMirror 源文 + Lezer 增量语法树
  → DocumentStructureService → DocumentModel
      → Document Title / 文档目录 / 引用 / 内容预览
      → ExportAdapter（未来输出）
PreferencesService → Writing Tokens → 编辑器与内容样式
PlatformService → preload → 受限 IPC → ImageAssetService
```

| 模块 | 职责 |
| --- | --- |
| `src/document/markdownSyntax.ts` | 为既有 Lezer 解析器扩展公式、目标 ID、引用节点；不引入第二套 Markdown 解析器 |
| `src/document/model.ts` | 普通与扩展节点、源码范围、父子关系、文档身份／版本、解析完成状态、资源与引用索引；不包含 UI 对象 |
| `src/document/DocumentStructureService.ts` | 缓存未变化语法子树的语义结果，映射移动后的范围，构建标题／资源／引用索引和诊断 |
| `src/renderer/editor/documentStructure.ts` | CodeMirror 状态适配，只有文档或语法树改变才更新模型 |
| `StructureParsingScheduler.ts` | 每 25ms 安排有限解析时间片，每片最多推进 10,000 字符、5ms；执行时读取最新编辑状态，销毁时取消任务 |
| `documentPreview.ts` | StateField 直接提供块级装饰，缓存公式结果，DOM 展示消费统一模型与 Writing Tokens |
| `DocumentOutline.tsx` | 28px 固定行高的虚拟列表，仅渲染窗口附近条目；响应面板尺寸变化 |
| `imageInsertion.ts` | 用 CodeMirror 变化映射异步插入书签，独立历史事务 |
| `src/main/assets/` | 验证本地图片、受控资源 URL、导入票据、托管附件与另存回滚；渲染进程不访问文件系统 |
| `ExportAdapter.ts` | 完整模型、排版快照、资源读取与取消信号；以文档身份和版本验证输入，预留 pdf/docx，未实现实际输出 |
| `src/shared/chinese.ts`、`src/main/menu.ts` | 中文界面文案、CodeMirror phrases、中文错误映射及显式 Electron 菜单标签 |

结构服务缓存语义转换，但更新索引仍需要遍历当前语义模型；这不是每键全文 Markdown→HTML 或全文正则处理。超大且包含密集资源／引用的文档还需要持续测量。后台任务只处理当前状态，不发布旧文档结果。

KaTeX 0.18.10 的 CSS 与字体随 App 打包，离线可用。设置 `trust: false`、宏展开上限 1000、异常尺寸上限 20em、公式源码上限 50,000 字符，128 项结果／错误缓存。选项依据 [KaTeX 官方说明](https://katex.org/docs/options)。增量解析扩展依据 [Lezer Markdown](https://github.com/lezer-parser/markdown)。

## Preferences 与中文化

统一 Preferences 载荷升级为版本 3，兼容版本 1、2，保留原排版设置。新增 `documentFeatures`：`outlineVisible`、`mathPreview`、`imagePreview`、`tablePreview`、`referencePreview`。所有开关独立；关闭预览不停止结构解析。

应用菜单、设置、弹窗、按钮、提示、状态栏、搜索／替换／跳转行及可访问性标签使用中文。未命名文档显示“未命名文档”，状态栏显示“行 / 列”。真实文件名、字体专名、Markdown／LaTeX、产品包名及原有 `Untitled.md` 文件名建议规则保留。底层异常只用于诊断，界面不显示英文 IPC 前缀或堆栈。

## 验证与限制

自动测试：163 项，15 个测试文件，全部通过；相对原 113 项新增 50 项。覆盖结构与范围、语法增量更新、后台解析取消、公式边界、安全渲染、表格、四类引用、迁移／持久化、中文菜单、源文／dirty／历史隔离、图片书签与 Undo/Redo、资源冲突／清单损坏／回滚、导出版本与取消契约。

打包 App 的自动桌面验收使用隔离配置目录、原生文件系统与 IPC，文件对话框返回路径由脚本提供。已验证本地受控图片加载、四类引用跳转、公式／表格源码切换、中文搜索、预览开关、保存、附件跨目录另存、窄窗口覆盖目录、重启恢复、20,000 行／1,001 个标题的后台解析与虚拟目录。性能数字为本机单次测量，不是跨设备保证。

本机最新一轮：20,000 行结构／目录完成约 1.18 秒，文档末尾输入约 16ms。桌面脚本为 `scripts/desktop-acceptance.cjs`，先执行打包，再用 Node 运行；需要可用的 Playwright 模块和 Electron 宿主，可用 `MARKDOWN_PLAYWRIGHT_MODULE`、`MARKDOWN_ELECTRON_EXECUTABLE` 指定路径。脚本不额外安装依赖，每次在 `out/long-document-qa/run-…/` 创建隔离样例、设置与截图，不接触用户文档。

实体中文输入法候选窗口、人工原生拖放与真实文件对话框交互仍需人工验收；自动化的合成输入和原生文件拖入事件不能替代这些检查。超宽公式／表格、图片加载后复杂滚动布局以及大量高分辨率图片的压力场景尚未全面覆盖。网络图片、Word 导出未实现。上述测试数量为该阶段历史记录；当前已完成独立正式文稿 PDF 导出，详见 [PDF 导出](pdf-export.md)。

人工样例：[长文档验收文稿](../manual-tests/long-document.md)。最终检查运行 `npm run typecheck`、`npm test`、`npm run package`。
