import { describe, expect, it } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import type { Decoration } from '@codemirror/view';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { buildDecorations, TaskCheckboxWidget } from '../../src/renderer/editor/extensions/livePreview';
import { previewSelectionField } from '../../src/renderer/editor/previewSelection';
import { documentPresentation } from '../../src/renderer/appearance/writingTheme';
import { documentPreviewField } from '../../src/renderer/editor/extensions/documentPreview';
import { parsedState } from './parsedState';

function stateFor(doc: string, cursor = doc.length) {
  return parsedState(EditorState.create({ doc, selection: { anchor: cursor }, extensions: [documentPreviewField, createEditorExtensions(() => {})] }));
}
function decorations(state: EditorState) {
  const result: { from: number; to: number; value: Decoration }[] = [];
  buildDecorations(state, [{ from: 0, to: state.doc.length }]).between(0, state.doc.length, (from, to, value) => { result.push({ from, to, value }); });
  return result;
}

describe('GFM list preview and source ranges', () => {
  it('renders all task states at nested levels without replacing item text', () => {
    const source = '- [ ] todo\n  - [x] done\n    - [X] uppercase\n- ordinary\n\nend';
    const state = stateFor(source), found = decorations(state);
    const checkboxes = found.filter(item => item.value.spec.widget instanceof TaskCheckboxWidget);
    expect(checkboxes.map(item => item.value.spec.widget.checked)).toEqual([false, true, true]);
    expect(checkboxes.map(item => source.slice(item.from, item.to))).toEqual(['[ ]', '[x]', '[X]']);
    expect(found.filter(item => item.value.spec.widget && !(item.value.spec.widget instanceof TaskCheckboxWidget))).toHaveLength(1);
    expect(state.doc.toString()).toBe(source);
    for (const word of ['todo', 'done', 'uppercase', 'ordinary']) {
      const position = source.indexOf(word);
      expect(found.some(item => item.from <= position && item.to > position)).toBe(false);
    }
  });
  it('replaces only unordered prefixes, including + and *, and preserves ordered numbering', () => {
    const source = '- outer\n  - middle\n    - inner\n\n+ plus\n\n* star\n\n3. ordered\n4. [X] numbered task\n\nend';
    const state = stateFor(source), found = decorations(state);
    const bullets = found.filter(item => item.value.spec.widget && !(item.value.spec.widget instanceof TaskCheckboxWidget));
    expect(bullets.map(item => source.slice(item.from, item.to))).toEqual(['-', '-', '-', '+', '*']);
    expect(found.some(item => item.from === source.indexOf('3.'))).toBe(false);
    expect(found.some(item => item.from === source.indexOf('4.'))).toBe(false);
  });
  it('leaves active-line source and fenced/escaped lookalikes editable', () => {
    const source = '- [ ] editing\n\n```md\n- [x] code\n```\n\n\\- [ ] literal';
    expect(decorations(stateFor(source, 5)).filter(item => item.value.spec.widget)).toHaveLength(0);
  });
  it('does not hide parent text or line breaks when a later paragraph is a task', () => {
    const source = '- parent\n\n  [ ] secondary\n\nend';
    const state = stateFor(source), found = decorations(state);
    expect(found.filter(item => item.value.spec.widget instanceof TaskCheckboxWidget)).toHaveLength(1);
    expect(found.some(item => item.from < source.indexOf('parent') && item.to > source.indexOf('parent'))).toBe(false);
    for (const item of found.filter(item => item.value.spec.widget || !item.value.spec.class)) {
      expect(source.slice(item.from, item.to)).not.toContain('\n');
    }
  });
});

describe('pointer selection presentation stability', () => {
  it.each([false, true])('keeps markup, gap layout and widgets stable for pointer ranges (reverse=%s)', reverse => {
    const source = '# title\n\n**bold text**\n\n$a^2$\n\n| a | b |\n| - | - |\n| c | d |\n\nend';
    const before = stateFor(source, 0), from = 12, to = source.length - 2;
    const after = before.update({ selection: EditorSelection.range(reverse ? to : from, reverse ? from : to), userEvent: 'select.pointer' }).state;
    expect(after.selection.main.from).toBe(from); expect(after.selection.main.to).toBe(to);
    expect(after.sliceDoc(from, to)).toBe(source.slice(from, to));
    expect(after.field(previewSelectionField).eq(before.field(previewSelectionField))).toBe(true);
    expect(decorations(after)).toEqual(decorations(before));
    const layout = (state: EditorState) => {
      const classes: unknown[] = [];
      documentPresentation(state, [{ from: 0, to: source.length }]).between(0, source.length, (from, to, value) => { classes.push([from, to, value.spec.class]); });
      return classes;
    };
    expect(layout(after)).toEqual(layout(before));
    expect(after.field(documentPreviewField).size).toBe(before.field(documentPreviewField).size);
    // Background parser/configuration transactions must not reveal markup
    // underneath an in-progress pointer gesture either.
    const background = after.update({}).state;
    expect(background.field(previewSelectionField).eq(before.field(previewSelectionField))).toBe(true);
    const editing = after.update({ selection: { anchor: source.indexOf('$') }, userEvent: 'select' }).state;
    expect(editing.field(documentPreviewField).size).toBe(before.field(documentPreviewField).size - 1);
  });
});
