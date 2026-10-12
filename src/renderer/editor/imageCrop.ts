import { parser, GFM } from '@lezer/markdown';
import { isolateHistory } from '@codemirror/commands';
import type { EditorState } from '@codemirror/state';
import type { DocumentNode } from '../../document/model';

export interface CropRect { x: number; y: number; width: number; height: number }
export function normalizeCropRect(rect: CropRect, size: { width: number; height: number }): CropRect {
  const integer = (value: number, fallback: number) => Number.isFinite(value) ? Math.round(value) : fallback;
  const x = Math.max(0, Math.min(size.width - 1, integer(rect.x, 0)));
  const y = Math.max(0, Math.min(size.height - 1, integer(rect.y, 0)));
  return { x, y, width: Math.max(1, Math.min(size.width - x, integer(rect.width, 1))), height: Math.max(1, Math.min(size.height - y, integer(rect.height, 1))) };
}

/** Only this occurrence changes: reference definitions and other images stay intact. */
export function imageCropTransaction(state: EditorState, node: DocumentNode, destination: string) {
  const source = state.doc.sliceString(node.from, node.to);
  if (node.kind !== 'image' || source !== node.sourceText) return null;
  const link = `<${encodeURI(destination)}>`;
  // Parse in context so full/collapsed/shortcut references are recognized.
  const tree = parser.configure([GFM]).parse(state.doc.toString());
  let syntax = tree.resolveInner(node.from + 2, 1);
  while (syntax.parent && syntax.name !== 'Image') syntax = syntax.parent;
  if (syntax.name !== 'Image' || syntax.from !== node.from || syntax.to !== node.to) return null;
  const url = syntax.getChild('URL');
  let insert: string;
  if (url) insert = source.slice(0, url.from - node.from) + link + source.slice(url.to - node.from);
  else {
    // Preserve the complete alt markup, including escaped/nested brackets.
    let closing = syntax.firstChild;
    while (closing && !(closing.name === 'LinkMark' && state.doc.sliceString(closing.from, closing.to) === ']')) closing = closing.nextSibling;
    if (!closing) return null;
    insert = source.slice(0, closing.to - node.from) + `(${link})`;
  }
  return { changes: { from: node.from, to: node.to, insert }, userEvent: 'input.image-crop', annotations: isolateHistory.of('full') };
}
