import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { decodeMarkdown, encodeMarkdown } from '../files/encoding';
import { FileHandleRegistry } from '../files/fileHandles';
import { registerAssets, imageAssets } from '../assets/registerAssets';
import { userError } from '../../shared/chinese';
import { atomicWriteFile } from '../files/atomicWrite';
import type { SaveOptions } from '../../shared/desktopApi';
import { registerManuscriptExport } from '../export/registerManuscriptExport';
import { DocumentVersions, RecoveryStore, fingerprint } from '../files/DocumentProtection';
import type { RecoverySnapshot } from '../../shared/desktopApi';
import type { DecisionBroker } from '../interaction/DecisionBroker';

const registry = new FileHandleRegistry();
const versions = new DocumentVersions();
const filters = [{ name: 'Markdown', extensions: ['md', 'markdown'] }, { name: '所有文件', extensions: ['*'] }];

function validateOptions(value: unknown): asserts value is SaveOptions {
  if (!value || typeof value !== 'object') throw new Error('保存参数无效。');
  const options = value as Partial<SaveOptions>;
  if ((options.eol !== 'LF' && options.eol !== 'CRLF') || typeof options.hadBom !== 'boolean') {
    throw new Error('保存参数无效。');
  }
}

export function registerDocumentIpc(getWindow: () => BrowserWindow | null, takePending: () => string | null, decisions: DecisionBroker): void {
  const recovery = new RecoveryStore(join(app.getPath('userData'), 'recovery', 'draft.json'));
  registerAssets(registry, getWindow);
  registerManuscriptExport(registry, getWindow, decisions);
  const handle = (channel: string, fn: (...args: any[]) => Promise<unknown>) => ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== getWindow()?.webContents) return { ok: false, message: '请求来源无效。' };
    try { return { ok: true, value: await fn(event, ...args) }; }
    catch (cause) { console.error(cause); return { ok: false, message: userError(cause, channel === 'document:open' ? 'open' : 'save') }; }
  });
  const openPath = async (filePath: string) => {
    const bytes = await readFile(filePath);
    const opened = { ...decodeMarkdown(bytes), ...registry.register(filePath) };
    versions.remember(opened.fileHandleId, fingerprint(bytes));
    return opened;
  };
  handle('document:open-pending', async () => {
    const path = takePending();
    return path ? openPath(path) : null;
  });
  handle('document:check', async (_event, handleId: unknown) => {
    if (typeof handleId !== 'string') throw new Error('文档请求无效。');
    return versions.changed(handleId, registry.resolve(handleId));
  });
  handle('document:recovery-write', async (_event, value: unknown) => {
    if (value === null) { await recovery.write(null); return; }
    const snapshot = value as Partial<RecoverySnapshot> | null;
    if (!snapshot || typeof snapshot.text !== 'string' || snapshot.text.length > 20 * 1024 * 1024 ||
      typeof snapshot.displayName !== 'string' || (snapshot.fileHandleId !== null && typeof snapshot.fileHandleId !== 'string')) throw new Error('无法保存恢复草稿，文稿请及时手动保存（草稿上限 20 MB）。');
    validateOptions(snapshot.options);
    const filePath = snapshot.fileHandleId ? registry.resolve(snapshot.fileHandleId) : null;
    await recovery.write({ ...(snapshot as RecoverySnapshot), fileHandleId: null, version: 1, filePath,
      baseline: snapshot.fileHandleId ? versions.baseline(snapshot.fileHandleId) : null, updatedAt: new Date().toISOString() });
  });
  handle('document:recovery-read', async () => {
    const record = await recovery.read();
    if (!record) return null;
    const file = record.filePath ? registry.register(record.filePath) : { fileHandleId: '', displayName: record.displayName, displayPath: '' };
    if (record.filePath) versions.remember(file.fileHandleId, record.baseline);
    return { document: { ...file, text: record.text, eol: record.options.eol, hadBom: record.options.hadBom, mixedEol: false }, updatedAt: record.updatedAt };
  });
  handle('document:open', async () => {
    const window = getWindow();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, { title: '打开 Markdown 文稿 · 轻页', buttonLabel: '打开文稿', properties: ['openFile'], filters });
    if (result.canceled || !result.filePaths[0]) return null;
    return openPath(result.filePaths[0]);
  });

  handle('document:save', async (_event, handleId: unknown, text: unknown, rawOptions: unknown) => {
    if (typeof handleId !== 'string' || typeof text !== 'string') throw new Error('保存请求无效。');
    validateOptions(rawOptions);
    const path = registry.resolve(handleId);
    if (await versions.changed(handleId, path)) {
      const window = getWindow();
      if (!window) throw new Error('无法保存，请重试。');
      const choice = await decisions.ask(window, { title: '磁盘文件已改变',
        description: '其他程序已修改或删除此文件。覆盖会替换磁盘内容；取消后可用“另存为”保留两份文稿。',
        choices: [{ id: 'cancel', label: '取消' }, { id: 'overwrite', label: '覆盖磁盘文件', kind: 'danger' }], defaultChoice: 'cancel', cancelChoice: 'cancel' });
      if (choice !== 'overwrite') throw new Error('已取消保存，磁盘文件未被覆盖。可通过“文件 → 另存为”保留当前文稿。');
    }
    const bytes = encodeMarkdown(text, rawOptions.eol, rawOptions.hadBom);
    await atomicWriteFile(path, bytes);
    versions.remember(handleId, fingerprint(bytes));
  });

  handle('document:save-as', async (_event, text: unknown, rawOptions: unknown, suggestedName: unknown, previousHandleId: unknown) => {
    if (typeof text !== 'string') throw new Error('保存请求无效。');
    validateOptions(rawOptions);
    const window = getWindow();
    if (!window) return null;
    const defaultName = typeof suggestedName === 'string' ? basename(suggestedName) : 'Untitled.md';
    const result = await dialog.showSaveDialog(window, { title: '保存 Markdown 文稿 · 轻页', buttonLabel: '保存文稿', defaultPath: defaultName, filters });
    if (result.canceled || !result.filePath) return null;
    let filePath = result.filePath;
    if (!extname(filePath)) filePath += '.md';
    const assets = typeof previousHandleId === 'string' ? await imageAssets.copyForSaveAs(registry.resolve(previousHandleId), filePath, text) : null;
    // Save As to the current path must use the same external-change protection.
    if (typeof previousHandleId === 'string' && filePath.toLowerCase() === registry.resolve(previousHandleId).toLowerCase() && await versions.changed(previousHandleId, filePath)) {
      await assets?.rollback();
      throw new Error('磁盘文件已改变，请选择不同的文件名，或使用“保存”确认覆盖。');
    }
    const bytes = encodeMarkdown(text, rawOptions.eol, rawOptions.hadBom);
    try { await atomicWriteFile(filePath, bytes); }
    catch (cause) { await assets?.rollback(); throw cause; }
    const saved = registry.register(filePath);
    versions.remember(saved.fileHandleId, fingerprint(bytes));
    return saved;
  });

}
