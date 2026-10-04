# Architecture

当前 1.2.0 的文档模型、内容预览、目录、图片资源、引用和导出接口详见 [长文档编辑架构](long-document-editing.md)。该历史专题中的 Preferences v3 已演进为 v4。正式文稿 PDF 渲染层见 [PDF 导出](pdf-export.md)，视觉与模态交互见[统一规范](DESIGN_SYSTEM.md)。以下为编辑核心与平台基础。

- `main` owns the native window, menus, file dialogs, file handle registry and filesystem access. `preload` exposes narrow document commands through `contextBridge`.
- The main-process decision broker validates renderer responses for unsaved changes, overwrite and export choices. Recovery drafts and external-content comparisons are owned by the main process; they do not silently overwrite source documents.
- `renderer/app` coordinates one active `DocumentMetadata` session and depends on `PlatformService`; metadata never contains Markdown text.
- CodeMirror `EditorState.doc` is the only editable source. Saved `Text` snapshots determine dirty state, including undo back to the saved content.
- `@codemirror/lang-markdown` provides the Lezer syntax tree. The Live Preview CodeMirror `ViewPlugin` visits syntax nodes intersecting visible ranges and derives style/hide decorations. The primary cursor line keeps its delimiters visible.
- File open normalizes line endings inside the editor and records dominant EOL, mixed-EOL status and UTF-8 BOM. Save restores the selected EOL and BOM; the main process writes the exact UTF-8 bytes.
- Future preview policies can replace the active-line policy through a CodeMirror extension; platform implementations can change behind `PlatformService`; tabs can hold multiple metadata sessions while each editor document remains CodeMirror-owned.
