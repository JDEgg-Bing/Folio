import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopAPI, SaveOptions, ImageDrop } from '../shared/desktopApi';

async function invoke(channel: string, ...args: unknown[]) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
const dropListeners = new Set<(drop: ImageDrop) => void>();
window.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files') && (event.target as Element)?.closest('.cm-editor')) event.preventDefault(); });
window.addEventListener('drop', async event => {
  if (!(event.target as Element)?.closest('.cm-editor') || !event.dataTransfer?.files.length) return;
  const files = [...event.dataTransfer.files];
  if (!files.some(file => /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name))) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const x = event.clientX, y = event.clientY;
  const id = crypto.randomUUID();
  // Bind the editor bookmark before asynchronous validation can outlive a document.
  for (const listener of dropListeners) listener({ id, phase: 'start', x, y, tickets: [] });
  try {
    const tickets = await invoke('asset:stage', files.map(file => webUtils.getPathForFile(file)));
    for (const listener of dropListeners) listener({ id, phase: 'ready', x, y, tickets });
  } catch { for (const listener of dropListeners) listener({ id, phase: 'ready', x, y, tickets: [], error: '无法导入图片，请检查格式和文件是否可读取。' }); }
}, true);

const api: DesktopAPI = {
  onDecisionRequest: listener => {
    const handler = (_event: Electron.IpcRendererEvent, request: import('../shared/interaction').DecisionRequest) => listener(request);
    ipcRenderer.on('interaction:request', handler);
    return () => ipcRenderer.removeListener('interaction:request', handler);
  },
  answerDecision: (id, answer) => ipcRenderer.send('interaction:answer', id, answer),
  wordTemplates: {
    list: () => invoke('word-template:list'), import: requestId => invoke('word-template:import',requestId),
    reanalyze: (id,requestId) => invoke('word-template:reanalyze',{id,requestId}),
    cancelAnalysis: requestId => invoke('word-template:cancel',requestId), discardDraft: id => invoke('word-template:discard',id),
    confirm: value => invoke('word-template:confirm', value), remove: id => invoke('word-template:remove', id),
    setDefault: id => invoke('word-template:default', id)
  },
  runMenuCommand: command => invoke('app:menu-command', command),
  exportDocx: input => invoke('document:export-docx', input),
  exportPdf: input => invoke('document:export-pdf', input),
  openDocument: () => invoke('document:open'),
  openPendingDocument: () => invoke('document:open-pending'),
  ready: () => ipcRenderer.send('app:ready'),
  onOpenDocument: listener => {
    const handler = () => listener();
    ipcRenderer.on('document:open-request', handler);
    return () => ipcRenderer.removeListener('document:open-request', handler);
  },
  writeRecovery: snapshot => invoke('document:recovery-write', snapshot),
  readRecovery: () => invoke('document:recovery-read'),
  checkDocument: handle => invoke('document:check', handle),
  getAppInfo: () => invoke('app:info'),
  revealDataFolder: () => invoke('app:reveal-data'),
  copyFeedback: text => invoke('app:copy-feedback', text),
  saveDocument: (handleId, text, options) => invoke('document:save', handleId, text, options),
  saveDocumentAs: (text, options, suggestedName, previousHandleId) => invoke('document:save-as', text, options, suggestedName, previousHandleId),
  resolveImage: (handle, destination) => invoke('asset:resolve', handle, destination),
  importImages: (handle, tickets) => invoke('asset:import', handle, tickets),
  onImageDrop: listener => { dropListeners.add(listener); return () => { dropListeners.delete(listener); }; },
  setDocumentFeatures: features => ipcRenderer.send('app:features', features),
  onCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: string) => listener(command);
    ipcRenderer.on('app:command', handler);
    return () => ipcRenderer.removeListener('app:command', handler);
  },
  confirmUnsavedChanges: () => ipcRenderer.invoke('app:confirm-close'),
  setDocumentState: (state) => ipcRenderer.send('app:document-state', state),
  completeClose: (approved) => ipcRenderer.send('app:complete-close', approved),
  onRequestClose: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('app:request-close', handler);
    return () => ipcRenderer.removeListener('app:request-close', handler);
  },
  showMessage: (message) => ipcRenderer.send('app:show-error', message)
};

contextBridge.exposeInMainWorld('desktopAPI', api);

export type { SaveOptions };
