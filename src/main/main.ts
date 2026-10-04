import { menuTemplate } from './menu';
import { normalizeDocumentFeatures } from '../renderer/preferences/DocumentFeatures';
import { app, Menu, dialog, ipcMain, BrowserWindow, protocol, shell, clipboard } from 'electron';
import { createMainWindow } from './window';
import { registerDocumentIpc } from './ipc/documents';
import { join } from 'node:path';
import { MENU_COMMAND_IDS } from '../shared/appMenu';
import { PRODUCT_NAME } from '../shared/product';
import { handleInstallerEvent, markdownArgument } from './lifecycle';
import { mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DecisionBroker } from './interaction/DecisionBroker';

// A rename must not strand existing appearance preferences. Keep explicit test
// or --user-data-dir profiles, and retain the original default profile location.
if (app.getPath('userData') === join(app.getPath('appData'), app.getName())) {
  app.setPath('userData', join(app.getPath('appData'), 'Markdown Editor'));
}
app.setName(PRODUCT_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.squirrel.markdown_editor_v1.Folio');

let mainWindow: ReturnType<typeof createMainWindow> | null = null;
let documentState = { dirty: false, title: '未命名文档' };
let rendererReady = false;
let pendingPath = markdownArgument(process.argv.slice(app.isPackaged ? 1 : 2));
const requestOpen = (path: string | null) => {
  if (path) pendingPath = path;
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
    if (rendererReady && pendingPath) mainWindow.webContents.send('document:open-request');
  }
};

function sendCommand(command: string): void { mainWindow?.webContents.send('app:command', command); }

let features = normalizeDocumentFeatures(null);
function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(sendCommand, features)));
  mainWindow?.setMenuBarVisibility(false);
}
protocol.registerSchemesAsPrivileged([{ scheme: 'md-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const installerEvent = process.platform === 'win32' ? process.argv.find(arg => /^--squirrel-(install|updated|uninstall|obsolete)$/.test(arg)) : undefined;
if (installerEvent) {
  void handleInstallerEvent(installerEvent, process.execPath).catch(console.error).finally(() => app.quit());
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
app.on('second-instance', (_event, args) => requestOpen(markdownArgument(args.slice(1))));
app.on('open-file', (event, path) => { event.preventDefault(); requestOpen(path); });
app.whenReady().then(() => {
  const decisions = new DecisionBroker();
  registerDocumentIpc(() => mainWindow, () => { const path = pendingPath; pendingPath = null; return path; }, decisions);
  ipcMain.on('app:ready', event => {
    if (event.sender !== mainWindow?.webContents || rendererReady) return;
    rendererReady = true;
    if (pendingPath) mainWindow.webContents.send('document:open-request');
  });
  const handle = (channel: string, fn: (...args: any[]) => unknown) => ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== mainWindow?.webContents) return { ok: false, message: '请求来源无效。' };
    try { return { ok: true, value: await fn(...args) }; }
    catch { return { ok: false, message: '无法完成操作，请重试。' }; }
  });
  handle('app:info', () => ({ name: PRODUCT_NAME, version: app.getVersion(), dataPath: app.getPath('userData'), packaged: app.isPackaged, hasPendingFile: !!pendingPath }));
  handle('app:reveal-data', async () => {
    const folder = app.getPath('userData');
    await mkdir(folder, { recursive: true });
    const source = app.isPackaged ? join(process.resourcesPath, 'release-resources') : resolve('out/release-resources');
    await cp(source, join(folder, '发布资料'), { recursive: true });
    const message = await shell.openPath(folder); if (message) throw new Error(message);
  });
  handle('app:copy-feedback', (text: unknown) => { if (typeof text !== 'string' || text.length > 20000) throw new Error('反馈内容无效'); clipboard.writeText(text); });
  ipcMain.handle('app:menu-command', (event, command: unknown) => {
    if (event.sender !== mainWindow?.webContents || typeof command !== 'string' || !MENU_COMMAND_IDS.has(command)) return { ok: false, message: '菜单命令无效。' };
    const item = Menu.getApplicationMenu()?.getMenuItemById(command);
    if (!item || !item.enabled) return { ok: false, message: '菜单命令不可用。' };
    const window = mainWindow!;
    const contents = window.webContents;
    // Menu roles have no public click callback. Use the same Electron commands
    // for the custom panel; the hidden native menu still owns accelerators.
    switch (command) {
      case 'role:undo': contents.undo(); break;
      case 'role:redo': contents.redo(); break;
      case 'role:cut': contents.cut(); break;
      case 'role:copy': contents.copy(); break;
      case 'role:paste': contents.paste(); break;
      case 'role:selectAll': contents.selectAll(); break;
      case 'role:quit': app.quit(); break;
      case 'role:resetZoom': contents.setZoomLevel(0); break;
      case 'role:zoomIn': contents.setZoomLevel(contents.getZoomLevel() + 0.5); break;
      case 'role:zoomOut': contents.setZoomLevel(contents.getZoomLevel() - 0.5); break;
      case 'role:togglefullscreen': window.setFullScreen(!window.isFullScreen()); break;
      default: item.click(item, window, {} as Electron.KeyboardEvent);
    }
    return { ok: true };
  });
  ipcMain.on('app:document-state', (event, state: unknown) => {
    if (event.sender !== mainWindow?.webContents) return;
    if (state && typeof state === 'object') {
      const next = state as { dirty?: unknown; title?: unknown };
      documentState = { dirty: next.dirty === true, title: typeof next.title === 'string' && next.title.trim() ? next.title : '未命名文档' };
      if (mainWindow) mainWindow.setTitle(`${documentState.title}${documentState.dirty ? ' •' : ''} — ${PRODUCT_NAME}`);
    }
  });
  ipcMain.handle('app:confirm-close', async event => {
    if (event.sender !== mainWindow?.webContents) return 'cancel';
    if (!documentState.dirty) return 'discard';
    return decisions.ask(mainWindow!, { title: `保存“${documentState.title}”的修改？`,
      description: '保存后再继续，或选择不保存并放弃这次修改。取消会留在当前文稿。',
      choices: [{ id: 'cancel', label: '取消' }, { id: 'discard', label: '不保存', kind: 'danger' }, { id: 'save', label: '保存', kind: 'primary' }],
      defaultChoice: 'save', cancelChoice: 'cancel' });
  });
  ipcMain.on('app:show-error', (event, message: unknown) => {
    if (event.sender !== mainWindow?.webContents) return;
    if (typeof message === 'string') void dialog.showMessageBox(mainWindow!, { type: 'error', message: PRODUCT_NAME, detail: message });
  });
  ipcMain.on('app:features', (event, value: unknown) => { if (event.sender === mainWindow?.webContents) { features = normalizeDocumentFeatures(value); installMenu(); } });
  installMenu();
  const openWindow = () => {
    rendererReady = false;
    mainWindow = createMainWindow();
    mainWindow.on('closed', () => { mainWindow = null; rendererReady = false; documentState = { dirty: false, title: '未命名文档' }; });
  };
  openWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openWindow(); });
});
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
