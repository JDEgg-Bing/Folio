import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
export const imageInsertionEffect = StateEffect.define<{ id: string; position: number | null }>();
export const imageInsertionField = StateField.define<ReadonlyMap<string, number>>({
  create: () => new Map(), update: (value, transaction) => {
    const next = new Map([...value].map(([id, position]) => [id, transaction.changes.mapPos(position, 1)]));
    for (const effect of transaction.effects) if (effect.is(imageInsertionEffect)) {
      if (effect.value.position === null) next.delete(effect.value.id); else next.set(effect.value.id, effect.value.position);
    }
    return next;
  }
});
export function imageInsertionTransaction(state: EditorState, id: string, images: readonly { destination: string; alt: string }[]) {
  const position = state.field(imageInsertionField).get(id);
  if (position === undefined || !images.length) return null;
  const text = images.map(image => `![${image.alt.replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')}](<${encodeURI(image.destination)}>)`).join('\n\n');
  const before = state.doc.sliceString(Math.max(0, position - 2), position);
  // A single preceding newline is still the same Markdown paragraph. Give
  // inserted images a block boundary even on the empty last source line.
  const separator = !position || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const insert = `${separator}${text}\n\n`;
  return { changes: { from: position, insert }, effects: imageInsertionEffect.of({ id, position: null }), selection: { anchor: position + insert.length }, userEvent: 'input.drop', annotations: isolateHistory.of('full') };
}
