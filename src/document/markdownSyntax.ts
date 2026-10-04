import type { MarkdownConfig } from '@lezer/markdown';

const idPattern = '(?:sec|fig|tbl|eq):[\\p{L}\\p{N}._-]{1,80}';
const attribute = new RegExp(`^\\{#(${idPattern})\\}`, 'u');
const reference = new RegExp(`^\\[@(${idPattern})\\]`, 'u');
const attributeLine = new RegExp(`^\\{#(${idPattern})\\}\\s*$`, 'u');
export function referenceId(text: string): string | null { return attribute.exec(text)?.[1] ?? reference.exec(text)?.[1] ?? null; }
function escaped(text: string, index: number): boolean {
  let count = 0; while (index > 0 && text[--index] === '\\') count++; return count % 2 === 1;
}

export const documentSyntax: MarkdownConfig = {
  defineNodes: ['InlineMath', { name: 'DisplayMath', block: true }, 'DocumentReference', 'TargetAttribute', { name: 'TargetAttributeBlock', block: true }],
  parseInline: [
    { name: 'DocumentReference', before: 'Link', parse(cx, next, pos) {
      if (next !== 91) return -1;
      const match = reference.exec(cx.slice(pos, Math.min(cx.end, pos + 170)));
      return match ? cx.addElement(cx.elt('DocumentReference', pos, pos + match[0].length)) : -1;
    } },
    { name: 'TargetAttribute', parse(cx, next, pos) {
      if (next !== 123) return -1;
      const match = attribute.exec(cx.slice(pos, Math.min(cx.end, pos + 170)));
      return match ? cx.addElement(cx.elt('TargetAttribute', pos, pos + match[0].length)) : -1;
    } },
    { name: 'InlineMath', before: 'Escape', parse(cx, next, pos) {
      const opener = next === 36 && cx.char(pos + 1) !== 36 ? '$' : next === 92 && cx.char(pos + 1) === 40 ? '\\(' : null;
      if (!opener || (opener === '$' && /\s/.test(cx.slice(pos + 1, pos + 2)))) return -1;
      const closer = opener === '$' ? '$' : '\\)';
      const content = cx.slice(pos, cx.end);
      for (let offset = opener.length; offset < content.length; offset++) {
        if (content[offset] === '\n') break;
        if (!content.startsWith(closer, offset) || escaped(content, offset)) continue;
        if (opener === '$' && (/\s/.test(content[offset - 1]) || /\d/.test(content[offset + 1] ?? ''))) continue;
        if (offset === opener.length) return -1;
        return cx.addElement(cx.elt('InlineMath', pos, pos + offset + closer.length));
      }
      return -1;
    } }
  ],
  parseBlock: [
    { name: 'TargetAttributeBlock', before: 'SetextHeading', parse(cx, line) {
      if (!attributeLine.test(line.text.slice(line.pos))) return false;
      const from = cx.lineStart + line.pos, to = cx.lineStart + line.text.length;
      cx.nextLine(); cx.addElement(cx.elt('TargetAttributeBlock', from, to)); return true;
    }, endLeaf: (_cx, line) => attributeLine.test(line.text.slice(line.pos)) },
    { name: 'DisplayMath', before: 'FencedCode', parse(cx, line) {
      const text = line.text.slice(line.pos), opener = text.startsWith('$$') ? '$$' : text.startsWith('\\[') ? '\\[' : null;
      if (!opener) return false;
      const closer = opener === '$$' ? '$$' : '\\]';
      const from = cx.lineStart + line.pos;
      if (text.length > opener.length && text.endsWith(closer)) {
        const to = cx.lineStart + line.text.length;
        cx.nextLine(); cx.addElement(cx.elt('DisplayMath', from, to)); return true;
      }
      if (text.trim() !== opener) return false;
      // An unclosed formula remains a semantic raw node and is never rendered.
      let to = cx.lineStart + line.text.length;
      while (cx.nextLine()) {
        to = cx.lineStart + line.text.length;
        if (line.text.slice(line.pos).trim() === closer) { cx.nextLine(); break; }
      }
      cx.addElement(cx.elt('DisplayMath', from, to)); return true;
    }, endLeaf: (_cx, line) => ['$$', '\\['].includes(line.text.slice(line.pos).trim()) }
  ]
};
