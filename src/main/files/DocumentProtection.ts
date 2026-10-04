import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { atomicWriteFile } from './atomicWrite';
import type { RecoverySnapshot } from '../../shared/desktopApi';

export const fingerprint = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
export async function diskFingerprint(path: string): Promise<string | null> {
  try { return fingerprint(await readFile(path)); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null; throw cause; }
}

/** Baselines are bytes read/written by the app, never modification timestamps. */
export class DocumentVersions {
  private readonly versions = new Map<string, string | null>();
  remember(handle: string, value: string | null): void { this.versions.set(handle, value); }
  baseline(handle: string): string | null { return this.versions.get(handle) ?? null; }
  async changed(handle: string, path: string): Promise<boolean> {
    return !this.versions.has(handle) || await diskFingerprint(path) !== this.versions.get(handle);
  }
}

export interface RecoveryRecord extends RecoverySnapshot { version: 1; updatedAt: string; filePath: string | null; baseline: string | null }
export class RecoveryStore {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly path: string) {}
  write(record: RecoveryRecord | null): Promise<void> {
    const operation = this.queue.catch(() => {}).then(async () => {
      if (record) {
        await mkdir(dirname(this.path), { recursive: true });
        await atomicWriteFile(this.path, Buffer.from(JSON.stringify(record)));
      } else {
        try { await unlink(this.path); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause; }
      }
    });
    this.queue = operation;
    return operation;
  }
  async read(): Promise<RecoveryRecord | null> {
    await this.queue.catch(() => {});
    let raw: string;
    try { raw = await readFile(this.path, 'utf8'); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null; throw cause; }
    let value: Partial<RecoveryRecord>;
    try { value = JSON.parse(raw) as Partial<RecoveryRecord>; }
    catch {
      await copyFile(this.path, `${this.path}.invalid-${Date.now()}`);
      throw new Error('恢复草稿损坏，已保留原始副本。');
    }
    if (!value || value.version !== 1 || typeof value.text !== 'string' || value.text.length > 20 * 1024 * 1024 ||
      typeof value.displayName !== 'string' || typeof value.updatedAt !== 'string' ||
      (value.filePath !== null && typeof value.filePath !== 'string') ||
      (value.baseline !== null && !/^[a-f0-9]{64}$/.test(value.baseline ?? '')) ||
      !value.options || !['LF', 'CRLF'].includes(value.options.eol) || typeof value.options.hadBom !== 'boolean') {
      await copyFile(this.path, `${this.path}.invalid-${Date.now()}`);
      throw new Error('恢复草稿无法读取，原文件未改动。请通过“帮助 → 问题反馈”查看本地数据位置。');
    }
    return value as RecoveryRecord;
  }
}
