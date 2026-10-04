import { BrowserWindow, nativeImage } from 'electron';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import katex from 'katex';
import mathCss from 'katex/dist/katex.min.css';
import { renderDocx } from '../../document/export/DocxRenderer';
import type { ExportAdapter, ExportRequest } from '../../document/export/ExportAdapter';

/** Only individual unsupported images/formulas are rasterized, never the manuscript. */
async function rasterize(content: string, signal: AbortSignal): Promise<Uint8Array> {
  const folder = await mkdtemp(join(tmpdir(), 'markdown-docx-'));
  let window: BrowserWindow | undefined;
  try {
    signal.throwIfAborted();
    const file = join(folder, 'asset.html');
    await writeFile(file, `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>${mathCss}body{margin:0;background:white}#asset{display:inline-block;font-size:24px;color:black}img{display:block;max-width:1200px;max-height:1200px}.katex-display{margin:0}</style><div id="asset">${content}</div>`);
    window = new BrowserWindow({ show: false, width: 1600, height: 1400, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: `docx-${crypto.randomUUID()}` } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await window.loadFile(file);
    const bounds = await window.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));const b=document.getElementById('asset').getBoundingClientRect();return {x:0,y:0,width:Math.ceil(b.width),height:Math.ceil(b.height)}})()`);
    if (bounds.width > 1600 || bounds.height > 1400 || bounds.width < 1 || bounds.height < 1) throw new Error('资源尺寸超过导出范围');
    signal.throwIfAborted();
    // capturePage returns device pixels (e.g. 200% Windows display scaling).
    // Normalize to CSS pixels so manuscript sizes do not depend on the monitor.
    return (await window.webContents.capturePage(bounds)).resize({ width: bounds.width, height: bounds.height }).toPNG();
  } finally { window?.destroy(); await rm(folder, { recursive: true, force: true }); }
}
export class DocxExportAdapter implements ExportAdapter {
  readonly format = 'docx';
  export(request: ExportRequest) {
    return renderDocx(request, {
      async image(bytes, mime, signal) {
        signal.throwIfAborted();
        if (!/^image\/(?:png|jpeg|webp|gif|bmp|avif|svg\+xml)$/.test(mime)) throw new Error('不支持此图片格式');
        if (mime === 'image/svg+xml') return rasterize(`<img src="data:${mime};base64,${Buffer.from(bytes).toString('base64')}" alt="">`, signal);
        const image = nativeImage.createFromBuffer(Buffer.from(bytes));
        if (image.isEmpty()) throw new Error('不支持此图片格式');
        return image.toPNG();
      },
      async formula(latex, display, signal) {
        const html = katex.renderToString(latex, { displayMode: display, throwOnError: true, trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 });
        return rasterize(html, signal);
      }
    });
  }
}
