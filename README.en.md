<p align="right"><a href="README.md">简体中文</a> · English</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.svg">
  <img src="docs/images/hero-light.svg" alt="Folio · 轻页 — Write quietly. Express clearly." width="1200">
</picture>

<p align="center">
  <strong>A local Markdown editor for focused writing.</strong><br>
  See the markup when you need it, read the text when you don't. Export with a considered layout.
</p>

<p align="center">
  <a href="#download-and-install">Download &amp; install</a> ·
  <a href="docs/USER_GUIDE.md">User guide (中文)</a> ·
  <a href="docs/DEVELOPMENT.md">Development</a> ·
  <a href="SUPPORT.md">Support</a>
</p>

<p align="center"><code>1.2.0 release candidate</code> &nbsp; <code>Tested on Windows 11 · x64</code> &nbsp; <a href="LICENSE">MIT</a></p>

<p align="center"><a href="https://github.com/JDEgg-Bing/Folio/actions/workflows/ci.yml"><img src="https://github.com/JDEgg-Bing/Folio/actions/workflows/ci.yml/badge.svg?branch=main" alt="Windows checks"></a></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/writing-dark.png">
  <img src="docs/images/writing-light.png" alt="The running Folio editor, with headings, equations, a table and paragraphs in the shared sample document" width="1120">
</picture>

## A little more room for your words

- **One document, one writing surface.** Write Markdown directly. The active paragraph exposes markup; other paragraphs use a reading presentation. Navigate longer documents with the outline.
- **Equations, tables and images.** LaTeX equations, tables, local images, numbering and cross-references support notes and technical manuscripts.
- **Take the finished document with you.** Export PDF or editable Word documents. Choose a built-in layout, or import a DOCX/DOTX template and review its format mappings.
- **Set your own reading rhythm.** Light and dark themes, fonts, text size, spacing and accent colors. Writing appearance and export layout have separate settings.
- **Keep track of unsaved work.** Unsaved-change decisions, local recovery drafts and external-file-change checks make document state clearer. Drafts do not replace saving.
- **Keep your files.** No built-in account, cloud sync, telemetry or automatic update service. Save documents wherever you choose.

<details>
<summary><strong>Explore dark mode and Word templates</strong></summary>

![Folio in dark mode, displaying the same sample document](docs/images/writing-dark.png)

![Folio Word template dialog, with body and heading mappings for review](docs/images/word-template.png)

All three screenshots show the running 1.2.0 application and the same [sample document](docs/examples/quiet-writing.md). The application and installer currently use Chinese.

</details>

## Download and install

**1.2.0 is a pre-release.** Visit [GitHub Releases](https://github.com/JDEgg-Bing/Folio/releases/tag/v1.2.0) and download `Folio-1.2.0.Setup.exe` and `SHA256SUMS.txt`. This version is intended for trials and feedback; see the verified scope and remaining limits below.

1. Verify the checksum following the [installation guide](docs/INSTALLATION.md), then run the installer.
2. Follow the Chinese wizard to choose an installation folder and optional desktop shortcut. The default is a per-user installation without administrator privileges.
3. Open Folio and write. Installation adds an “Open with” option for Markdown; choose your default editor in Windows settings.

The installer is unsigned and Windows may display a security prompt. A checksum verifies that the download matches the published file; it does not authenticate the publisher. Windows 11 x64 has been tested. Other Windows versions, ARM, macOS and Linux have not been verified.

Update with a new installer. Uninstalling retains documents, image attachments, preferences, templates and recovery drafts. [Installation, updates, removal and data locations](docs/INSTALLATION.md)

## Start in three steps

1. Create or open a `.md` / `.markdown` file and write Markdown.
2. Save with **Ctrl+S**. When sharing a document with managed images, include its matching `.assets` folder.
3. Export PDF or Word from the File menu, choose a layout and review the result.

Useful shortcuts: **Ctrl+O** open · **Ctrl+F** find/replace · **Ctrl+Shift+O** outline · **F1** guide.

## Data and privacy

Documents stay in the location you choose. Preferences, templates and recovery drafts default to `%APPDATA%/Markdown Editor`; the historical folder name preserves compatibility. Uninstalling does not actively remove these data.

There is no built-in document upload or telemetry service. External links and remote images in a document, and downloading installers or development dependencies, may involve network access. Remove private content from documents, screenshots and logs before sharing feedback. [Full user guide (中文)](docs/USER_GUIDE.md)

## Current boundaries

- One document per window. Tabs, file workspaces, cloud sync and automatic updates are not available.
- Recovery drafts cannot guarantee the last input before power loss. External-change checks do not provide automatic merging or a cross-program write lock.
- Word templates do not fully reproduce special covers, multiple sections or columns, and floating objects. Fonts and Word versions can change pagination.
- Migration from an actual Squirrel 1.0.0 installation, real Chinese IME input, physical multi-monitor DPI, a second computer and extended trials remain unverified.

Read the [changelog](CHANGELOG.md), [acceptance coverage (中文)](docs/RELEASE_ACCEPTANCE.md) and [roadmap](ROADMAP.md).

## Help improve Folio

Read [support guidance](SUPPORT.md). Report bugs and suggestions through [GitHub Issues](https://github.com/JDEgg-Bing/Folio/issues/new/choose). Documentation, typography, accessibility and document protection improvements are welcome.

Start with the [contribution guide](CONTRIBUTING.md), [development guide](docs/DEVELOPMENT.md) and [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately following the [security policy](SECURITY.md).

## License and acknowledgments

Folio's own code, documentation and brand images use the [MIT License](LICENSE). Copyright © 2026 Folio Contributors.

Thanks to Electron, React, CodeMirror, KaTeX and the other projects that make Folio possible. Third-party components retain their own licenses. Word equation conversion uses mathml2omml under **LGPL-3.0-or-later**, which is not changed by Folio's MIT license. [Third-party notices](THIRD_PARTY_NOTICES.md)
