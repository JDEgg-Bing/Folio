# 开发与构建 / Development

## 环境与安装

Windows x64、Node.js 22 LTS、随 Node 提供的 npm。当前桌面验证在 Windows 11 x64；Node 24 也在本地验证，但 CI 使用 Node 22。从 GitHub 下载或克隆源码后，进入源码目录：

```powershell
npm run setup
npm run oss:check
npm run typecheck
npm test
npm start
```

`setup` 使用锁定文件执行依赖安装，再准备 Electron、esbuild 和 Windows 7-Zip 构建运行时。首次需要联网；不依赖已有 `out/` 目录。不要用无说明的手动替换来修复依赖。开发窗口不是发行包。

## 构建安装包

```powershell
npm run package
```

应用输出 `out/Folio-win32-x64/Folio.exe`，自动附带 MIT 与第三方许可。安装编译器从 [Inno Setup 官方网站](https://jrsoftware.org/isdl.php)获取 **6.7.3**，核对 Authenticode 发布者 Pyrsys B.V.，然后配置其 `ISCC.exe`：

```powershell
$env:FOLIO_ISCC = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
npm run release:installer
```

也可将已验证编译器放在 `out/build-tools/inno/`。正式安装包输出 `out/make/folio.windows/x64/Folio-1.2.0 Setup.exe`；相邻 `.build.json` 绑定应用目录与安装包哈希。发布资料生成时使用 GitHub 兼容的文件名 `Folio-1.2.0.Setup.exe`，文件内容保持一致。旧 Squirrel `npm run make` 仅保留兼容用途，当前正式入口为 `release:installer`。

## 桌面与安装验收

自动桌面验收需要 Playwright 的 Node 包，不要求下载浏览器运行时。本轮使用 1.62.1；可通过 `npm install --no-save --package-lock=false --ignore-scripts playwright@1.62.1` 临时安装；或将 `MARKDOWN_PLAYWRIGHT_MODULE` 设置为外部已安装包的完整路径。临时安装后若依赖变化，请重新 `npm run setup`。不要提交临时依赖修改。

```powershell
npm run release:acceptance
node scripts/word-template-acceptance.cjs
npm run release:installer -- --test
npm run release:lifecycle
npm run release:manifest
```

默认实际启动打包的 Folio.exe，使用隔离 profile。可用 `FOLIO_ACCEPTANCE_EXECUTABLE` 指定另一个实际可执行文件。桌面验收会控制本次测试的文件对话框并测试崩溃恢复，不能替代真实输入法、物理 DPI 和持续试用。

生命周期验收使用专属 AppId、注册表入口、快捷方式、安装目录和 profile，验证新装、卸载、重装、逐文件哈希及实际数据读取。测试安装器与正式包使用相同应用文件，但注册身份不同；不要把这一结果写成真实旧 Squirrel 迁移已通过。

如有真实旧版包，可显式指定：

```powershell
node scripts/installer-acceptance.cjs extract-previous --previous-package '.\previous-full.nupkg'
npm run release:installer -- --test --application-dir '.\out\journey-design\previous-application'
npm run release:lifecycle -- --previous-application '.\out\journey-design\previous-application'
```

没有旧版包时，升级结果为 `NOT_RUN`；其他安装验收仍可从零运行，不借用历史测试目录。兼容单步驱动支持 `protect-data --source-profile <path>`；常规生命周期命令会通过真实应用生成自己的数据。

## 发布门槛与输出

`release:manifest` 要求本次应用的桌面、Word、安装生命周期验收均通过，并验证版本、app.asar 哈希、完整应用目录哈希与编译后安装包哈希。重新打包后需重做验收，旧 PASS 不能放行。

可用 `--desktop-results <file>`、`--word-results <file>`、`--lifecycle-results <file>` 指定记录。失败时不会生成新发布资料。

- `out/releases/Folio-1.2.0-win32-x64/public/`：可上传的安装包、声明压缩包、MIT、说明、清单和 SHA-256。
- 同级 `private-diagnostics/`：原始验收记录，仅供本地核对，不上传。

公开前按[发布清单](OPEN_SOURCE_RELEASE.md)检查。GUI 验收需交互式 Windows 桌面；CI 只做静态检查、测试和应用打包，其产物不是发布放行结果。

## 第三方库的替换与重建

mathml2omml 使用 LGPL。按 [DOCX 组件说明](docx-third-party-notices.md)替换兼容包或修改其源码后，重新 `npm run package` 和 `npm run release:installer` 即可使用新转换实现。发行资源提供准确组件文件、源码映射提取的原始源文件及 GPL/LGPL 文本。修改后分发时说明自己的更改并满足其许可证。

## English

Use Windows x64, Node 22 LTS and npm. Run the first command block to install locked dependencies, validate materials, typecheck, test and start development. `npm run package` builds the application. Install verified Inno Setup 6.7.3, set `FOLIO_ISCC` and run `npm run release:installer`.

Desktop checks need the Playwright Node package (no browser download); point `MARKDOWN_PLAYWRIGHT_MODULE` to it if installed externally. The commands above exercise the packaged executable and an isolated installer identity. No old package is required; unavailable upgrade coverage is reported as `NOT_RUN`. Pass an actual previous application explicitly for upgrade coverage.

`release:manifest` rejects stale build evidence and separates uploadable files in `public/` from private diagnostics. CI artifacts are not accepted releases. See the [release checklist](OPEN_SOURCE_RELEASE.md) and [LGPL replacement/rebuild guidance](docx-third-party-notices.md).
