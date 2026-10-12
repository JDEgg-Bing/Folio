# Folio · 轻页 — 当前状态

当前维护版本：**1.2.2**。显示名 Folio，中文名轻页。当前交付使用完整中文 Inno 向导，AppId 为 `Folio.Desktop`；默认数据目录继续为 `Markdown Editor`。历史 Squirrel 构建标识 `markdown_editor_v1` 保留，实际旧 1.0.0 迁移尚未验证。

1.2.2 修复图片加载后的相邻文字命中和上下方向键布局跳动；图片独占一行即可完整预览，下一行可紧接文字。支持截图、复制图片和 Windows 资源管理器单张／多张图片粘贴，沿用 assets 管理、异步选区、保存与撤销保护。预览和 PDF／DOCX 共用图片行布局标记，具体测试与文件职责见[维护记录](EDITOR_MAINTENANCE.md)。

已实现：Markdown 编辑和实时预览、原子保存与未保存保护、增量字数、明暗主题与强调色、中英文排版、虚拟目录、离线公式、本地图片与托管附件、GFM 表格、内部引用、正式文稿 PDF／DOCX、Word 模板识别／确认／复用／重新识别。

1.2.1 新增本地图片裁剪：预览旁按钮与编辑菜单入口、拖选与像素范围、保留原图的 PNG 另存、当前图片引用更新、撤销／重做；保存重开、另存为、PDF／DOCX 复用托管附件流程。动图保存为静态图片；网络图片暂不支持裁剪。

发布准备新增：本地恢复草稿、保存前外部修改检查、单实例与系统文件打开、安装生命周期与“打开方式”注册、帮助／示例／版本／反馈、字体回退提示、导出取消／失败保留选择、发布资料与依赖许可证、自动 7-Zip 准备及 SHA-256 清单。

1.2.0 已落实统一视觉与交互规范：中文安装和卸载、三步欢迎、共享弹窗和按钮、保存／覆盖确认、单选导出版式、模板删除确认与恢复丢弃保护。已有写作画布和排版偏好延续。

## 当前证据

- [发布验收](RELEASE_ACCEPTANCE.md)：本次构建结果、证据、人工待验与放行条件。
- [使用指南](USER_GUIDE.md)、[版本说明](RELEASE_NOTES.md)。
- [视觉与交互规范](DESIGN_SYSTEM.md)、[全流程设计验收](JOURNEY_DESIGN_ACCEPTANCE.md)：本轮实际截图、完整旅程与证据边界。
- [Word 模板压力报告](word-template-stress-report.md)：之前 52 场景与 Word 验收，有明确能力边界。
- [产品身份记录](product-identity-review.md)、[视觉记录](visual-design-review.md)：历史界面和窗口验证。

## 历史范围

[V1_ACCEPTANCE.md](V1_ACCEPTANCE.md)、[MANUAL_ACCEPTANCE.md](MANUAL_ACCEPTANCE.md) 和 [V1 状态存档](V1_CURRENT_STATE_HISTORY.md) 保留旧事实，不代表当前版全部通过。图片、公式、表格、PDF／DOCX 等现已实现，旧缺失清单不再用于发布说明。

不提供多标签、云同步、自动更新或外部自动合并。字体依赖目标电脑。真实 IME、物理鼠标、多显示器 DPI、第二台电脑与旧安装升级以当前发布验收为准。
