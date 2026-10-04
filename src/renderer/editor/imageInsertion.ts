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
  if (position === undefined) return null;
  const text = images.map(image => `![${image.alt.replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')}](<${encodeURI(image.destination)}>)`).join('\n\n');
  const insert = `${position && state.doc.sliceString(position - 1, position) !== '\n' ? '\n\n' : ''}${text}\n\n`;
  return { changes: { from: position, insert }, effects: imageInsertionEffect.of({ id, position: null }), selection: { anchor: position + insert.length }, userEvent: 'input.drop', annotations: isolateHistory.of('full') };
}
