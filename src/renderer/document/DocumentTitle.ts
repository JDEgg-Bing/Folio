import { syntaxTree } from '@codemirror/language';
import { structureField } from '../editor/documentStructure';
import { semanticText } from '../../document/model';
import { uiText } from '../../shared/chinese';
import { StateField, type EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { DocumentMetadata } from '../../shared/desktopApi';

export interface HeadingTitle { title: string | null; from: number | null }

const hiddenTitleSyntax = new Set(['HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark', 'LinkMark', 'LinkTitle', 'TargetAttribute']);
const blocksWithoutH1 = new Set(['Paragraph', 'FencedCode', 'CodeBlock', 'HTMLBlock', 'Table', 'ATXHeading2', 'ATXHeading3', 'ATXHeading4', 'ATXHeading5', 'ATXHeading6', 'SetextHeading2']);

function headingText(state: EditorState, heading: SyntaxNode): string | null {
  const excluded: { from: number; to: number }[] = [];
  const cursor = heading.cursor();
  do {
    if (hiddenTitleSyntax.has(cursor.name) || (cursor.name === 'URL' && cursor.node.parent?.name !== 'Autolink')) {
      excluded.push({ from: cursor.from, to: cursor.to });
    }
  } while (cursor.next() && cursor.from < heading.to);
  let from = heading.from;
  let text = '';
  for (const range of excluded.sort((a, b) => a.from - b.from)) {
    if (range.from > from) text += state.doc.sliceString(from, range.from);
    from = Math.max(from, range.to);
  }
  text += state.doc.sliceString(from, heading.to);
  // Only the first heading's content is normalized, never the complete document.
  return text.replace(/\s+/g, ' ').trim() || null;
}

/** Traverse existing Markdown syntax nodes and stop as soon as the first H1 is found. */
export function readFirstHeading(state: EditorState): HeadingTitle {
  const model = state.field(structureField, false);
  if (model) { const heading = model.headings.find(node => node.level === 1); return { title: heading ? semanticText(heading).replace(/\s+/g, ' ').trim() || null : null, from: heading?.from ?? null }; }
  const cursor = syntaxTree(state).cursor();
  do {
    if (cursor.name === 'ATXHeading1' || cursor.name === 'SetextHeading1') {
      return { title: headingText(state, cursor.node), from: cursor.from };
    }
  } while (cursor.next(!blocksWithoutH1.has(cursor.name)));
  return { title: null, from: null };
}

export const documentTitleField = StateField.define<HeadingTitle>({
  create: readFirstHeading,
  update: (title, transaction) => transaction.docChanged || syntaxTree(transaction.startState) !== syntaxTree(transaction.state) || transaction.startState.field(structureField, false) !== transaction.state.field(structureField, false)
    ? readFirstHeading(transaction.state) : title
});

// The shared document structure adapter completes parsing for every consumer.
export const documentTitle = [documentTitleField];

export function filenameStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim() || uiText.unnamed;
}

export function resolveDocumentTitle(heading: string | null, metadata: Pick<DocumentMetadata, 'fileHandleId' | 'displayName'>): string {
  return heading?.trim() || (metadata.fileHandleId ? metadata.displayName.trim() || uiText.unnamed : uiText.unnamed);
}
