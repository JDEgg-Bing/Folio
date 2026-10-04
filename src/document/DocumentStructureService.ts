import { NodeWeakMap, type SyntaxNode, type Tree } from '@lezer/common';
import { referenceId } from './markdownSyntax';
import { semanticText, walkNodes, type DocumentModel, type DocumentNode, type NodeKind, type ReferenceRelation, type ReferenceTarget, type ReferenceType, type TextSource } from './model';

const kinds: Record<string, NodeKind> = {
  Document: 'document', Paragraph: 'paragraph', BulletList: 'list', OrderedList: 'list', ListItem: 'listItem', Blockquote: 'quote',
  FencedCode: 'code', CodeBlock: 'code', HorizontalRule: 'rule', Image: 'image', Table: 'table', TableHeader: 'row', TableRow: 'row', TableCell: 'cell',
  InlineMath: 'math', DisplayMath: 'math', DocumentReference: 'reference', TargetAttribute: 'attribute', TargetAttributeBlock: 'attribute',
  StrongEmphasis: 'strong', Emphasis: 'emphasis', Strikethrough: 'strike', InlineCode: 'inlineCode', Link: 'link', Autolink: 'link', HTMLBlock: 'raw', HTMLTag: 'raw'
};
const markers = new Set(['HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark', 'CodeInfo', 'QuoteMark', 'ListMark', 'LinkMark', 'LinkTitle', 'TableDelimiter', 'TableSeparator', 'URL', 'LinkLabel']);
type CachedNode = { originalFrom: number; node: DocumentNode };

