# GitHub 公开发布清单

## 已准备的本地入口

中文与英文首页、MIT、第三方声明、贡献指南、安全政策、行为准则、支持说明、Issue 表单、PR 模板、变更记录、路线图、Windows CI 和每周依赖检查。该列表表示文件已准备，不表示 GitHub 平台已启用。

## 创建仓库后

- 确认最终仓库名称与公开范围，再添加真实 Git remote；不要填写虚构账号。
- 在项目元数据补充真实 `repository`、`homepage`、`bugs.url`，把 README 中的 Releases／Issues 操作说明更新为真实链接。中英文一起更新，公开发布时更新候选状态和 CHANGELOG 日期。
- 设置简介、主题与社交预览，可使用现有品牌横幅。按需开启 Issues，初期不要求开启 Discussions。
- 启用 Security 私密漏洞报告、依赖图、Dependabot Alerts；检查每周更新配置生效。
- 等 Windows checks 在真实仓库首次运行通过，再添加真实 CI 徽章。核对 PR 表单和社区资料能被 GitHub 识别。
- 根据维护权限启用默认分支保护和检查要求；不要先设定一个从未运行的检查名称。

## 提交前隐私与来源检查

运行 `npm run oss:check`，再执行 `node scripts/oss-audit.cjs`。审查当前文件和所有可达 Git 历史；报告只记录路径、提交与行号，不打印疑似密钥值。自动扫描不是完整安全审计，还需人工确认文稿与模板来源。

历史归档 `MarkdownEditor_V1_Audit.zip` 和 `manual-tests/Untitled.md` 保留本地并忽略；`out/`、profile、原始日志和安装包不提交。已有研究记录保留，但公开文档不包含用户个人绝对路径。如发现历史密钥，先撤销密钥；历史清理须单独决定，不自动改写历史。

本次扫描在历史版本的 CURRENT_STATE 中发现 4 处个人本机路径，当前公开文件已去除；未发现扫描规则覆盖的密钥模式。原始 Git 历史保留，未改写。若不希望公开旧路径，可运行 `node scripts/source-snapshot.cjs --directory out/open-source/new-public-source`，从导出的干净源码快照建立新的公开仓库历史。快照不带 `.git`，不会破坏原仓库；提交前仍需人工复核。

## 制作首个预发布

1. 从最终源代码完成锁定安装、材料检查、类型检查、测试、打包与安装器编译。
2. 对该构建完成桌面、Word 和隔离安装生命周期验收。记录未验证项，不以历史 PASS 替代。
3. 执行 `npm run release:manifest`，检查 `public/manifest.json` 和每个发布文件的 SHA-256。
4. 从对应源代码提交创建 `v1.2.0` 标签，创建 **Draft release**，勾选 **Pre-release**；复制发布说明，上传仅 `public/` 中的文件。
5. 确保源码、mathml2omml 原始源码／文本和重建步骤可取得；检查下载、反馈和漏洞入口后再公开草稿。

真实 IME、物理多显示器 DPI、第二台电脑、旧 Squirrel 迁移和持续试用未完成前，维持预发布定位。当前包未签名，不宣称已通过代码签名或所有系统验证。

## English

Local materials do not enable GitHub settings. After creating the repository, configure real metadata and links, private vulnerability reporting, dependency alerts and branch checks. Add CI badges only after the workflow runs. Scan the working tree and reachable history, manually review content provenance, and exclude private logs and profiles.

Build and accept the final application, run `release:manifest`, tag the matching source and create a draft **Pre-release**. Upload only the `public/` outputs; verify downloads and reporting channels before publication. Keep unverified environments explicit.
