# Changelog

## 1.2.2 — 图片与光标交互

- 修正图片加载后的高度记录和相邻文字命中；裁剪按钮不再占用下一行。
- 图片独占一行即可完整预览，下一行可直接写文字；插入时不再强制添加空白段落，PDF／DOCX 使用同一布局判断。
- 上下方向键与 Shift 扩选保留预览布局，使用原生视觉行移动和图片 atomic ranges。
- 支持截图、复制图片及 Windows 资源管理器单张／多张图片的 Ctrl+V 和菜单粘贴；通过 assets 管理附件，保留选区、文档身份和撤销保护。

## 1.2.1 — 图片裁剪

- 增加预览图片旁的“裁剪”按钮和“编辑 → 裁剪图片…”入口。
- 支持拖选区域和像素范围调整，保存为 assets 中的新 PNG，保留原图和当前图片的替代文字；可撤销／重做。
- 已有本地图片与引用式图片可直接裁剪，保存、另存为及 PDF／DOCX 导出复用现有资源流程。

## 1.2.0 — 发布候选 / Release candidate

2026-10-04 · 首个公开预发布 · [`v1.2.0`](https://github.com/JDEgg-Bing/Folio/releases/tag/v1.2.0)。历史验收不代表最终安装包放行。

- 统一安装、首次使用、编辑、导出、设置、恢复和卸载的视觉与交互规范。
- 完整中文安装向导；默认按当前用户安装，快捷方式可选，保留用户数据。
- 统一未保存与外部覆盖确认、导出版式卡片、模板删除和恢复草稿丢弃流程。
- 覆盖明暗主题、小窗口、应用缩放、键盘焦点、取消与失败重试。
- 准备 MIT、双语首页、社区材料、第三方声明和可复现构建与验收入口。

First public pre-release, 2026-10-04, tag `v1.2.0`. Unifies installation-to-removal design, document decisions, export layouts and recovery interactions. Adds MIT, bilingual project pages, community materials, dependency notices and reproducible build/acceptance entry points.

## 1.1.0 — 历史本地构建 / Historical local build

历史构建，不表示曾公开发布。建立 Folio 品牌、本地恢复、外部修改检查、单实例与系统文件打开；完善公式、图片、表格、PDF、Word 及模板导出。

Historical local build, not a claim of public release. Introduced the Folio identity, recovery, external-change checks, single-instance file opening and richer PDF/Word workflows.

完整说明见[发布说明](docs/RELEASE_NOTES.md)。
