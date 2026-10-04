import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ImageAssetService, resolveImagePath } from '../../src/main/assets/ImageAssetService';
const folders: string[] = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB0kAAAAASUVORK5CYII=', 'base64');
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'markdown-images-')); folders.push(folder);
  const image = join(folder,'示意 图.png'); await writeFile(image,png);
  return { folder, image, document: join(folder,'论文.md'), service: new ImageAssetService() };
}
afterEach(async () => { for (const folder of folders.splice(0)) { if (!resolve(folder).startsWith(resolve(tmpdir()))) throw new Error('Unsafe test cleanup'); await rm(folder, { recursive: true, force: true }); } });
describe('image resources and document attachments', () => {
  it('resolves relative, encoded Chinese, absolute and file URLs independently of UI', () => {
    const doc = join(tmpdir(),'论文','paper.md');
    expect(resolveImagePath(doc,'附件/a b.png')).toBe(resolve(tmpdir(),'论文','附件','a b.png'));
    expect(resolveImagePath(doc,encodeURI('附件/a b.png'))).toBe(resolveImagePath(doc,'附件/a b.png'));
    expect(resolveImagePath(null,join(tmpdir(),'a.png'))).toBe(resolve(tmpdir(),'a.png'));
    expect(() => resolveImagePath(null,'a.png')).toThrow('先保存');
    expect(() => resolveImagePath(doc,'https://example.com/a.png')).toThrow('网络图片');
  });
  it('imports to a managed folder with relative paths, content deduplication and manifest', async () => {
    const f = await fixture(), ids = await f.service.stage([f.image]), images = await f.service.import(f.document,ids);
    expect(images[0].destination).toMatch(/^论文\.assets\/[a-f0-9]+\.png$/);
    expect(images[0].alt).toBe('示意 图');
    expect(await readFile(join(f.folder,images[0].destination))).toEqual(png);
    await f.service.import(f.document,await f.service.stage([f.image]));
    expect((await readdir(join(f.folder,'论文.assets'))).filter(name => name.endsWith('.png'))).toHaveLength(1);
    expect(JSON.parse(await readFile(join(f.folder,'论文.assets','.markdown-editor-assets.json'),'utf8')).files).toHaveLength(1);
  });
  it('exposes opaque image resources and rejects unregistered IDs', async () => {
    const f = await fixture(), image = await f.service.resolve(null,f.image);
    expect(image.url).toMatch(/^md-asset:\/\/image\/[a-f0-9-]+$/);
    expect((await f.service.resource(new URL(image.url).pathname.slice(1))).bytes).toEqual(png);
    await expect(f.service.resource('unknown')).rejects.toThrow('失效');
    f.service.releaseResources(); await expect(f.service.resource(new URL(image.url).pathname.slice(1))).rejects.toThrow('失效');
  });
  it('copies only referenced managed assets across directories while leaving source unchanged', async () => {
    const f = await fixture(), images = await f.service.import(f.document,await f.service.stage([f.image]));
    const nextFolder = join(f.folder,'new'); await mkdir(nextFolder);
    const source = `![图](<${images[0].destination}>)\n\n![外部](external.png)`;
    await writeFile(join(f.folder,'external.png'),png);
    await f.service.copyForSaveAs(f.document,join(nextFolder,'copy.md'),source);
    expect(await readFile(join(nextFolder,images[0].destination))).toEqual(png);
    expect(await readFile(join(nextFolder,'external.png')).catch(() => null)).toBeNull();
    expect(source).toContain(images[0].destination);
  });
  it('does not copy when saving in the same directory', async () => {
    const f = await fixture(); expect((await f.service.copyForSaveAs(f.document,join(f.folder,'copy.md'),'')).created).toEqual([]);
  });
  it('rolls back copied attachments when a subsequent document write fails', async () => {
    const f = await fixture(), images = await f.service.import(f.document,await f.service.stage([f.image]));
    const next = join(f.folder,'new'); await mkdir(next);
    const transaction = await f.service.copyForSaveAs(f.document,join(next,'copy.md'),`![图](<${images[0].destination}>)`);
    await transaction.rollback(); expect(await readdir(next)).toEqual([]);
    expect(await readFile(join(f.folder,images[0].destination))).toEqual(png);
  });
  it('does not overwrite conflicting destination assets', async () => {
    const f = await fixture(), images = await f.service.import(f.document,await f.service.stage([f.image]));
    const next = join(f.folder,'new'); await mkdir(join(next,'论文.assets'),{recursive:true});
    const target = join(next,images[0].destination); await writeFile(target,'original');
    await expect(f.service.copyForSaveAs(f.document,join(next,'copy.md'),`![图](<${images[0].destination}>)`)).rejects.toThrow('同名文件');
    expect(await readFile(target,'utf8')).toBe('original');
  });
  it('preserves a damaged manifest rather than overwriting unknown resources', async () => {
    const f = await fixture(), folder = join(f.folder,'论文.assets'); await mkdir(folder);
    const manifest = join(folder,'.markdown-editor-assets.json'); await writeFile(manifest,'broken');
    await expect(f.service.import(f.document, await f.service.stage([f.image]))).rejects.toThrow('清单无效');
    expect(await readFile(manifest,'utf8')).toBe('broken'); expect(await readdir(folder)).toEqual(['.markdown-editor-assets.json']);
  });
  it('rolls back a partial multi-file import and leaves existing attachments intact', async () => {
    const f = await fixture(), original = await f.service.import(f.document,await f.service.stage([f.image]));
    const svg = join(f.folder,'new.svg'); await writeFile(svg,'<svg xmlns="http://www.w3.org/2000/svg"/>');
    const folder = join(f.folder,'论文.assets'), before = await readdir(folder), manifest = await readFile(join(folder,'.markdown-editor-assets.json'),'utf8');
    await expect(f.service.import(f.document,[...await f.service.stage([svg]),'invalid'])).rejects.toThrow('失效');
    expect(await readdir(folder)).toEqual(before); expect(await readFile(join(folder,'.markdown-editor-assets.json'),'utf8')).toBe(manifest);
    expect(await readFile(join(f.folder,original[0].destination))).toEqual(png);
  });
  it('does not overwrite an invalid destination manifest during Save As', async () => {
    const f = await fixture(), images = await f.service.import(f.document,await f.service.stage([f.image]));
    const next = join(f.folder,'new'), folder = join(next,'论文.assets'); await mkdir(folder,{recursive:true});
    const manifest = join(folder,'.markdown-editor-assets.json'); await writeFile(manifest,'unknown');
    await expect(f.service.copyForSaveAs(f.document,join(next,'copy.md'),`![图](<${images[0].destination}>)`)).rejects.toThrow('清单无效');
    expect(await readFile(manifest,'utf8')).toBe('unknown'); expect(await readdir(folder)).toEqual(['.markdown-editor-assets.json']);
  });
  it('rejects damaged images, unknown tickets, stale tickets and unsupported formats without source changes', async () => {
    const f = await fixture(), damaged = join(f.folder,'bad.png'); await writeFile(damaged,'not png');
    await expect(f.service.stage([damaged])).rejects.toThrow('损坏');
    await expect(f.service.import(f.document,['unknown'])).rejects.toThrow('失效');
    expect(await readdir(join(f.folder,'论文.assets')).catch(() => [])).toEqual([]);
    const text = join(f.folder,'file.txt'); await writeFile(text,'text'); await expect(f.service.stage([text])).rejects.toThrow('格式');
  });
});

