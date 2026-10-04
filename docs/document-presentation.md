# Document title and filename identity

`Markdown source → CodeMirror syntax tree → derived Document Title → window presentation`

`DocumentMetadata.displayName` remains the disk filename. `DocumentDisplayState.title` is the independent display identity sent to the main process. React stores neither a Markdown copy nor an editable title copy.

## Title derivation

`renderer/document/DocumentTitle.ts` walks existing syntax-tree block nodes, skips blocks that cannot contain H1, and stops at the first ATX or setext H1. It reads only that heading's source range and removes its heading/inline-formatting/link-destination syntax. An empty first H1 uses fallback rather than selecting a later H1.

`documentTitleField` caches the derived result. It recomputes on document changes or parser-tree advances, not cursor movement or appearance changes. A small view plugin continues the existing parser in bounded chunks when no H1 has yet been found and parsing has stopped short of document end. Work stops when H1 is found or parsing is complete; timers are destroyed with the view. Large documents may briefly show the filename fallback while an offscreen H1 is parsed. No full-document regex or Markdown-to-HTML rendering is used.

Editor snapshots expose the derived heading string. The app combines it with file metadata: H1 first, saved filename without extension otherwise, Untitled for unsaved documents otherwise. The main process shows `<Title> • — Markdown Editor` when dirty and `<Title> — Markdown Editor` when clean. Only changed title/dirty values are published. Unsaved-change prompts use the same display identity.

## Suggested filenames

`renderer/document/filenameSuggestion.ts` only builds the default filename supplied to Save As:

- Unsaved: first H1, or Untitled.
- Already saved: retain the existing filename stem as the suggestion, independent of H1.
- Remove Windows illegal/control characters; trim surrounding whitespace and trailing dots/spaces.
- Use Untitled if cleaning leaves an empty stem.
- Limit the stem to 120 UTF-16 units without splitting surrogate pairs; reserved Windows device names receive a safe underscore prefix.
- Append `.md`.

Opening a save dialog does not write a file. Cancellation does not write a file. The user-selected path is authoritative. Changing H1 never renames an existing file; ordinary Save continues to use its existing handle. Source, EOL preservation, BOM behavior and atomic saving are unchanged.

## Validation — 2026-10-01

38 new automated tests cover first-H1 extraction and boundaries, title edits/removal/load, multiple/empty H1, inline formatting, fenced/indented code exclusion, setext headings, syntax-tree progress past the viewport, selection-only caching, undo/redo, file/title separation, safe filename suggestions, layout persistence/legacy preferences and restrained heading tokens. All 85 tests pass.

The packaged app was launched and inspected through Electron in isolated user-data profiles. Runtime checks and screenshots are recorded in `writing-appearance.md`. File picker results were stubbed to temporary paths; document IPC and real disk writes ran. Real Windows IME candidate selection and native picker interactions remain human acceptance items. The synthetic bulk-input stress action was replaced by opening a real long Markdown file; it is not a large-paste performance certification.
