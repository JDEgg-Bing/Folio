# Folio 1.2.0 发布验收

2026-10-04。当前为预发布版。视觉与交互沿用[统一规范](DESIGN_SYSTEM.md)。历史阶段报告不用于放行重新打包后的文件。

## 当前可复现检查与放行入口

| 检查 | 内容与证据 |
| --- | --- |
| 开源材料检查 | `npm run oss:check`：MIT 元数据、本地文档链接、首页图片与个人路径 |
| 类型检查与测试 | `npm run typecheck`、`npm test`；开源准备后 29 个文件、410 项用例，新增拒绝旧构建证据的检查 |
| 全新源码构建 | Node 22、锁定依赖、无历史 out 目录，按开发指南安装、检查、打包与编译安装包 |
| 当前桌面回归 | `npm run release:acceptance`；每次结果位于本地 out/release-acceptance/run-*/results.json |
| Word 模板回归 | `node scripts/word-template-acceptance.cjs`；本地 out/word-templates/run-*/desktop-results.json |
| 安装、卸载、重装 | `npm run release:lifecycle`；本地 out/journey-design/lifecycle-results.json |
| 最终发布门槛 | `npm run release:manifest` 校验版本、app.asar、完整应用目录及安装包哈希；失败记录和旧构建 PASS 均拒绝 |
| 发布资料 | out/releases/Folio-1.2.0-win32-x64/public；原始诊断记录在同级 private-diagnostics，不上传 |
| 授权与签名 | 自有部分 MIT；第三方保留原许可；安装包未代码签名，清单记录 NotSigned |

可复现命令和前置条件见[开发指南](DEVELOPMENT.md)。最终执行结果以本次 `public/manifest.json` 与对应的本地验收记录为准，文档中的检查清单不代替实际执行。

## 桌面与安装检查的实际边界

桌面验收启动打包的 Folio.exe，使用独立 profile 和临时文稿。文件选择器由测试替身提供路径；应用内确认框实际渲染并通过界面按钮操作。PDF／DOCX 实际生成，检查内容、表格、公式、图片、源文稿不变与取消／失败重试。明暗、小窗口及 100%／125%／150%／200% 应用缩放覆盖，不等于物理 Windows DPI 验证。

生命周期验收从真实应用界面生成设置和模板，显式生成恢复草稿及外部文稿附件。逐文件校验卸载／重装前后的 SHA-256，并通过重装的实际可执行文件读取设置、模板与恢复文稿。测试安装器使用与生产包相同的应用资源，但专属 AppId、ProgID、安装目录、快捷方式、profile 和向导自动推进驱动不同；生产包不含该驱动。

升级只在显式提供真实旧版应用与对应测试安装包时执行；未提供时记录 `NOT_RUN`。历史上曾完成同一隔离 Inno 身份的 1.1.0→1.2.0 升级，这不是实际 Squirrel 1.0.0 迁移的证据，也不放行本次安装包。用户既有安装不被测试替换或卸载。

## 已完成设计修复的历史背景

欢迎页缩短为三步；未保存与覆盖采用统一确认；导出版式使用单选卡片；恢复草稿丢弃与模板删除有明确取消路径。嵌套确认的 Esc 保留父窗口。完整流程说明见[设计验收记录](JOURNEY_DESIGN_ACCEPTANCE.md)，其中旧日志留作本地历史资料。

## 尚未验证

- 实际旧 Squirrel 1.0.0 迁移与旧程序清理。
- 实体中文输入法、物理鼠标拖窗、系统 DPI 与多显示器切换。
- 第二台无开发依赖电脑、目标电脑字体与 Word 兼容性。
- 3–5 人持续一周写作，见[试用计划](TRIAL_PLAN.md)。

恢复不能保证异常前最后一小段输入，不能替代保存；外部修改比较与写入没有跨程序锁。Word 特殊封面、多节、多栏与字体分页限制见[使用指南](USER_GUIDE.md)。当前 Chromium 部分中文字体的 PDF 文本抽取限制仍存在；抽取失败不能直接等同于视觉缺字。

当前适合限定试用与预发布；不宣称稳定版、完整无障碍合规或跨平台支持。GitHub 仓库、真实下载反馈链接与私密报告入口按[公开发布清单](OPEN_SOURCE_RELEASE.md)配置后再公开。
