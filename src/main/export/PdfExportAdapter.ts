import { BrowserWindow } from 'electron';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExportAdapter, ExportRequest, ExportResult } from '../../document/export/ExportAdapter';
import { renderPdfManuscript } from '../../document/export/PdfRenderer';
import mathCss from 'katex/dist/katex.min.css';
import { manuscriptLayout } from '../../document/export/ManuscriptLayout';

export class PdfExportAdapter implements ExportAdapter {
  readonly format = 'pdf';
  async export(request: ExportRequest): Promise<ExportResult> {
    const manuscript = await renderPdfManuscript(request, mathCss);
    const page = manuscriptLayout(request.preset).page;
    const folder = await mkdtemp(join(tmpdir(), 'markdown-pdf-'));
    let window: BrowserWindow | null = null;
    try {
      const file = join(folder, 'manuscript.html');
      await writeFile(file, manuscript.html, 'utf8');
      request.signal.throwIfAborted();
      window = new BrowserWindow({ show: false, width: 794, height: 1123, backgroundColor: '#ffffff', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: `pdf-${crypto.randomUUID()}` } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      await window.loadFile(file);
      // Pagination must happen after both text metrics and images stabilize.
      const ready = await window.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));return [...document.images].every(img=>img.complete&&img.naturalWidth>0)})()`);
      if (!ready) throw new Error('导出图片未能完整加载，请检查图片格式后重试。');
      request.signal.throwIfAborted();
      const bytes = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
        headerTemplate: manuscript.headerTemplate, footerTemplate: manuscript.footerTemplate, pageSize: 'A4',
        margins: { top: page.top / 25.4, bottom: page.bottom / 25.4, left: page.left / 25.4, right: page.right / 25.4 } });
      return { bytes, mime: 'application/pdf', diagnostics: manuscript.diagnostics };
    } finally {
      window?.destroy();
      await rm(folder, { recursive: true, force: true });
    }
  }
}
