import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionBroker } from '../../src/main/interaction/DecisionBroker';
const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => void>());
vi.mock('electron', () => ({ ipcMain: { on: (id: string, handler: any) => handlers.set(id, handler) } }));
const options = { title: '覆盖文件？', description: '请核对', choices: [{ id: 'cancel', label: '取消' }, { id: 'overwrite', label: '覆盖' }], defaultChoice: 'cancel', cancelChoice: 'cancel' };
function owner() {
  const webContents = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: (): boolean => false });
  return Object.assign(new EventEmitter(), { webContents, isDestroyed: (): boolean => false });
}
beforeEach(() => handlers.clear());
describe('application decisions', () => {
  it('rejects other windows and unknown answers, accepts the owner once', async () => {
    const broker = new DecisionBroker(), window = owner(), done = vi.fn();
    const promise = broker.ask(window as any, options).then(done);
    const request = window.webContents.send.mock.calls[0][1];
    const answer = handlers.get('interaction:answer')!;
    answer({ sender: {} }, request.id, 'overwrite');
    answer({ sender: window.webContents }, request.id, 'unknown');
    await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    answer({ sender: window.webContents }, request.id, 'cancel');
    answer({ sender: window.webContents }, request.id, 'overwrite');
    await promise; expect(done).toHaveBeenCalledExactlyOnceWith('cancel');
    expect(window.listenerCount('closed')).toBe(0);
    expect(window.webContents.listenerCount('render-process-gone')).toBe(0);
  });
  it.each(['closed', 'render-process-gone'])('cancels pending operations on %s', async event => {
    const window = owner(), broker = new DecisionBroker();
    const result = broker.ask(window as any, options);
    (event === 'closed' ? window : window.webContents).emit(event);
    expect(await result).toBe('cancel');
  });
  it('does not send a request to a destroyed window', async () => {
    const window = owner(); window.isDestroyed = () => true;
    expect(await new DecisionBroker().ask(window as any, options)).toBe('cancel');
    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});
