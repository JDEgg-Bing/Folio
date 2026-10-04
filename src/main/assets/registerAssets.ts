import { ipcMain, protocol } from 'electron';
import { ImageAssetService } from './ImageAssetService';
import type { FileHandleRegistry } from '../files/fileHandles';
import { userError } from '../../shared/chinese';

export const imageAssets = new ImageAssetService();
export function registerAssets(registry: FileHandleRegistry, getWindow: () => Electron.BrowserWindow | null): void {
  protocol.handle('md-asset', async request => {
    try {
      const { bytes, mime } = await imageAssets.resource(new URL(request.url).pathname.slice(1));
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': mime, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' } });
    } catch { return new Response('图片不可用', { status: 404 }); }
  });
  const safe = (fn: (...args: unknown[]) => Promise<unknown>) => async (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    if (event.sender !== getWindow()?.webContents) return { ok: false, message: '请求来源无效。' };
    try { return { ok: true, value: await fn(...args) }; } catch (cause) { console.error(cause); return { ok: false, message: userError(cause, 'image') }; }
  };
  ipcMain.handle('asset:stage', safe(async paths => { if (!Array.isArray(paths) || paths.length > 30 || paths.some(path => typeof path !== 'string')) throw new Error('图片请求无效。'); return imageAssets.stage(paths); }));
  ipcMain.handle('asset:resolve', safe(async (handle, destination) => {
    if ((handle !== null && typeof handle !== 'string') || typeof destination !== 'string' || destination.length > 4096) throw new Error('图片路径无效。');
    return imageAssets.resolve(handle === null ? null : registry.resolve(handle as string), destination);
  }));
  ipcMain.handle('asset:import', safe(async (handle, ids) => {
    if (typeof handle !== 'string' || !Array.isArray(ids) || ids.length > 30 || ids.some(id => typeof id !== 'string')) throw new Error('图片导入请求无效。');
    return imageAssets.import(registry.resolve(handle), ids);
  }));
}
