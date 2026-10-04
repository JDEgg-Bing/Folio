import { randomUUID } from 'node:crypto';
import { ipcMain, type BrowserWindow } from 'electron';
import type { DecisionRequest } from '../../shared/interaction';

type Options = Omit<DecisionRequest, 'id'>;
export class DecisionBroker {
  private pending = new Map<string, { window: BrowserWindow; request: DecisionRequest; finish(value: string): void }>();
  constructor() {
    ipcMain.on('interaction:answer', (event, id: unknown, answer: unknown) => {
      if (typeof id !== 'string' || typeof answer !== 'string') return;
      const entry = this.pending.get(id);
      if (entry && event.sender === entry.window.webContents && entry.request.choices.some(c => c.id === answer)) entry.finish(answer);
    });
  }
  ask(window: BrowserWindow, options: Options): Promise<string> {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return Promise.resolve(options.cancelChoice);
    return new Promise(resolve => {
      const request = { ...options, id: randomUUID() };
      const cancel = () => finish(options.cancelChoice);
      const finish = (answer: string) => {
        if (!this.pending.delete(request.id)) return;
        window.removeListener('closed', cancel);
        window.webContents.removeListener('render-process-gone', cancel);
        resolve(answer);
      };
      this.pending.set(request.id, { window, request, finish });
      window.once('closed', cancel);
      window.webContents.once('render-process-gone', cancel);
      window.webContents.send('interaction:request', request);
    });
  }
}
