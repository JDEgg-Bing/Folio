import type { DocumentNode } from './model';

/** Split presentation only. Source ranges and the semantic tree stay intact. */
export function imageParagraphParts(node: DocumentNode): DocumentNode[] | null {
  if (!node.children.some(child => child.kind === 'image' && child.imageLayout === 'block')) return null;
  const parts: DocumentNode[] = [];
  let children: DocumentNode[] = [];
  const flush = () => {
    while (children[0]?.kind === 'attribute' || children[0]?.kind === 'text' && !children[0].text?.trim()) children.shift();
    while (children.at(-1)?.kind === 'attribute' || children.at(-1)?.kind === 'text' && !children.at(-1)!.text?.trim()) children.pop();
    // The line breaks separating block images are layout boundaries, not text.
    children = children.map((child, i) => {
      if (child.kind !== 'text') return child;
      let text = child.text ?? '';
      if (i === 0) text = text.replace(/^(?:[ \t>]*\n)?[ \t]*/, '');
      if (i === children.length - 1) text = text.replace(/[ \t]*(?:\n[ \t>]*)?$/, '');
      return { ...child, text };
    });
    if (children.some(child => child.kind !== 'attribute' && (child.kind !== 'text' || child.text?.trim()))) parts.push({ ...node, id: `${node.id}-part-${parts.length}`, children });
    children = [];
  };
  for (const child of node.children) {
    if (child.kind === 'image' && child.imageLayout === 'block') { flush(); parts.push(child); }
    else children.push(child);
  }
  flush(); return parts;
}
