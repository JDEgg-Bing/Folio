import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
export const imageInsertionEffect = StateEffect.define<{ id: string; position: number | null; to?: number }>();
export const imageInsertionField = StateField.define<ReadonlyMap<string, { from: number; to: number }>>({
  create: () => new Map(), update: (value, transaction) => {
    const next = new Map([...value].map(([id, range]) => [id, { from: transaction.changes.mapPos(range.from, 1), to: transaction.changes.mapPos(range.to, range.from === range.to ? 1 : -1) }]));
    // Do not delete text typed into a pending paste selection.
    transaction.changes.iterChangedRanges((from, to) => { for (const [id, range] of value) if (range.from !== range.to && from < range.to && to > range.from) next.delete(id); });
    for (const effect of transaction.effects) if (effect.is(imageInsertionEffect)) {
      if (effect.value.position === null) next.delete(effect.value.id); else next.set(effect.value.id, { from: effect.value.position, to: effect.value.to ?? effect.value.position });
    }
    return next;
  }
});
export function imageInsertionTransaction(state: EditorState, id: string, images: readonly { destination: string; alt: string }[]) {
  const range = state.field(imageInsertionField).get(id);
  if (!range || !images.length) return null;
  const text = images.map(image => `![${image.alt.replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')}](<${encodeURI(image.destination)}>)`).join('\n');
  const before = state.doc.sliceString(Math.max(0, range.from - 1), range.from);
  const reuseNewline = state.doc.sliceString(range.to, range.to + 1) === '\n';
  const insert = `${range.from && before !== '\n' ? '\n' : ''}${text}${reuseNewline ? '' : '\n'}`;
  return { changes: { from: range.from, to: range.to, insert }, effects: imageInsertionEffect.of({ id, position: null }), selection: { anchor: range.from + insert.length + (reuseNewline ? 1 : 0) }, userEvent: 'input.paste', annotations: isolateHistory.of('full') };
}
