import { StateField, type EditorSelection } from '@codemirror/state';

/** Pointer hit testing must use the layout on which the gesture started.
 * Keep that layout through clicks, double clicks and drags. Keyboard editing
 * and explicit source navigation resume the usual active-selection policy.
 * This stores presentation state only; CodeMirror owns the real selection.
 */
export const previewSelectionField = StateField.define<EditorSelection>({
  create: state => state.selection,
  update: (selection, transaction) => transaction.isUserEvent('select.pointer') || !transaction.selection && !transaction.docChanged
    ? selection.map(transaction.changes)
    : transaction.newSelection
});

export function previewSelection(state: import('@codemirror/state').EditorState): EditorSelection {
  return state.field(previewSelectionField, false) ?? state.selection;
}
