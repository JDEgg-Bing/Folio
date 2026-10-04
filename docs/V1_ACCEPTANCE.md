# V1 Acceptance

## Release status

V1 GUI acceptance was completed by the user on Windows 11 x64 using the generated installer. The tested areas below are marked PASS only where the user reported direct hands-on verification. No other manual cases are inferred from code or automated tests.

| Area | Status | Notes |
| --- | --- | --- |
| Windows installer generation | PASS | Generated `Markdown Editor-1.0.0 Setup.exe`; see installer build note below. |
| Install and first launch | PASS | User installed the generated Windows installer and launched the installed application successfully. |
| Markdown editing | PASS | User confirmed Markdown editing works. |
| Chinese input and live rendering | PASS | User confirmed Chinese input and live rendering. This is the reported smoke test only; composition edge-case matrix below remains untested. |
| New / Open / Save | PASS | User confirmed these file lifecycle operations. |
| Close and restart | PASS | User confirmed closing and restarting the installed application. |
| Reopen and continue editing saved file | PASS | User reopened a previously saved file and continued editing. |
| Release blocking issues | PASS | User reported no currently known issue blocking V1 release. |
| Automated unit tests | PASS | 6 Vitest files / 25 tests passed (last recorded Reliability Pass 1 run). |
| Typecheck | PASS | `npm run typecheck` passed (last recorded Reliability Pass 1 run). |
| Production directory package | PASS | `npm run package` passed for Windows x64 (last recorded Reliability Pass 1 run). |

## Installer build note

Artifact: `out/make/squirrel.windows/x64/Markdown Editor-1.0.0 Setup.exe` (117,875,200 bytes in the recorded build).

The Squirrel build initially encountered an Electron runtime download `ECONNRESET`; it was completed using an existing local Electron cache. The `electron-winstaller` vendor directory was also missing the runtime-name `7z.exe` and `7z.dll` files expected by Squirrel. Those were temporarily copied from the bundled x64 `7z-x64.exe` and `7z-x64.dll` within `node_modules`, after which Squirrel completed and emitted the installer. These were local dependency-directory changes and are not committed. The installer was manually installed and smoke-tested by the user. A clean, fully reproducible installer build on a fresh environment has not been established.

## Not manually verified

These cases remain `NOT TESTED`; the installation smoke test above does not imply a pass for them:

| Case | Status | Notes |
| --- | --- | --- |
| Full English keyboard/editing matrix, clipboard, and rapid 20x undo/redo | NOT TESTED | No detailed report provided. |
| Chinese IME composition edge cases and candidate behavior across headings/emphasis/inline code | NOT TESTED | General Chinese input passed; composition-specific steps were not reported. |
| Live preview caret/selection/typing behavior across every syntax type | NOT TESTED | General live rendering passed; detailed interaction matrix was not reported. |
| Selection and source correctness for cross-line/mixed Markdown operations | NOT TESTED | No detailed report provided. |
| Find/Replace menu and keyboard matrix | NOT TESTED | No detailed report provided. |
| Dirty-close Save / Don't Save / Cancel and Save As dialog cancellation | NOT TESTED | No detailed report provided. |
| Saved/Modified status under undo/redo and rapid edit during Save | NOT TESTED | No detailed report provided. |
| LF/CRLF, BOM, final-newline, empty and mixed-EOL file-format round trips | NOT TESTED | No detailed report provided. |
| 100k / 500k / 1MB large-document performance | NOT TESTED | No performance observations provided. |
| Read-only, permission-denied, deleted-file and other recovery cases | NOT TESTED | No detailed report provided. |
| Installer build reproducibility on a clean machine | NOT TESTED | Current successful build relied on local cache and temporary node_modules changes. |

Use `docs/MANUAL_ACCEPTANCE.md` for the complete manual test matrix and bug report format. The user's final smoke-test report found no V1 release blocker.
