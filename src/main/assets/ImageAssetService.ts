import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, unlink, rmdir } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parser, GFM } from '@lezer/markdown';
import { documentSyntax } from '../../document/markdownSyntax';
import { DocumentStructureService } from '../../document/DocumentStructureService';

const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif', '.svg': 'image/svg+xml' };
const manifestName = '.markdown-editor-assets.json';
interface AssetEntry { name: string; sha256: string; mime: string }
interface Manifest { version: 1; files: AssetEntry[] }
export interface AssetTransaction { created: string[]; rollback(): Promise<void> }
export interface ImportedImage { destination: string; alt: string }
export function resolveImagePath(documentPath: string | null, destination: string): string {
  let path = destination.replace(/\\([ ()\[\]])/g, '$1');
  try { path = decodeURIComponent(path); } catch { /* Literal percent in a local filename. */ }
  if (/^file:/i.test(path)) return fileURLToPath(path);
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) throw new Error('暂不显示网络图片。');
  if (isAbsolute(path)) return resolve(path);
  if (!documentPath) throw new Error('请先保存文档，以便定位相对路径图片。');
  return resolve(dirname(documentPath), path);
}
function digest(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
async function imageFile(path: string): Promise<{ bytes: Buffer; mime: string }> {
  const mime = mimeTypes[extname(path).toLowerCase()];
  if (!mime) throw new Error('不支持此图片格式。');
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > 50 * 1024 * 1024) throw new Error('图片不是有效文件或超过 50 MB。');
  const bytes = await readFile(path);
  const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216
    : mime === 'image/gif' ? bytes.subarray(0, 6).toString().startsWith('GIF8')
    : mime === 'image/webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    : mime === 'image/bmp' ? bytes.subarray(0, 2).toString() === 'BM'
    : mime === 'image/avif' ? bytes.subarray(4, 8).toString() === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 32).toString())
    : /<svg(?:\s|>)/i.test(bytes.subarray(0, 65536).toString());
  if (!valid) throw new Error('图片文件损坏或格式不匹配。');
  return { bytes, mime };
}
async function readManifest(folder: string): Promise<Manifest | null> {
  const path = join(folder, manifestName);
  if (!await stat(path).catch(() => null)) return null;
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Manifest;
    if (value.version !== 1 || !Array.isArray(value.files) || value.files.some(file => !file || typeof file.name !== 'string' || basename(file.name) !== file.name || !/^[a-f0-9]{64}$/.test(file.sha256))) throw new Error();
    return value;
  } catch { throw new Error('附件清单无效，未覆盖原文件。'); }
}
function transaction(created: string[], folders: string[], restorations: (() => Promise<void>)[] = []): AssetTransaction {
  return { created, async rollback() {
    for (const restore of restorations.reverse()) await restore().catch(() => {});
    for (const path of created.reverse()) await unlink(path).catch(() => {});
    for (const folder of folders.reverse()) await rmdir(folder).catch(() => {});
  } };
}
export class ImageAssetService {
  private resources = new Map<string, string>();
  private resourceIds = new Map<string, string>();
  private tickets = new Map<string, { path: string; expires: number }>();
  async stage(paths: string[]): Promise<string[]> {
    for (const [id, ticket] of this.tickets) if (ticket.expires < Date.now()) this.tickets.delete(id);
    const ids: string[] = [];
    for (const path of paths) { await imageFile(path); const id = randomUUID(); this.tickets.set(id, { path, expires: Date.now() + 300000 }); ids.push(id); }
    return ids;
  }
  async resolve(documentPath: string | null, destination: string): Promise<{ url: string; mime: string }> {
    const path = resolveImagePath(documentPath, destination), { mime } = await imageFile(path);
    const id = this.resourceIds.get(path) ?? randomUUID(); this.resources.set(id, path); this.resourceIds.set(path, id);
    return { url: `md-asset://image/${id}`, mime };
  }
  async resource(id: string): Promise<{ bytes: Buffer; mime: string }> {
    const path = this.resources.get(id); if (!path) throw new Error('图片资源已失效。'); return imageFile(path);
  }
  releaseResources() { this.resources.clear(); this.resourceIds.clear(); }
  async import(documentPath: string, ids: string[]): Promise<ImportedImage[]> {
    const folder = join(dirname(documentPath), `${basename(documentPath, extname(documentPath))}.assets`);
    const created: string[] = [], folders: string[] = [], restores: (() => Promise<void>)[] = [];
    const tx = transaction(created, folders, restores);
    const oldManifest = await readManifest(folder);
    const manifest: Manifest = oldManifest ? { ...oldManifest, files: [...oldManifest.files] } : { version: 1, files: [] };
    try {
      if (!await stat(folder).catch(() => null)) { await mkdir(folder); folders.push(folder); }
      const result: ImportedImage[] = [];
      for (const id of ids) {
        const ticket = this.tickets.get(id); this.tickets.delete(id);
        if (!ticket || ticket.expires < Date.now()) throw new Error('拖入的图片已失效，请重新拖入。');
        const { bytes, mime } = await imageFile(ticket.path), hash = digest(bytes);
        const name = `${hash}${extname(ticket.path).toLowerCase()}`, path = join(folder, name);
        if (await stat(path).catch(() => null)) { if (digest(await readFile(path)) !== hash) throw new Error('附件存在同名文件，未覆盖原文件。'); }
        else { await writeFile(path, bytes, { flag: 'wx' }); created.push(path); }
        if (!manifest.files.some(file => file.name === name)) manifest.files.push({ name, sha256: hash, mime });
        result.push({ destination: relative(dirname(documentPath), path).split(sep).join('/'), alt: basename(ticket.path, extname(ticket.path)) });
      }
      const manifestPath = join(folder, manifestName), old = await readFile(manifestPath).catch(() => null);
      if (old) restores.push(() => writeFile(manifestPath, old)); else created.push(manifestPath);
      await writeFile(manifestPath, JSON.stringify(manifest));
      return result;
    } catch (cause) { await tx.rollback(); throw cause; }
  }
  async copyForSaveAs(oldPath: string, newPath: string, source: string): Promise<AssetTransaction> {
    const created: string[] = [], folders: string[] = [], restores: (() => Promise<void>)[] = [];
    const tx = transaction(created, folders, restores);
    if (dirname(oldPath) === dirname(newPath)) return tx;
    const model = new DocumentStructureService().build({ length: source.length, read: (from, to) => source.slice(from, to) }, parser.configure([GFM, documentSyntax]).parse(source));
    try {
      for (const image of model.images) {
        if (!image.destination) continue;
        let original: string; try { original = resolveImagePath(oldPath, image.destination); } catch { continue; }
        if (isAbsolute(image.destination) || /^file:/i.test(image.destination)) continue;
        const folder = dirname(original), manifest = await readManifest(folder), entry = manifest?.files.find(file => file.name === basename(original));
        if (!entry) continue;
        const rel = relative(dirname(oldPath), original);
        if (rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue;
        const destination = join(dirname(newPath), rel), newFolder = dirname(destination);
        const { bytes } = await imageFile(original);
        if (digest(bytes) !== entry.sha256) throw new Error('托管图片已被外部修改，请重新导入后另存。');
        if (!await stat(newFolder).catch(() => null)) { await mkdir(newFolder, { recursive: true }); folders.push(newFolder); }
        if (await stat(destination).catch(() => null)) { if (digest(await readFile(destination)) !== entry.sha256) throw new Error('目标附件存在同名文件，无法另存。'); }
        else { await writeFile(destination, bytes, { flag: 'wx' }); created.push(destination); }
        const manifestPath = join(newFolder, manifestName), old = await readFile(manifestPath).catch(() => null), next = await readManifest(newFolder) ?? { version: 1 as const, files: [] };
        if (!next.files.some(file => file.name === entry.name)) {
          if (old) restores.push(() => writeFile(manifestPath, old)); else created.push(manifestPath);
          next.files.push(entry); await writeFile(manifestPath, JSON.stringify(next));
        }
      }
      return tx;
    } catch (cause) { await tx.rollback(); throw cause; }
  }
}
