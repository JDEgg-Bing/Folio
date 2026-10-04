import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { registerManuscriptExport } from '../../src/main/export/registerManuscriptExport';
import { FileHandleRegistry } from '../../src/main/files/fileHandles';
import { renderDocx } from '../../src/document/export/DocxRenderer';
import type { ExportRequest } from '../../src/document/export/ExportAdapter';
import { DEFAULT_WRITING_APPEARANCE } from '../../src/renderer/preferences/WritingAppearance';
import { WordTemplateStore } from '../../src/main/export/WordTemplateStore';
import { analyzeWordTemplate } from '../../src/document/templates/WordTemplateAnalyzer';
import { wordTemplateFixture } from './wordTemplateFixtures';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<any>>(), preset: vi.fn(), save: vi.fn(), write: vi.fn(), docx: vi.fn(), pdf: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => 'D:/test-profile' }, dialog: { showMessageBox: mocks.preset, showSaveDialog: mocks.save }, ipcMain: { handle: (name: string, handler: any) => mocks.handlers.set(name, handler) } }));
vi.mock('../../src/main/export/DocxExportAdapter', () => ({ DocxExportAdapter: class { format = 'docx'; export = mocks.docx; } }));
vi.mock('../../src/main/export/PdfExportAdapter', () => ({ PdfExportAdapter: class { format = 'pdf'; export = mocks.pdf; } }));
vi.mock('../../src/main/files/atomicWrite', () => ({ atomicWriteFile: mocks.write }));
vi.mock('../../src/main/assets/registerAssets', () => ({ imageAssets: {} }));
const sender = {}, window = { webContents: sender };
let registry: FileHandleRegistry;
const input = () => ({ text: '# 标题\r\n\r\n当前未保存的 **正文**', fileHandleId: null, suggestedName: '文稿.md', appearance: { ...DEFAULT_WRITING_APPEARANCE } });
const invoke = (value: unknown = input(), source = sender) => mocks.handlers.get('document:export-docx')!({ sender: source }, value);
beforeEach(() => {
  vi.clearAllMocks(); mocks.handlers.clear(); registry = new FileHandleRegistry();
  registerManuscriptExport(registry, () => window as any, { ask: async () => {
    const choice = await mocks.preset(); return ['manuscript', 'academic', 'reading', 'cancel'][choice.response];
  } } as any);
  mocks.preset.mockResolvedValue({ response: 0 });
  mocks.save.mockResolvedValue({ canceled: false, filePath: 'D:/output/文稿' }); mocks.write.mockResolvedValue(undefined);
  mocks.docx.mockImplementation((request: ExportRequest) => renderDocx(request, { image: async () => { throw new Error('unused'); }, formula: async () => { throw new Error('unused'); } }));
});
describe('Word export save lifecycle', () => {
  it('exports a confirmed template through the same snapshot and atomic save layer', async () => {
    const bytes=wordTemplateFixture(), profile=analyzeWordTemplate(bytes,'已保存模板','test'); profile.confirmed=true; profile.warningsAccepted=true;
    const get=vi.spyOn(WordTemplateStore.prototype,'get').mockResolvedValue({bytes,profile});
    try { const original={...input(),templateId:'test'}, snapshot=structuredClone(original); expect(await invoke(original)).toMatchObject({ok:true}); expect(mocks.preset).not.toHaveBeenCalled(); expect(mocks.docx.mock.calls[0][0].template.profile.name).toBe('已保存模板'); expect(mocks.write).toHaveBeenCalledOnce(); expect(original).toEqual(snapshot); } finally {get.mockRestore();}
  });
  it('cancels template export without rendering or writing', async () => {
    const bytes=wordTemplateFixture(), profile=analyzeWordTemplate(bytes,'模板','test'); profile.confirmed=true;
    const get=vi.spyOn(WordTemplateStore.prototype,'get').mockResolvedValue({bytes,profile}); mocks.save.mockResolvedValue({canceled:true});
    try {expect(await invoke({...input(),templateId:'test'})).toEqual({ok:true,value:null});expect(mocks.docx).not.toHaveBeenCalled();expect(mocks.write).not.toHaveBeenCalled();} finally {get.mockRestore();}
  });
  it('rejects unconfirmed templates before showing the save dialog', async () => {
    const bytes=wordTemplateFixture(), profile=analyzeWordTemplate(bytes,'模板','test'); const get=vi.spyOn(WordTemplateStore.prototype,'get').mockResolvedValue({bytes,profile}), log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {expect(await invoke({...input(),templateId:'test'})).toMatchObject({ok:false,message:expect.stringContaining('确认')});expect(mocks.save).not.toHaveBeenCalled();} finally {get.mockRestore();log.mockRestore();}
  });
  it('authenticates every template import, save, list, default and deletion request', async () => {
    for(const name of ['list','import','confirm','default','remove']) expect(await mocks.handlers.get(`word-template:${name}`)!({sender:{}},{})).toMatchObject({ok:false,message:'请求来源无效。'});
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('rejects malformed template IDs and template requests to PDF', async () => {
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {expect(await invoke({...input(),templateId:42})).toMatchObject({ok:false});expect(await mocks.handlers.get('document:export-pdf')!({sender},{...input(),templateId:'test'})).toMatchObject({ok:false});expect(mocks.save).not.toHaveBeenCalled();} finally {log.mockRestore();}
  });
  it('reports missing saved templates without changing the source', async () => {
    const get=vi.spyOn(WordTemplateStore.prototype,'get').mockRejectedValue(new Error('模板无法读取，请重新导入。')),log=vi.spyOn(console,'error').mockImplementation(()=>{}),value={...input(),templateId:'missing'},snapshot=structuredClone(value);
    try {expect(await invoke(value)).toMatchObject({ok:false,message:'模板无法读取，请重新导入。'});expect(mocks.write).not.toHaveBeenCalled();expect(value).toEqual(snapshot);} finally {get.mockRestore();log.mockRestore();}
  });
  it('registers Word and PDF on the same export layer', () => { expect([...mocks.handlers.keys()].filter(name => name.startsWith('document:'))).toEqual(['document:export-pdf', 'document:export-docx']); });
  it.each([[0, 'manuscript'], [1, 'academic'], [2, 'reading']])('passes selected preset %s to the renderer', async (response, preset) => {
    mocks.preset.mockResolvedValue({ response }); await invoke(); expect(mocks.docx.mock.calls[0][0].preset).toBe(preset);
  });
  it('cancels preset selection before the save dialog or rendering', async () => {
    mocks.preset.mockResolvedValue({ response: 3 }); expect(await invoke()).toEqual({ ok: true, value: null }); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.docx).not.toHaveBeenCalled();
  });
  it('saves a valid editable DOCX atomically with extension, current snapshot and Chinese dialog', async () => {
    const before = input(), snapshot = structuredClone(before); const result = await invoke(before);
    expect(result).toMatchObject({ ok: true, value: { displayName: '文稿.docx', diagnostics: [] } }); expect(before).toEqual(snapshot);
    expect(mocks.save).toHaveBeenCalledWith(window, expect.objectContaining({ title: '导出 Word', defaultPath: '文稿.docx', filters: [{ name: 'Word 文稿', extensions: ['docx'] }] }));
    const [path, bytes] = mocks.write.mock.calls[0]; expect(path).toBe('D:/output/文稿.docx'); expect(unzipSync(bytes)['word/document.xml']).toBeTruthy(); expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it('cancels before rendering or writing and leaves input and file handle unchanged', async () => {
    mocks.save.mockResolvedValue({ canceled: true, filePath: 'D:/never.docx' }); const original = input(); original.fileHandleId = registry.register('D:/source.md').fileHandleId as any; const copy = structuredClone(original);
    expect(await invoke(original)).toEqual({ ok: true, value: null }); expect(mocks.docx).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled(); expect(original).toEqual(copy); expect(registry.resolve(original.fileHandleId!)).toBe('D:/source.md');
  });
  it('treats an empty dialog path as cancellation', async () => { mocks.save.mockResolvedValue({ canceled: false }); expect(await invoke()).toEqual({ ok: true, value: null }); expect(mocks.write).not.toHaveBeenCalled(); });
  it('reports rendering failure without writing or changing the Markdown snapshot', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {}); mocks.docx.mockRejectedValue(new Error('renderer failed')); const original = input(), copy = structuredClone(original);
    expect(await invoke(original)).toMatchObject({ ok: false, message: expect.stringContaining('无法导出 Word') }); expect(mocks.write).not.toHaveBeenCalled(); expect(original).toEqual(copy); log.mockRestore();
  });
  it('reports atomic write failure and permits retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {}); mocks.write.mockRejectedValueOnce(new Error('disk full'));
    expect(await invoke()).toMatchObject({ ok: false }); expect(await invoke()).toMatchObject({ ok: true }); log.mockRestore();
  });
  it('keeps a DOCX suffix regardless of case', async () => { mocks.save.mockResolvedValue({ canceled: false, filePath: 'D:/文稿.DOCX' }); await invoke(); expect(mocks.write.mock.calls[0][0]).toBe('D:/文稿.DOCX'); });
  it('rejects foreign senders without showing a dialog', async () => { expect(await invoke(input(), {})).toMatchObject({ ok: false }); expect(mocks.save).not.toHaveBeenCalled(); });
  it('rejects invalid and oversized snapshots before showing the dialog', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {}); expect(await invoke({ ...input(), text: 42 })).toMatchObject({ ok: false }); expect(await invoke({ ...input(), text: 'a'.repeat(20 * 1024 * 1024 + 1) })).toMatchObject({ ok: false }); expect(mocks.save).not.toHaveBeenCalled(); log.mockRestore();
  });
  it('shares a busy guard across Word and PDF and releases it on cancel', async () => {
    let release!: (value: unknown) => void; mocks.save.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })); const first = invoke();
    await Promise.resolve();
    expect(await mocks.handlers.get('document:export-pdf')!({ sender }, input())).toMatchObject({ ok: false, message: '正在导出文稿，请稍候。' }); release({ canceled: true }); await first; expect(await invoke()).toMatchObject({ ok: true });
  });
});
