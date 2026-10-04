import { Facet, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import katex from 'katex';
import { semanticText, walkNodes, type DocumentModel, type DocumentNode } from '../../../document/model';
import { DEFAULT_DOCUMENT_FEATURES, type DocumentFeatures } from '../../preferences/DocumentFeatures';
import { composingField, structureField } from '../documentStructure';

export interface PreviewEnvironment {
  features: DocumentFeatures;
  resolveImage(destination: string): Promise<{ url: string; mime: string }>;
  jump(position: number): void;
}
export const previewEnvironment = Facet.define<PreviewEnvironment, PreviewEnvironment>({ combine: values => values.at(-1) ?? { features: { ...DEFAULT_DOCUMENT_FEATURES }, resolveImage: async () => { throw new Error('图片服务不可用。'); }, jump: () => {} } });
const mathCache = new Map<string, string | Error>();
export function renderMath(latex: string, display: boolean): string {
  const key = `${display}:${latex}`;
  const cached = mathCache.get(key); if (cached instanceof Error) throw cached; if (cached) return cached;
  if (latex.length > 50000) throw new Error('公式过长，暂不预览。');
  if (mathCache.size >= 128) mathCache.delete(mathCache.keys().next().value!);
  try {
    const html = katex.renderToString(latex, { displayMode: display, trust: false, maxExpand: 1000, maxSize: 20, strict: 'ignore', throwOnError: true, output: 'htmlAndMathml', macros: {} });
    mathCache.set(key, html); return html;
  } catch (cause) { const error = cause instanceof Error ? cause : new Error('公式无法显示。'); mathCache.set(key, error); throw error; }
}
function targetLabel(model: DocumentModel, node: DocumentNode): string | null {
  const targets = node.referenceId && model.targets.get(node.referenceId);
  return targets && targets.length === 1 ? targets[0].label : null;
}
function equation(node: DocumentNode, label: string | null): HTMLElement {
  const element = document.createElement(node.display ? 'div' : 'span');
  element.className = node.display ? 'document-math-block' : 'document-math-inline';
  const content = document.createElement('span');
  try { content.innerHTML = renderMath(node.text ?? '', !!node.display); }
  catch { content.className = 'document-preview-error'; content.textContent = `公式无法显示：${node.text ?? ''}`; }
  element.append(content);
  if (label) { const number = document.createElement('span'); number.className = 'document-equation-number'; number.textContent = label; element.append(number); }
  return element;
}
function image(node: DocumentNode, environment: PreviewEnvironment, view: EditorView, block: boolean, label: string | null, cleanups: (() => void)[]): HTMLElement {
  const figure = document.createElement(block ? 'figure' : 'span'); figure.className = block ? 'document-figure' : 'document-image-inline';
  const placeholder = document.createElement('span'); placeholder.className = 'document-preview-error'; placeholder.textContent = '正在加载图片…'; figure.append(placeholder);
  let disposed = false; cleanups.push(() => { disposed = true; });
  if (!node.destination) placeholder.textContent = '未找到图片路径。';
  else if (/^[a-z][a-z\d+.-]*:/i.test(node.destination) && !/^file:/i.test(node.destination) && !/^[a-z]:[\\/]/i.test(node.destination)) placeholder.textContent = `${node.sourceText ?? ''}（暂不显示网络图片）`;
  else environment.resolveImage(node.destination).then(resource => {
    if (disposed) return;
    const img = document.createElement('img'); img.alt = node.text ?? ''; img.src = resource.url;
    img.addEventListener('load', () => { if (!disposed) view.requestMeasure(); });
    img.addEventListener('error', () => { if (!disposed) { placeholder.textContent = '图片无法显示。'; img.replaceWith(placeholder); view.requestMeasure(); } });
    placeholder.replaceWith(img); view.requestMeasure();
  }).catch(cause => { if (!disposed) { placeholder.textContent = cause instanceof Error && /^[\u4e00-\u9fff]/.test(cause.message) ? cause.message : '图片无法显示。'; view.requestMeasure(); } });
  if (label) { const caption = document.createElement(block ? 'figcaption' : 'span'); caption.className = 'document-caption'; caption.textContent = `${label}${node.text ? `　${node.text}` : ''}`; figure.append(caption); }
  return figure;
}
function inline(node: DocumentNode, environment: PreviewEnvironment, model: DocumentModel, view: EditorView, cleanups: (() => void)[]): Node {
  if (node.kind === 'attribute') return document.createTextNode('');
  if (node.kind === 'math') return environment.features.mathPreview ? equation(node, null) : document.createTextNode(node.sourceText ?? '');
  if (node.kind === 'image') return environment.features.imagePreview ? image(node, environment, view, false, targetLabel(model, node), cleanups) : document.createTextNode(node.sourceText ?? '');
  if (node.kind === 'reference') {
    const relation = model.references.find(ref => ref.from === node.from);
    if (environment.features.referencePreview && relation?.target) {
      const button = document.createElement('button'); button.className = 'document-reference'; button.textContent = relation.target.label;
      button.addEventListener('click', event => { event.stopPropagation(); environment.jump(relation.target!.from); }); return button;
    }
    return document.createTextNode(`[@${node.referenceId}]`);
  }
  if (node.kind === 'text' || node.kind === 'raw') return document.createTextNode(node.text ?? '');
  const tag = node.kind === 'strong' ? 'strong' : node.kind === 'emphasis' ? 'em' : node.kind === 'strike' ? 's' : node.kind === 'inlineCode' ? 'code' : 'span';
  const element = document.createElement(tag);
  for (const child of node.children) element.append(inline(child, environment, model, view, cleanups)); return element;
}
class DocumentWidget extends WidgetType {
  private cleanups: (() => void)[] = [];
  constructor(readonly node: DocumentNode, readonly model: DocumentModel, readonly environment: PreviewEnvironment, readonly block: boolean, readonly editPosition: number) { super(); }
  override eq(other: DocumentWidget): boolean {
    if (other.node.id !== this.node.id || other.editPosition !== this.editPosition || other.environment !== this.environment || targetLabel(other.model, other.node) !== targetLabel(this.model, this.node)) return false;
    if (this.node.kind === 'reference' || this.node.kind === 'table') {
      const signature = (model: DocumentModel) => model.references.map(ref => `${ref.from}:${ref.status}:${ref.target?.from}:${ref.target?.label}`).join('|');
      return signature(other.model) === signature(this.model);
    }
    return other.node.destination === this.node.destination && other.node.text === this.node.text;
  }
  override toDOM(view: EditorView): HTMLElement {
    let element: HTMLElement;
    const label = targetLabel(this.model, this.node);
    if (this.node.kind === 'math') element = equation(this.node, label);
    else if (this.node.kind === 'image') element = image(this.node, this.environment, view, this.block, label, this.cleanups);
    else if (this.node.kind === 'reference') {
      const relation = this.model.references.find(ref => ref.from === this.node.from)!;
      element = document.createElement('button'); element.className = 'document-reference';
      element.textContent = relation.target?.label ?? `[@${relation.id}]`;
      element.title = relation.status === 'missing' ? '未找到引用目标' : relation.status === 'duplicate' ? '引用标识重复' : relation.status === 'pending' ? '正在解析文档' : '跳转到引用目标';
      element.addEventListener('click', () => this.environment.jump(relation.target?.from ?? this.editPosition));
      return element;
    } else {
      element = document.createElement('div'); element.className = 'document-table-container';
      if (label) { const caption = document.createElement('div'); caption.className = 'document-caption'; caption.textContent = label; element.append(caption); }
      const scroll = document.createElement('div'); scroll.className = 'document-table-scroll';
      const table = document.createElement('table'); table.className = 'document-table';
      this.node.children.filter(row => row.kind === 'row').forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        row.children.filter(cell => cell.kind === 'cell').forEach((cell, index) => {
          const td = document.createElement(rowIndex === 0 ? 'th' : 'td'); td.style.textAlign = this.node.align?.[index] ?? 'left';
          for (const child of cell.children) td.append(inline(child, this.environment, this.model, view, this.cleanups)); tr.append(td);
        }); table.append(tr);
      }); scroll.append(table); element.append(scroll);
    }
    element.title = '点击编辑源码'; element.addEventListener('click', () => { view.dispatch({ selection: { anchor: this.editPosition } }); view.focus(); });
    return element;
  }
  override ignoreEvent() { return true; }
  override destroy() { for (const cleanup of this.cleanups) cleanup(); }
}
const indexCache = new WeakMap<DocumentModel, { nodes: DocumentNode[]; parents: Map<string, DocumentNode>; attributeOwners: Map<number, DocumentNode> }>();
function previewIndex(model: DocumentModel) {
  let cached = indexCache.get(model); if (cached) return cached;
  const nodes: DocumentNode[] = [], parents = new Map<string, DocumentNode>(), attributeOwners = new Map<number, DocumentNode>();
  walkNodes(model.root, node => { parents.set(node.id, node); if (node.attribute) attributeOwners.set(node.attribute.from, node); if (['math', 'image', 'table', 'reference', 'attribute'].includes(node.kind)) nodes.push(node); });
  cached = { nodes, parents, attributeOwners }; indexCache.set(model, cached); return cached;
}
export const documentPreviewField = StateField.define<DecorationSet>({
  create: state => buildDocumentPreview(state),
  update: (value, transaction) => {
    // Replacing unrelated widgets at compositionstart can detach Chromium's IME
    // anchor. Keep existing DOM, map ranges, and refresh only after compositionend.
    if (transaction.state.field(composingField)) return value.map(transaction.changes);
    return transaction.docChanged || transaction.selection || transaction.effects.length || transaction.startState.field(structureField) !== transaction.state.field(structureField) || transaction.startState.facet(previewEnvironment) !== transaction.state.facet(previewEnvironment) ? buildDocumentPreview(transaction.state) : value;
  },
  provide: field => EditorView.decorations.from(field)
});
export function buildDocumentPreview(state: import('@codemirror/state').EditorState): DecorationSet {
  if (state.field(composingField)) return Decoration.none;
  const model = state.field(structureField), environment = state.facet(previewEnvironment), { nodes, parents, attributeOwners } = previewIndex(model);
  const decorations: ReturnType<Decoration['range']>[] = [], covered: { from: number; to: number }[] = [];
  const active = (from: number, to: number) => state.selection.ranges.some(range => range.from <= to && range.to >= from);
  for (const node of nodes) {
    if (covered.some(range => node.from >= range.from && node.to <= range.to)) continue;
    if (node.kind === 'table' && active(node.from, node.attribute?.to ?? node.to)) { covered.push({ from: node.from, to: node.to }); continue; }
    if (node.kind === 'attribute') {
      const linked = attributeOwners.get(node.from);
      if (environment.features.referencePreview && linked && !active(linked.from, linked.attribute?.to ?? linked.to)) decorations.push(Decoration.replace({}).range(node.from, node.to));
      continue;
    }
    const enabled = node.kind === 'math' ? environment.features.mathPreview : node.kind === 'image' ? environment.features.imagePreview : node.kind === 'table' ? environment.features.tablePreview : environment.features.referencePreview;
    if (!enabled || active(node.from, node.attribute?.to ?? node.to)) continue;
    const parent = node.parentId && parents.get(node.parentId);
    const standaloneImage = node.kind === 'image' && parent && parent.kind === 'paragraph' && parent.children.every(child => child === node || child.kind === 'attribute' || child.kind === 'text' && !child.text?.trim());
    const block = node.kind === 'table' || node.kind === 'math' && !!node.display || !!standaloneImage;
    const from = standaloneImage ? parent.from : node.from;
    const to = standaloneImage ? parent.to : block && environment.features.referencePreview ? node.attribute?.to ?? node.to : node.to;
    covered.push({ from, to });
    decorations.push(Decoration.replace({ block, widget: new DocumentWidget(node, model, environment, block, node.from) }).range(from, to));
  }
  return Decoration.set(decorations, true);
}
