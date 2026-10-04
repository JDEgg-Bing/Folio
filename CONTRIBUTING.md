# 参与 Folio / Contributing

欢迎改进文档、文稿保护、排版、可访问性与构建体验。先阅读[行为准则](CODE_OF_CONDUCT.md)。

小型修复可直接提交 PR；较大的交互改动、新依赖和新功能，先在 Issues 说明使用场景与方案。没有 CLA；贡献者保留版权，自有贡献采用 MIT，不改变第三方许可证。

按[开发指南](docs/DEVELOPMENT.md)准备环境。提交前完成 `npm run oss:check`、`npm run typecheck`、`npm test`；涉及应用或资源还需 `npm run package`。安装、恢复、导出或模态交互的变化，应完成对应真实桌面验收。测试覆盖用户行为和失败路径，文档更正无需重复实现的测试。

保持 PR 聚焦，解释用户问题、结果和验证范围。遵循[视觉与交互规范](docs/DESIGN_SYSTEM.md)，中文与英文首页保持一致。不提交依赖、安装包、私人文稿、用户模板或未脱敏日志。示例需有清楚的来源与许可。安全问题按[安全政策](SECURITY.md)私密报告。

## English

Documentation, document protection, typography, accessibility and build improvements are welcome. Read the [code of conduct](CODE_OF_CONDUCT.md). Submit small fixes directly; discuss substantial interaction changes, dependencies and features in Issues first.

There is no CLA. Contributors retain copyright and submit their own contributions under MIT; third-party licenses remain intact. Follow the [development guide](docs/DEVELOPMENT.md). Run `npm run oss:check`, `npm run typecheck` and `npm test`; package application/resource changes and run relevant real desktop acceptance for installation, recovery, export or modal interactions.

Explain the user-visible problem, resulting behavior and verification limits. Keep both READMEs aligned. Exclude generated artifacts and private data. Use licensed examples and anonymized screenshots. Report vulnerabilities through the [security policy](SECURITY.md).
