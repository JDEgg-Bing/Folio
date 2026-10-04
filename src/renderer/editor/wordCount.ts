import { StateField, type Text } from '@codemirror/state';

const han = /^\p{Script=Han}$/u;
const wordCharacter = /^[\p{L}\p{N}]$/u;

/** Chinese characters count individually; Latin/number runs count as words.
 * Counts source text, without producing a Markdown/HTML copy. */
export function countWritingWords(text: string): number {
  let count = 0, inWord = false;
  for (const character of text) {
    if (han.test(character)) { count++; inWord = false; }
    else if (wordCharacter.test(character)) { if (!inWord) count++; inWord = true; }
    else inWord = false;
  }
  return count;
}

type Lines = { from: number; to: number };
function countLines(doc: Text, ranges: Lines[]): number {
  let count = 0;
  const merged: Lines[] = [];
  for (const range of ranges.sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  for (const range of merged) {
    for (const text of doc.iterLines(range.from, range.to + 1)) count += countWritingWords(text);
  }
  return count;
}

export const wordCountField = StateField.define<number>({
  create: (state) => countLines(state.doc, [{ from: 1, to: state.doc.lines }]),
  update: (count, transaction) => {
    if (!transaction.docChanged) return count;
    const before: Lines[] = [], after: Lines[] = [];
    transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      before.push({ from: transaction.startState.doc.lineAt(fromA).number, to: transaction.startState.doc.lineAt(toA).number });
      after.push({ from: transaction.state.doc.lineAt(fromB).number, to: transaction.state.doc.lineAt(toB).number });
    });
    return count - countLines(transaction.startState.doc, before) + countLines(transaction.state.doc, after);
  }
});
