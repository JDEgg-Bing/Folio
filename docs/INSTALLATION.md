# 安装、更新与卸载 / Installation

## 获取安装包

当前 1.2.0 是预发布版。从 [GitHub Releases](https://github.com/JDEgg-Bing/Folio/releases/tag/v1.2.0) 下载标为 Pre-release 的 `Folio-1.2.0 Setup.exe`，同时下载 `SHA256SUMS.txt` 和第三方声明压缩包。源码压缩包不是安装包。

在下载目录用 PowerShell 核对 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\Folio-1.2.0 Setup.exe'
```

与 `SHA256SUMS.txt` 对应行比较完整的 64 位结果。校验只能确认文件一致；安装包尚未代码签名，不能借此证明发布者身份。若系统显示安全提示，请先核对来源和文件。

## 安装和更新

按中文向导操作。默认 `%LOCALAPPDATA%/Programs/Folio`，按当前用户安装，无需管理员权限；桌面快捷方式可选。安装注册 `.md`／`.markdown` 的“打开方式”，默认应用由 Windows 设置管理。

更新前保存文稿并退出轻页，再运行新安装包。旧 Squirrel 安装如被检测到，向导提供安装成功后整理旧程序的可选项；选择与旧版不同的位置。真实旧 Squirrel 1.0.0 迁移仍未验证，先备份自己的文稿和数据目录。

## 卸载和重装

在 Windows“设置 → 应用 → 已安装的应用”找到 Folio 并卸载。卸载移除程序、快捷方式和本版本打开方式入口，保留用户资料；重装后可继续读取。

| 内容 | 位置 |
| --- | --- |
| Markdown 文稿及图片附件 | 你保存的位置及相邻 `.assets` 目录 |
| 设置、Word 模板、恢复草稿 | `%APPDATA%/Markdown Editor` |
| 默认程序目录 | `%LOCALAPPDATA%/Programs/Folio` |

应用 F1 指南及“帮助 → 关于轻页”可查看数据位置。备份时退出应用后复制数据目录；它可能包含未保存文稿。若自行清理数据，请先备份并确认不再需要。卸载本身不会代你清理。

## English

1.2.0 is a pre-release. Download the installer, checksums and notices from [GitHub Releases](https://github.com/JDEgg-Bing/Folio/releases/tag/v1.2.0). Verify the full SHA-256 with the command above. The installer is unsigned; the checksum is not publisher authentication.

The Chinese wizard installs per-user to `%LOCALAPPDATA%/Programs/Folio` by default, without admin privileges. A desktop shortcut is optional. Save and exit before updating. Use a separate location for legacy Squirrel installations; actual 1.0.0 migration remains unverified.

Uninstall through Windows Settings → Apps. Documents and attachments stay where saved; preferences, Word templates and recovery drafts stay in `%APPDATA%/Markdown Editor`. Reinstallation can reuse them. Exit before backing up this directory and treat it as potentially sensitive.
