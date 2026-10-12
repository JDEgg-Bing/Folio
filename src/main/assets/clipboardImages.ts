import { execFile } from 'node:child_process';
import { clipboard } from 'electron';
import type { ImageAssetService } from './ImageAssetService';

// Windows CF_HDROP is not exposed by Electron's clipboard API. No paths are
// interpolated into this fixed script. Clipboard access requires an STA thread.
export function clipboardFilePaths(): Promise<string[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);
  return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command',
    "Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $items = @(); if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) { $items = @([System.Windows.Forms.Clipboard]::GetFileDropList()) }; ConvertTo-Json -InputObject $items -Compress"],
  { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024, encoding: 'utf8' }, (error, stdout) => {
    if (error) { reject(error); return; }
    try { const paths = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()); if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string')) throw new Error('剪贴板文件列表无效。'); resolve(paths); } catch (cause) { reject(cause); }
  }));
}
export async function stageClipboardImages(assets: ImageAssetService): Promise<string[]> {
  const paths = (await clipboardFilePaths()).filter(path => /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(path));
  if (paths.length) return assets.stage(paths);
  const image = clipboard.readImage();
  return image.isEmpty() ? [] : assets.stageBytes([{ bytes: image.toPNG(), mime: 'image/png', name: 'image.png' }]);
}
