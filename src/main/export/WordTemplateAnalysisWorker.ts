import { parentPort, workerData } from 'node:worker_threads';
import { analyzeWordTemplate } from '../../document/templates/WordTemplateAnalyzer';

try {
  parentPort!.postMessage({ profile: analyzeWordTemplate(workerData.bytes, workerData.name, workerData.id) });
} catch (error) {
  parentPort!.postMessage({ error: error instanceof Error ? error.message : '无法分析 Word 模板。' });
}
