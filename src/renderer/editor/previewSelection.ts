import { Annotation, StateField, Transaction, type EditorSelection } from '@codemirror/state';
import type { Command } from '@codemirror/view';

export const verticalNavigation = Annotation.define<boolean>();
/** Delegate geometry and goal-column handling to the native commands. */
export function stableVerticalNavigation(command: Command): Command {
  return view => command(new Proxy(view, { get(target, key) {
    if (key === 'dispatch') return (transaction: Transaction) => target.dispatch({ selection: transaction.newSelection, scrollIntoView: transaction.scrollIntoView, annotations: [Transaction.userEvent.of('select'), verticalNavigation.of(true)] });
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } }));
}

/** Pointer hit testing must use the layout on which the gesture started.
 * Keep that layout through clicks, double clicks and drags. Keyboard editing
 * and explicit source navigation resume the usual active-selection policy.
 * This stores presentation state only; CodeMirror owns the real selection.
 */
export const previewSelectionField = StateField.define<EditorSelection>({
  create: state => state.selection,
  update: (selection, transaction) => transaction.annotation(verticalNavigation) || transaction.isUserEvent('select.pointer') || !transaction.selection && !transaction.docChanged
    ? selection.map(transaction.changes)
    : transaction.newSelection
});

export function previewSelection(state: import('@codemirror/state').EditorState): EditorSelection {
  return state.field(previewSelectionField, false) ?? state.selection;
}
