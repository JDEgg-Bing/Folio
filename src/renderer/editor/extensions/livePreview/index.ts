import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view';
import { previewSelection } from '../../previewSelection';

class BulletWidget extends WidgetType {
  override eq(other: WidgetType) { return other instanceof BulletWidget; }
  override toDOM() {
    const marker = document.createElement('span');
    marker.className = 'cm-preview-bullet'; marker.textContent = '•';
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }
  override ignoreEvent() { return false; }
}

export class TaskCheckboxWidget extends WidgetType {
  constructor(readonly position: number, readonly checked: boolean) { super(); }
  override eq(other: WidgetType) { return other instanceof TaskCheckboxWidget && other.position === this.position && other.checked === this.checked; }
  override toDOM(view: EditorView) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.className = 'cm-preview-task'; checkbox.checked = this.checked;
    checkbox.setAttribute('aria-label', this.checked ? '标记为未完成' : '标记为完成');
    // Only this control handles its own events; the item text stays native text.
    checkbox.addEventListener('mousedown', event => event.preventDefault());
    checkbox.addEventListener('change', () => {
      const marker = view.state.doc.sliceString(this.position, this.position + 3);
      if (!/^\[[ xX]\]$/.test(marker) || view.state.readOnly) { checkbox.checked = this.checked; return; }
      view.dispatch({ changes: { from: this.position + 1, to: this.position + 2, insert: checkbox.checked ? 'x' : ' ' }, userEvent: 'input.task' });
      view.focus();
    });
    checkbox.disabled = view.state.readOnly;
    return checkbox;
  }
  override ignoreEvent() { return true; }
}

const bullet = new BulletWidget();

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
  activeLine = state.doc.lineAt(previewSelection(state).main.head).number
): DecorationSet {
  const ranges = [] as ReturnType<Decoration['range']>[];
  const seen = new Set<string>();
  const tree = syntaxTree(state);

  for (const range of visibleRanges) {
    tree.iterate({ from: range.from, to: range.to, enter(node) {
      const key = `${node.name}:${node.from}:${node.to}`;
      if (seen.has(key)) return;
      seen.add(key);

      if (node.name === 'TaskMarker' && state.doc.lineAt(node.from).number !== activeLine) {
        ranges.push(Decoration.replace({ widget: new TaskCheckboxWidget(node.from, /[xX]/.test(state.doc.sliceString(node.from, node.to))) }).range(node.from, node.to));
      }
      if (node.name === 'ListMark' && state.doc.lineAt(node.from).number !== activeLine) {
        const item = node.node.parent;
        const task = item?.getChild('Task');
        const inlineTask = task && state.doc.lineAt(task.from).number === state.doc.lineAt(node.from).number;
        // An ordered task retains its number. Bullet tasks show one checkbox.
        if (item?.parent?.name === 'BulletList') {
          ranges.push((inlineTask ? hiddenDelimiter : Decoration.replace({ widget: bullet })).range(node.from, inlineTask ? task.from : node.to));
        }
      }

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
