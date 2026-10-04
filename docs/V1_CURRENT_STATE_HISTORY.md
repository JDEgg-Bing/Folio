# Markdown Editor V1 — Current State

## V2 当前实现（2026-10-01）

现已在原编辑核心上建立科研文书排版、Preferences v3、统一文档结构模型、可关闭的虚拟目录、离线 KaTeX 公式、本地图片与托管附件、GFM 表格预览、四类内部引用，以及独立正式文稿 PDF 导出。应用自有界面已中文化，正文首行 2em 缩进与两端对齐、非活动引用细线、目录跳转章节同步和窗口／状态栏文档名称同步已完成。详见 [长文档编辑与验收](long-document-editing.md) 和 [PDF 导出](pdf-export.md)。typecheck、211 项测试、package、隔离配置的打包 App 桌面回归和实际 4 页 PDF 逐页视觉核验均通过；实体 IME 和人工原生拖放仍待人工检查。以下 V1 内容保留为历史验收记录，其未实现功能清单不代表当前 V2 状态。

## Release status: V1 COMPLETE

V1 implementation and first reliability pass are complete. The user completed Windows installer smoke testing: installation and launch, Markdown editing, Chinese input and live rendering, New/Open/Save, close/restart, and reopening and editing a previously saved file all passed. The user reported no known issue blocking V1 release. See [V1_ACCEPTANCE.md](V1_ACCEPTANCE.md) for the precise pass scope and manual cases that remain untested.

## Frozen release facts

- Release source commit: `1db32bf` (`v1-rc1`); formal release closeout is recorded in the following release commit and tag `v1.0.0`.
- Application version: `1.0.0`.
- Technology stack: Electron 35.7.5, Electron Forge 7.11.2, Forge Webpack plugin, Squirrel maker, React 19.3.0, TypeScript 5.9.3, CodeMirror 6, Lezer Markdown/GFM, Vitest 3.2.7, Webpack 5.111.1; npm lockfile v3.
- Automated tests: 6 Vitest files, 25 tests passed in the last recorded automated run. The user’s final installer smoke test was manual; it did not rerun or replace the automated suite.
- Typecheck: `npm run typecheck` passed in the last recorded reliability verification.
- Production package: `npm run package` passed for the Windows x64 directory package in the last recorded reliability verification.
- Windows installer: successfully generated and manually installed/smoke-tested by the user. Artifact: `out/make/squirrel.windows/x64/Markdown Editor-1.0.0 Setup.exe`.

## Installer build environment limitation

The successful Squirrel build used a local Electron cache after an Electron download attempt failed with `ECONNRESET`. The `electron-winstaller` vendor folder lacked the expected `7z.exe` and `7z.dll` runtime filenames, so the bundled x64 `7z-x64.exe`/`.dll` were temporarily copied to those names inside `node_modules`. Squirrel then emitted the installer. These local `node_modules` changes were not committed. A fresh-machine fully reproducible installer build has not been demonstrated; installer generation has been manually validated on this host.

## Reliability Pass 1 fixes

- Save, Save As and save-and-close capture immutable CodeMirror `Text` snapshots; a successful write only marks the written snapshot saved, so edits made during an in-flight save remain dirty.
- Live Preview gathers marker ranges from Lezer syntax nodes and styles from the syntax tree/visible ranges, then uses `Decoration.set(ranges, true)`. Active-line delimiters remain visible; supported inactive-line delimiters are hidden without changing Markdown source.
- Application is the sole close-flow decision owner; preload is an IPC bridge. Save/Don't Save/Cancel outcomes are covered by automated state tests.
- App desktop operations go through `PlatformService`; `ElectronPlatformService` is the renderer boundary for `DesktopAPI`.
- Find/Replace menu and Ctrl+F open CodeMirror's search panel.
- File writes use a same-directory temporary file, complete write and sync, then rename. This Windows host test replaced an existing file; injected write/replace failures preserved the original and cleaned temporary files.
- Automated coverage includes editing dirty state, return to saved content, in-flight save snapshot race, Save As cancel, save failure, live preview and malformed Markdown, close flow, and atomic write failures/preservation.

## Known limits that do not block V1

- Full GUI acceptance matrix remains incomplete beyond the user's smoke-test report: detailed IME composition behavior, selection edge cases, Find/Replace interactions, dirty close choices, save-state edge cases, format round trips, recovery cases, and large-document performance are not manually verified. No PASS is claimed for those cases.
- Installer generation on a clean environment is not reproducible until Electron acquisition and the `electron-winstaller` 7-Zip naming/prerequisite issue are resolved. This is a build-environment limitation, not a reported installed-app blocker.
- Mixed EOL documents normalize to the detected dominant line ending; mixed line-ending sequence is not preserved.
- V1 does not implement multi-tab/workspaces/file tree, autosave/file watching, images, visual tables, math, Mermaid, backlinks/indexing, AI/cloud/collaboration, plugin system, or theme marketplace/settings. See `V2_BACKLOG.md`.

## Repository hygiene

`.gitignore` excludes `node_modules/`, `out/`, `.webpack/`, `coverage/`, and `dist/`. The generated audit ZIP is not part of the release commit. Temporary installer helper binaries remain local dependency artifacts and must not be committed.