/** Syntax adapter and semantic index. No UI objects or HTML are produced here. */
export class DocumentStructureService {
  private readonly documentId = crypto.randomUUID();
  private readonly cache = new NodeWeakMap<CachedNode>();
  private sequence = 0;
  private shift(node: DocumentNode, offset: number, parentId: string | null): DocumentNode {
    return { ...node, from: node.from + offset, to: node.to + offset, parentId,
      attribute: node.attribute && { from: node.attribute.from + offset, to: node.attribute.to + offset },
      children: node.children.map(child => this.shift(child, offset, node.id)) };
  }
  private convert(syntax: SyntaxNode, source: TextSource, parentId: string | null): DocumentNode | null {
    if (markers.has(syntax.name)) return null;
    const cached = this.cache.get(syntax);
    if (cached) return this.shift(cached.node, syntax.from - cached.originalFrom, parentId);
    const heading = /^(?:ATXHeading[1-6]|SetextHeading[12])$/.test(syntax.name);
    const kind = heading ? 'heading' : kinds[syntax.name] ?? 'raw';
    const node: DocumentNode = { id: `node-${++this.sequence}`, kind, from: syntax.from, to: syntax.to, parentId, children: [] };
    if (kind === 'raw' || syntax.name === 'HardBreak') node.sourceType = syntax.name;
    if (heading) node.level = Number(syntax.name.slice(-1));
    if (kind === 'list') {
      node.ordered = syntax.name === 'OrderedList';
      if (node.ordered) node.start = Number(source.read(syntax.from, Math.min(syntax.to, syntax.from + 12)).match(/^\d+/)?.[0] ?? 1);
    }
    if (syntax.name === 'Escape' || syntax.name === 'HardBreak') {
      node.kind = 'text'; node.text = syntax.name === 'Escape' ? source.read(syntax.from + 1, syntax.to) : '\n';
    } else if (kind === 'math') {
      const raw = source.read(syntax.from, syntax.to), size = raw.startsWith('$') ? (syntax.name === 'DisplayMath' ? 2 : 1) : 2;
      node.sourceText = raw;
      const closing = raw.startsWith('\\[') ? '\\]' : raw.startsWith('\\(') ? '\\)' : '$'.repeat(size);
      node.display = syntax.name === 'DisplayMath';
      if (raw.length >= size * 2 && raw.endsWith(closing)) node.text = raw.slice(size, -size).trim();
      else { node.kind = 'raw'; node.text = raw; }
    } else if (kind === 'attribute' || kind === 'reference') node.referenceId = referenceId(source.read(syntax.from, syntax.to)) ?? undefined;
    else if (kind === 'code' || kind === 'raw') node.text = source.read(syntax.from, syntax.to);
    else {
      let position = syntax.from;
      for (let child = syntax.firstChild; child; child = child.nextSibling) {
        if (child.from > position && ['heading', 'paragraph', 'cell', 'strong', 'emphasis', 'strike', 'inlineCode', 'link', 'image'].includes(kind)) {
          node.children.push({ id: `node-${++this.sequence}`, kind: 'text', from: position, to: child.from, parentId: node.id, children: [], text: source.read(position, child.from) });
        }
        const converted = this.convert(child, source, node.id);
        if (converted) node.children.push(converted);
        if (child.name === 'URL') node.destination = source.read(child.from, child.to).replace(/^<|>$/g, '');
        position = child.to;
      }
      if (position < syntax.to && !['document', 'list', 'listItem', 'quote', 'table', 'row'].includes(kind)) node.children.push({ id: `node-${++this.sequence}`, kind: 'text', from: position, to: syntax.to, parentId: node.id, children: [], text: source.read(position, syntax.to) });
      if (kind === 'heading') {
        const last = node.children.at(-1);
        const attr = [...node.children].reverse().find(child => child.kind === 'attribute');
        if (attr && (!last || last === attr || !semanticText(last).trim())) { node.referenceId = attr.referenceId; node.attribute = { from: attr.from, to: attr.to }; }
      }
      if (kind === 'image') { node.text = node.children.map(semanticText).join('').trim(); node.sourceText = source.read(syntax.from, syntax.to); }
      if (kind === 'table') {
        const delimiter = syntax.getChild('TableDelimiter');
        node.align = delimiter ? source.read(delimiter.from, delimiter.to).split('|').filter(cell => cell.trim()).map(cell => cell.trim().endsWith(':') ? (cell.trim().startsWith(':') ? 'center' : 'right') : 'left') : [];
        node.alignExplicit = delimiter ? source.read(delimiter.from, delimiter.to).split('|').filter(cell => cell.trim()).map(cell => cell.includes(':')) : [];
      }
    }
    this.cache.set(syntax, { originalFrom: syntax.from, node });
    return this.shift(node, 0, parentId);
  }
  build(source: TextSource, tree: Tree, revision = 0, complete = tree.length === source.length): DocumentModel {
    const root = this.convert(tree.topNode, source, null)!;
    const headings: DocumentNode[] = [], images: DocumentNode[] = [], references: ReferenceRelation[] = [];
    const targets = new Map<string, ReferenceTarget[]>(), diagnostics: DocumentModel['diagnostics'] = [];
    const definitions = new Map<string, string>();
    tree.iterate({ enter(node) {
      if (node.name !== 'LinkReference') return;
      const label = node.node.getChild('LinkLabel'), url = node.node.getChild('URL');
      if (label && url) definitions.set(source.read(label.from, label.to).replace(/^\[|\]$/g, '').trim().toLowerCase(), source.read(url.from, url.to).replace(/^<|>$/g, ''));
    } });
    const bind = (parent: DocumentNode) => {
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child.kind === 'attribute') {
          let previous = parent.children[i - 1];
          if (previous?.kind === 'text' && !previous.text?.trim()) previous = parent.children[i - 2];
          if (previous && ((previous.kind === 'table' || previous.kind === 'math' && previous.display) && source.read(previous.to, child.from) === '\n' || previous.kind === 'image' && previous.to === child.from)) {
            previous.referenceId = child.referenceId; previous.attribute = { from: child.from, to: child.to };
          } else if (parent.kind !== 'heading') diagnostics.push({ from: child.from, to: child.to, code: 'orphan-id', message: '此标识没有对应的文档元素。' });
        }
        if (child.kind === 'image' && !child.destination) {
          const syntax = tree.resolveInner(child.from + 1, 1).parent;
          let label: string | undefined;
          for (let n = syntax; n; n = n.parent) if (n.name === 'Image') {
            const labelNode = n.getChild('LinkLabel');
            label = labelNode ? source.read(labelNode.from, labelNode.to).replace(/^\[|\]$/g, '') : child.text; break;
          }
          child.destination = definitions.get((label || child.text || '').trim().toLowerCase());
        }
        bind(child);
      }
    };
    bind(root);
    const counters = { fig: 0, tbl: 0, eq: 0 };
    walkNodes(root, node => {
      if (node.kind === 'heading') headings.push(node);
      if (node.kind === 'image') images.push(node);
      if (node.kind === 'reference' && node.referenceId) references.push({ id: node.referenceId, from: node.from, to: node.to, status: 'pending' });
      if (!node.referenceId || node.kind === 'attribute' || node.kind === 'reference') return;
      const type = node.referenceId.split(':')[0] as ReferenceType;
      const expected = node.kind === 'heading' ? 'sec' : node.kind === 'image' ? 'fig' : node.kind === 'table' ? 'tbl' : node.kind === 'math' && node.display ? 'eq' : null;
      if (type !== expected) { diagnostics.push({ from: node.from, to: node.to, code: 'wrong-type', message: '标识类型与文档元素不匹配。' }); return; }
      const number = type === 'sec' ? null : ++counters[type];
      const label = type === 'sec' ? semanticText(node).replace(/\s+/g, ' ').trim() : type === 'eq' ? `(${number})` : `${type === 'fig' ? '图' : '表'} ${number}`;
      const target = { id: node.referenceId, type, nodeId: node.id, from: node.from, to: node.to, label, number };
      targets.set(target.id, [...targets.get(target.id) ?? [], target]);
    });
    for (const [id, list] of targets) if (list.length > 1) for (const target of list) diagnostics.push({ from: target.from, to: target.to, code: 'duplicate-id', message: `标识重复：${id}` });
    for (const relation of references) {
      const matches = targets.get(relation.id) ?? [];
      relation.status = matches.length === 1 ? 'resolved' : matches.length > 1 ? 'duplicate' : complete ? 'missing' : 'pending';
      if (relation.status === 'resolved') relation.target = matches[0];
      if (relation.status === 'missing') diagnostics.push({ ...relation, code: 'missing-id', message: `未找到引用：${relation.id}` });
    }
    return { documentId: this.documentId, revision, complete, root, headings, images, targets, references, diagnostics };
  }
}
