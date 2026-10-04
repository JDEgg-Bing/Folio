import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/** Semantic assertions need a complete tree, independent of the editor's initial time budget. */
export function parsedState(state: EditorState): EditorState {
  if (!ensureSyntaxTree(state, state.doc.length, 5000)) throw new Error('Test document did not finish parsing.');
  return state.update({}).state;
}
