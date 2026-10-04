import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { join, resolve } from 'node:path';
import { PRODUCT_NAME } from '../shared/product';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 420,
    title: `未命名文档 — ${PRODUCT_NAME}`,
    icon: app.isPackaged ? join(process.resourcesPath, 'folio.ico') : resolve('assets/folio.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#b1b8af' : '#626860', height: 44 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#232625' : '#faf9f6',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  window.setMenuBarVisibility(false);
  window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  window.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && (input.key.toLowerCase() === 'r' || input.shift && input.key.toLowerCase() === 'i') || input.key === 'F5' || input.key === 'F12') event.preventDefault();
  });
  window.webContents.on('render-process-gone', () => {
    void import('electron').then(async ({ dialog }) => {
      const result = await dialog.showMessageBox(window, { type: 'error', title: PRODUCT_NAME,
        message: '写作界面意外停止。', detail: '重新打开后可恢复最近的本地草稿。最后一小段输入可能尚未写入恢复草稿。',
        buttons: ['重新打开', '退出'], defaultId: 0, cancelId: 1 });
      if (result.response === 0) app.relaunch();
      app.exit(1);
    });
  });
  const updateBackground = () => {
    window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#232625' : '#faf9f6');
    window.setTitleBarOverlay({ color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#b1b8af' : '#626860', height: 44 });
  };
  nativeTheme.on('updated', updateBackground);
  window.on('closed', () => nativeTheme.removeListener('updated', updateBackground));

  let closeApproved = false;
  let closeRequestPending = false;
  let editorReady = false;
  const stateHandler = (event: Electron.IpcMainEvent) => { if (event.sender === window.webContents) editorReady = true; };
  ipcMain.on('app:document-state', stateHandler);
  window.on('close', (event) => {
    // Before the editor mounts there cannot be new edits. Allow startup to be
    // canceled without sending a close request to a bridge that does not exist.
    // Existing recovery data is left intact for the next launch.
    if (closeApproved || !editorReady) return;
    event.preventDefault();
    if (!closeRequestPending) {
      closeRequestPending = true;
      window.webContents.send('app:request-close');
    }
  });
  const completionHandler = (event: Electron.IpcMainEvent, approved: unknown) => {
    if (event.sender !== window.webContents) return;
    if (typeof approved !== 'boolean') return;
    closeRequestPending = false;
    if (approved) {
      closeApproved = true;
      window.close();
    }
  };
  ipcMain.on('app:complete-close', completionHandler);
  window.on('closed', () => { ipcMain.removeListener('app:complete-close', completionHandler); ipcMain.removeListener('app:document-state', stateHandler); });

  return window;
}
