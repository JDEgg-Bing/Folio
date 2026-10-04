export interface SourceRange { from: number; to: number }
export interface TextSource { length: number; read(from: number, to: number): string }
export type NodeKind = 'document' | 'paragraph' | 'heading' | 'list' | 'listItem' | 'quote' | 'code' | 'rule' | 'image' | 'table' | 'row' | 'cell' | 'math' | 'reference' | 'attribute' | 'text' | 'strong' | 'emphasis' | 'strike' | 'inlineCode' | 'link' | 'raw';
export interface DocumentNode extends SourceRange {
  id: string; kind: NodeKind; parentId: string | null; children: DocumentNode[];
  text?: string; level?: number; destination?: string; display?: boolean;
  sourceText?: string; ordered?: boolean; start?: number;
  sourceType?: string;
  referenceId?: string; attribute?: SourceRange; align?: ('left' | 'center' | 'right')[];
  /** Distinguishes an explicit Markdown alignment from the default left alignment. */
  alignExplicit?: boolean[];
}
export type ReferenceType = 'sec' | 'fig' | 'tbl' | 'eq';
export interface ReferenceTarget { id: string; type: ReferenceType; nodeId: string; from: number; to: number; label: string; number: number | null }
export interface ReferenceRelation extends SourceRange { id: string; status: 'resolved' | 'missing' | 'duplicate' | 'pending'; target?: ReferenceTarget }
export interface DocumentDiagnostic extends SourceRange { code: 'duplicate-id' | 'missing-id' | 'wrong-type' | 'orphan-id'; message: string }
export interface DocumentModel {
  documentId: string; revision: number; complete: boolean; root: DocumentNode;
  headings: DocumentNode[]; images: DocumentNode[]; targets: ReadonlyMap<string, readonly ReferenceTarget[]>;
  references: ReferenceRelation[]; diagnostics: DocumentDiagnostic[];
}
export function walkNodes(root: DocumentNode, visit: (node: DocumentNode) => void): void {
  visit(root); for (const child of root.children) walkNodes(child, visit);
}
export function semanticText(node: DocumentNode): string {
  if (node.kind === 'attribute') return '';
  if (node.kind === 'image') return node.text ?? '';
  return node.text ?? node.children.map(semanticText).join('');
}
