import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { basename, extname, resolve } from 'node:path';
import { parser, GFM } from '@lezer/markdown';
import { documentSyntax } from '../../document/markdownSyntax';
import { DocumentStructureService } from '../../document/DocumentStructureService';
import { exportDocument } from '../../document/export/ExportAdapter';
import { normalizeWritingAppearance } from '../../renderer/preferences/WritingAppearance';
import type { ManuscriptExportInput } from '../../shared/desktopApi';
import type { FileHandleRegistry } from '../files/fileHandles';
import { imageAssets } from '../assets/registerAssets';
import { atomicWriteFile } from '../files/atomicWrite';
import { PdfExportAdapter } from './PdfExportAdapter';
import { DocxExportAdapter } from './DocxExportAdapter';
import { EXPORT_PRESETS, exportPresetIds } from '../../document/export/ManuscriptLayout';
import { registerWordTemplates } from './registerWordTemplates';
import type { ExportPresetId } from '../../document/export/ManuscriptLayout';
import type { DecisionBroker } from '../interaction/DecisionBroker';

export function registerManuscriptExport(registry: FileHandleRegistry, getWindow: () => BrowserWindow | null, decisions: DecisionBroker): void {
  const templates = registerWordTemplates(getWindow);
  let exporting = false;
  for (const format of ['pdf', 'docx'] as const) {
    const name = format === 'pdf' ? 'PDF' : 'Word';
    ipcMain.handle(`document:export-${format}`, async (event, value: unknown) => {
      const parent = getWindow();
      if (!parent || event.sender !== parent.webContents) return { ok: false, message: '请求来源无效。' };
      if (exporting) return { ok: false, message: '正在导出文稿，请稍候。' };
      exporting = true;
      try {
        const input = value as Partial<ManuscriptExportInput> | null;
        if (!input || typeof input.text !== 'string' || input.text.length > 20 * 1024 * 1024 || (input.fileHandleId !== null && typeof input.fileHandleId !== 'string')) throw new Error('导出请求无效或文档超过 20 MB。');
        const documentPath = input.fileHandleId ? registry.resolve(input.fileHandleId) : null;
        if (input.templateId !== undefined && (format !== 'docx' || typeof input.templateId !== 'string')) throw new Error('模板导出请求无效。');
        const template = input.templateId ? await templates.get(input.templateId) : undefined;
        if (template && (!template.profile.confirmed || template.profile.warnings.length && !template.profile.warningsAccepted)) throw new Error('请先确认模板识别结果。');
        let preset: ExportPresetId | undefined = 'manuscript';
        if (!template) {
        const choice = await decisions.ask(parent, { title: `导出 ${name}`, description: '选择成稿的排版。导出使用独立版式，屏幕外观与强调色不会进入成稿。',
          choices: [...exportPresetIds.map(id => ({ id, label: EXPORT_PRESETS[id].label, description: EXPORT_PRESETS[id].description })), { id: 'cancel', label: '取消' }],
          defaultChoice: 'manuscript', cancelChoice: 'cancel', selection: true, confirmLabel: '选择保存位置' });
        if (choice === 'cancel') return { ok: true, value: null };
        preset = choice as ExportPresetId;
        }
        const suggestion = typeof input.suggestedName === 'string' ? basename(input.suggestedName).replace(/\.[^.]+$/, '') + `.${format}` : `未命名文档.${format}`;
        const chosen = await dialog.showSaveDialog(parent, { title: `导出 ${name}`, defaultPath: suggestion, filters: [{ name: `${name} 文稿`, extensions: [format] }] });
        if (chosen.canceled || !chosen.filePath) return { ok: true, value: null };
        let target = chosen.filePath;
        if (extname(target).toLowerCase() !== `.${format}`) target += `.${format}`;
        if (documentPath && resolve(target).toLowerCase() === resolve(documentPath).toLowerCase()) throw new Error('导出保存位置不能覆盖当前 Markdown 文档。');
        const source = input.text.replace(/\r\n?/g, '\n');
        // Build a complete immutable export snapshot; viewport parsing and editor
        // selection never determine what is exported.
        const model = new DocumentStructureService().build({ length: source.length, read: (from, to) => source.slice(from, to) }, parser.configure([GFM, documentSyntax]).parse(source));
        const result = await exportDocument(format === 'pdf' ? new PdfExportAdapter() : new DocxExportAdapter(), {
          model, preset, template, appearance: normalizeWritingAppearance(input.appearance), signal: new AbortController().signal,
          resources: { async read(destination, signal) {
            signal.throwIfAborted();
            const resolved = await imageAssets.resolve(documentPath, destination);
            return imageAssets.resource(new URL(resolved.url).pathname.slice(1));
          } }
        }, { documentId: model.documentId, revision: model.revision });
        await atomicWriteFile(target, Buffer.from(result.bytes));
        return { ok: true, value: { displayName: basename(target), diagnostics: [...result.diagnostics] } };
      } catch (cause) {
        console.error(cause);
        const message = cause instanceof Error && /^[\u4e00-\u9fff]/.test(cause.message) ? cause.message : `无法导出 ${name}，请检查图片、保存位置和磁盘空间。`;
        return { ok: false, message };
      } finally { exporting = false; }
    });
  }
}
