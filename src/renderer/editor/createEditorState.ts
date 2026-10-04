import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { documentSyntax } from '../../document/markdownSyntax';
import { documentStructure, structureField } from './documentStructure';
import { chinesePhrases } from '../../shared/chinese';
import { GFM } from '@lezer/markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { EditorSnapshot } from './EditorController';
import { livePreview } from './extensions/livePreview';
import { writingHighlightStyle, writingTheme } from '../appearance/writingTheme';
import { documentTitle, documentTitleField } from '../document/DocumentTitle';
import { wordCountField } from './wordCount';

export function createEditorExtensions(onUpdate: (snapshot: EditorSnapshot) => void) {
  return [
    writingTheme,
    history(),
    markdown({ base: markdownLanguage, extensions: [GFM, documentSyntax] }),
    documentStructure,
    EditorState.phrases.of(chinesePhrases),
    documentTitle,
    wordCountField,
    syntaxHighlighting(writingHighlightStyle, { fallback: true }),
    search(),
    livePreview(),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet || update.startState.field(structureField) !== update.state.field(structureField) || update.startState.field(documentTitleField) !== update.state.field(documentTitleField)) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        onUpdate({ line: line.number, column: head - line.from + 1, dirty: false, headingTitle: update.state.field(documentTitleField).title, wordCount: update.state.field(wordCountField) });
      }
    }),
    keymap.of([
      { key: 'Mod-z', run: (view) => undo(view) },
      { key: 'Mod-Shift-z', run: (view) => redo(view) },
      { key: 'Mod-f', run: openSearchPanel },
      indentWithTab,
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap
    ])
  ];
}

export function createEmptyEditorState() { return EditorState.create({ doc: '', extensions: createEditorExtensions(() => {}) }); }
