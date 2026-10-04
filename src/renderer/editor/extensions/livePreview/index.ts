import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const headingClasses = ['cm-preview-h1', 'cm-preview-h2', 'cm-preview-h3', 'cm-preview-h4', 'cm-preview-h5', 'cm-preview-h6'];
const hiddenDelimiter = Decoration.replace({});
const previewMarks: Record<string, Decoration> = {
  StrongEmphasis: Decoration.mark({ class: 'cm-preview-strong' }),
  Emphasis: Decoration.mark({ class: 'cm-preview-emphasis' }),
  Strikethrough: Decoration.mark({ class: 'cm-preview-strike' }),
  InlineCode: Decoration.mark({ class: 'cm-preview-code' })
};
const delimiterNodes = new Set(['HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark', 'CodeInfo', 'QuoteMark']);

export interface VisibleRange { from: number; to: number }

export function buildDecorations(
  state: EditorState,
  visibleRanges: readonly VisibleRange[],
  activeLine = state.doc.lineAt(state.selection.main.head).number
): DecorationSet {
  const ranges = [] as ReturnType<Decoration['range']>[];
  const seen = new Set<string>();
  const tree = syntaxTree(state);

  for (const range of visibleRanges) {
    tree.iterate({ from: range.from, to: range.to, enter(node) {
      const key = `${node.name}:${node.from}:${node.to}`;
      if (seen.has(key)) return;
      seen.add(key);

      if (node.name === 'HorizontalRule' && state.doc.lineAt(node.from).number !== activeLine) {
        ranges.push(Decoration.line({ class: 'cm-writing-rule' }).range(state.doc.lineAt(node.from).from));
        ranges.push(hiddenDelimiter.range(node.from, node.to));
      }

      if (/^(?:ATXHeading[1-6]|SetextHeading[12])$/.test(node.name)) {
        const firstLine = state.doc.lineAt(node.from).number;
        const contentEnd = node.name.startsWith('Setext') ? (node.node.getChild('HeaderMark')?.from ?? node.to) - 1 : node.to;
        const lastLine = state.doc.lineAt(Math.max(node.from, contentEnd)).number;
        const level = Number(node.name.slice(-1)) - 1;
        for (let line = firstLine; line <= lastLine; line++) {
          ranges.push(Decoration.line({ class: headingClasses[level] }).range(state.doc.line(line).from));
        }
      }

      const mark = previewMarks[node.name];
      if (mark && node.from < node.to) ranges.push(mark.range(node.from, node.to));

      if (!delimiterNodes.has(node.name) || state.doc.lineAt(node.from).number === activeLine) return;
      let to = node.to;
      if ((node.name === 'HeaderMark' || node.name === 'QuoteMark') && to < state.doc.length && /[ \t]/.test(state.doc.sliceString(to, to + 1))) to++;
      if (node.from < to) ranges.push(hiddenDelimiter.range(node.from, to));
    } });
  }

  return Decoration.set(ranges, true);
}

export function livePreview() {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state, view.visibleRanges);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = buildDecorations(update.state, update.view.visibleRanges);
      }
    }
  }, { decorations: (plugin) => plugin.decorations });
}
