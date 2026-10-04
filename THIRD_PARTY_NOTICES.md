# 第三方组件 / Third-party notices

Folio 自有部分采用 [MIT](LICENSE)。依赖、运行时、打包工具及随附素材保留各自许可证；本文件不将它们重新许可为 MIT。

## 实际发行资料

`npm run release:prepare` 从锁定文件及安装的准确版本生成组件清单、复制许可证，并加入 Electron／Chromium 与 Inno Setup 声明。准备过程对缺失许可证或版本不一致报错。最终应用 `resources/release-resources/` 包含：

- `LICENSE`：Folio MIT。
- `THIRD_PARTY_NOTICES.md` 和 `dependency-manifest.json`：本次构建组件及版本。
- `third-party-licenses/`：组件许可原文，包括 Electron、Chromium、Inno Setup，以及 GPL/LGPL。
- `mathml2omml-source/`：从准确源码映射提取的原始文件及来源记录。

原始 mathml2omml 包也位于应用 `resources/mathml2omml/`；公开发布声明压缩包一并携带。库中的其他原始源文件保留其上游声明。

## 关键组件

Electron／Chromium 提供桌面运行时，React 与 CodeMirror 提供界面和编辑基础，KaTeX 提供公式渲染，fflate 提供 ZIP，image-size 读取图片尺寸。具体版本和许可以发行清单及附带原文为准。

Word 公式转换使用 **mathml2omml 0.5.0，Johannes Wilm，LGPL-3.0-or-later**。随包提供 LGPL v3、GPL v3、准确库文件与原始源码，并说明替换与重建流程。完整说明见 [DOCX 组件说明](docs/docx-third-party-notices.md)。

## English

Folio's own material is MIT. Third-party code, runtime and tools retain their licenses. Release preparation checks locked versions and collects original notices, including Electron/Chromium, Inno Setup and GPL/LGPL. Exact versions are listed in the bundled manifest.

mathml2omml 0.5.0 by Johannes Wilm is LGPL-3.0-or-later. The release includes the package, original source extracted from its source map, both license texts, and [replacement/rebuild instructions](docs/docx-third-party-notices.md). MIT does not replace its license.
