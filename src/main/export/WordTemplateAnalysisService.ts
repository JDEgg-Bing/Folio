import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type { WordTemplateProfile } from '../../shared/wordTemplate';

export type TemplateAnalyzer = (bytes: Uint8Array, name: string, id: string, signal?: AbortSignal) => Promise<WordTemplateProfile>;
export type AnalysisWorkerFactory = (data: { bytes: Uint8Array; name: string; id: string }) => Pick<Worker, 'on' | 'removeAllListeners' | 'terminate'>;
export class WordTemplateAnalysisService {
  constructor(private readonly factory: AnalysisWorkerFactory = data => new Worker(join(__dirname, 'word-template-analysis-worker.js'), {
    workerData: data, transferList: [data.bytes.buffer as ArrayBuffer], resourceLimits: { maxOldGenerationSizeMb: 512 }
  }), private readonly timeoutMs = 30000) {}
  readonly analyze: TemplateAnalyzer = (bytes, name, id, signal) => new Promise((resolve, reject) => {
    if(signal?.aborted) { reject(new Error('模板分析已取消。')); return; }
    // Do not detach bytes retained by the template store.
    const worker = this.factory({bytes:Uint8Array.from(bytes),name,id});
    let settled = false;
    const finish = (error?: Error, profile?: WordTemplateProfile) => {
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
      worker.removeAllListeners();
      // An error already queued by a dying worker must not become an unhandled main-process error.
      worker.on('error',()=>{});
      void worker.terminate().catch(()=>{}).finally(()=>worker.removeAllListeners());
      if(error)reject(error);else if(profile)resolve(profile);else reject(new Error('模板分析结果无效。'));
    };
    const cancel = () => finish(new Error('模板分析已取消。'));
    const timer = setTimeout(()=>finish(new Error('模板分析超过 30 秒，请简化模板后重试。')),this.timeoutMs);
    signal?.addEventListener('abort',cancel,{once:true});
    worker.on('message',(message:{profile?:WordTemplateProfile;error?:string})=>finish(message.error?new Error(message.error):undefined,message.profile));
    worker.on('error',()=>finish(new Error('模板分析进程异常退出，请简化模板后重试。')));
    worker.on('exit',()=>finish(new Error('模板分析进程提前退出，请重试。')));
    if(signal?.aborted)cancel();
  });
}
