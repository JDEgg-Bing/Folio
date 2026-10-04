import type { DocumentModel } from '../model';
import type { WritingAppearance } from '../../renderer/preferences/WritingAppearance';

export interface ExportResourceReader { read(destination: string, signal: AbortSignal): Promise<{ bytes: Uint8Array; mime: string }> }
export interface ExportRequest { model: DocumentModel; appearance: Readonly<WritingAppearance>; preset?: import('./ManuscriptLayout').ExportPresetId; template?: import('../templates/WordTemplateRenderer').WordTemplateExport; resources: ExportResourceReader; signal: AbortSignal }
export interface ExportResult { bytes: Uint8Array; mime: string; diagnostics: readonly string[] }
export interface ExportAdapter { readonly format: 'pdf' | 'docx'; export(request: ExportRequest): Promise<ExportResult> }
export interface ExportVersion { documentId: string; revision: number }
export async function exportDocument(adapter: ExportAdapter, request: ExportRequest, version: ExportVersion): Promise<ExportResult> {
  if (!request.model.complete || request.model.revision !== version.revision || request.model.documentId !== version.documentId) throw new Error('文档结构尚未完成或版本已改变，请稍后重试。');
  request.signal.throwIfAborted();
  const result = await adapter.export(request); request.signal.throwIfAborted(); return result;
}
