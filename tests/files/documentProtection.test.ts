import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentVersions, RecoveryStore, fingerprint, type RecoveryRecord } from '../../src/main/files/DocumentProtection';
import { markdownArgument } from '../../src/main/lifecycle';
import { SavedDocumentTracker } from '../../src/renderer/editor/EditorController';
import { EditorState } from '@codemirror/state';

const record = (text: string): RecoveryRecord => ({ version: 1, text, displayName: '未命名文稿', fileHandleId: null,
  filePath: null, baseline: null, options: { eol: 'CRLF', hadBom: true }, updatedAt: '2026-10-02T00:00:00.000Z' });
async function sandbox(fn: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'folio-protection-test-'));
  try { await fn(folder); } finally { await rm(folder, { recursive: true, force: true }); }
}
describe('document protection', () => {
  it('detects same-length external edits, deletion and missing baselines', async () => sandbox(async folder => {
    const path = join(folder, 'document.md'), versions = new DocumentVersions();
    await writeFile(path, 'AB'); versions.remember('handle', fingerprint(Buffer.from('AB')));
    expect(await versions.changed('handle', path)).toBe(false);
    await writeFile(path, 'CD'); expect(await versions.changed('handle', path)).toBe(true);
    versions.remember('handle', fingerprint(Buffer.from('CD'))); expect(await versions.changed('handle', path)).toBe(false);
    await rm(path); expect(await versions.changed('handle', path)).toBe(true);
    expect(await versions.changed('unknown', path)).toBe(true);
  }));
  it('orders snapshots and clearing so a discarded draft never returns', async () => sandbox(async folder => {
    const store = new RecoveryStore(join(folder, 'recovery', 'draft.json'));
    await Promise.all([store.write(record('first')), store.write(record('中文第二版')), store.write(null)]);
    expect(await store.read()).toBeNull();
    await store.write(record('third'));
    expect((await store.read())?.text).toBe('third');
  }));
  it('persists original byte baseline and encoding through a new store instance', async () => sandbox(async folder => {
    const path = join(folder, 'draft.json'), original = { ...record('恢复文稿'), filePath: join(folder, '原文.md'), baseline: fingerprint(Buffer.from('旧磁盘内容')) };
    await new RecoveryStore(path).write(original);
    expect(await new RecoveryStore(path).read()).toEqual(original);
    expect((await readdir(folder)).some(name => name.endsWith('.tmp'))).toBe(false);
  }));
  it('preserves malformed recovery data and creates an inspectable copy', async () => sandbox(async folder => {
    const path = join(folder, 'draft.json'); await writeFile(path, '{broken');
    await expect(new RecoveryStore(path).read()).rejects.toThrow('恢复草稿损坏');
    expect(await readFile(path, 'utf8')).toBe('{broken');
    const backup = (await readdir(folder)).find(name => name.includes('.invalid-'))!;
    expect(await readFile(join(folder, backup), 'utf8')).toBe('{broken');
  }));
  it('rejects malformed baselines without treating a draft as empty', async () => sandbox(async folder => {
    const path = join(folder, 'draft.json'); await writeFile(path, JSON.stringify({ ...record('valuable'), baseline: 'invalid' }));
    await expect(new RecoveryStore(path).read()).rejects.toThrow('恢复草稿无法读取');
    expect(await readFile(path, 'utf8')).toContain('valuable');
  }));
  it('marks recovered empty documents dirty until a real save', () => {
    const doc = EditorState.create({ doc: '' }).doc, tracker = new SavedDocumentTracker(doc);
    tracker.markUnsaved(); expect(tracker.isDirty(doc)).toBe(true);
    tracker.markSaved(doc); expect(tracker.isDirty(doc)).toBe(false);
  });
  it('extracts filenames containing spaces and Chinese while ignoring flags', () => {
    expect(markdownArgument(['Folio.exe', '--user-data-dir=C:/profile', 'C:/文稿/我的 报告.MD'])).toBe('C:/文稿/我的 报告.MD');
    expect(markdownArgument(['--squirrel-install', '--fake.md', 'README.txt'])).toBeNull();
  });
});
