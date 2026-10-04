import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { basename, extname, join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { WordTemplateStore } from './WordTemplateStore';
import type { TemplateConfirmation } from '../../shared/wordTemplate';
import { WordTemplateAnalysisService } from './WordTemplateAnalysisService';
import { randomUUID } from 'node:crypto';

export function registerWordTemplates(getWindow: () => BrowserWindow | null): WordTemplateStore {
  const store = new WordTemplateStore(join(app.getPath('userData'), 'word-templates'),new WordTemplateAnalysisService().analyze);
  let task:{id:string;controller:AbortController}|undefined;
  const analyze=async(requestId:unknown,work:(signal:AbortSignal)=>Promise<unknown>)=>{
    const owner=getWindow()?.webContents;
    if(!owner || owner.isDestroyed())throw new Error('窗口已关闭。');
    if(task)throw new Error('已有模板正在分析，请先取消或等待完成。');
    const id=requestId===undefined?randomUUID():requestId;
    if(typeof id!=='string' || !/^[a-f0-9-]{36}$/.test(id))throw new Error('模板分析标识无效。');
    const controller=new AbortController();task={id,controller};
    const cancel=()=>controller.abort(); owner.once('destroyed',cancel);app.once('before-quit',cancel);
    try {return await work(controller.signal);}catch(error){if(controller.signal.aborted)return null;throw error;}
    finally {owner.removeListener('destroyed',cancel);app.removeListener('before-quit',cancel);if(task?.id===id)task=undefined;}
  };
  const handle = (name: string, fn: (value: any) => Promise<unknown>) => ipcMain.handle(`word-template:${name}`, async (event, value) => {
    if (event.sender !== getWindow()?.webContents) return { ok: false, message: '请求来源无效。' };
    try { return { ok: true, value: await fn(value) }; }
    catch (cause) { console.error(cause); return { ok: false, message: cause instanceof Error && /^[\u4e00-\u9fff]/.test(cause.message) ? cause.message : '无法读取或保存 Word 模板，请检查文件和磁盘空间。' }; }
  });
  handle('list', () => store.list());
  handle('import', requestId => analyze(requestId,async signal => {
    const result = await dialog.showOpenDialog(getWindow()!, { title: '导入 Word 模板', properties: ['openFile'], filters: [{ name: 'Word 模板或文档', extensions: ['docx', 'dotx'] }] });
    if (signal.aborted || result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    if (!/\.(docx|dotx)$/i.test(path)) throw new Error('请选择 DOCX 或 DOTX；旧版 DOC 和宏模板不受支持。');
    if ((await stat(path)).size > 25 * 1024 * 1024) throw new Error('模板超过 25 MB，请使用较小的文件。');
    return store.import(await readFile(path), basename(path, extname(path)),signal);
  }));
  handle('reanalyze', value => {
    if(!value || typeof value.id!=='string')throw new Error('模板标识无效。');
    return analyze(value.requestId,signal=>store.reanalyze(value.id,signal));
  });
  handle('cancel', async id => {if(task && task.id===id)task.controller.abort();});
  handle('discard', async id => {if(typeof id!=='string')throw new Error('模板标识无效。');store.discardDraft(id);});
  handle('confirm', (value: TemplateConfirmation) => store.confirm(value));
  handle('remove', id => store.remove(id));
  handle('default', id => store.setDefault(id));
  return store;
}
