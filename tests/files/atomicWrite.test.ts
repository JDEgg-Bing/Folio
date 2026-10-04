import { mkdtemp, open, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWriteFile, type AtomicWriteOperations } from '../../src/main/files/atomicWrite';

const temporaryDirectories: string[] = [];

async function createDirectory() {
  const path = await mkdtemp(join(tmpdir(), 'markdown-editor-atomic-'));
  temporaryDirectories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('atomic file replacement', () => {
  it('replaces an existing file on the current Windows filesystem', async () => {
    const directory = await createDirectory();
    const target = join(directory, 'document.md');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(target, 'old content'));

    await atomicWriteFile(target, Buffer.from('new content'));

    expect(await readFile(target, 'utf8')).toBe('new content');
    expect(await readdir(directory)).toEqual(['document.md']);
  });

  it('preserves the original and cleans the temporary file after a write failure', async () => {
    const directory = await createDirectory();
    const target = join(directory, 'document.md');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(target, 'original'));
    const operations: AtomicWriteOperations = {
      open: async (path, flags) => {
        const handle = await open(path, flags);
        return {
          writeFile: async () => { throw new Error('simulated disk write failure'); },
          sync: () => handle.sync(),
          close: () => handle.close()
        };
      },
      rename: async (from, to) => (await import('node:fs/promises')).rename(from, to),
      unlink: async (path) => (await import('node:fs/promises')).unlink(path)
    };

    await expect(atomicWriteFile(target, Buffer.from('replacement'), operations)).rejects.toThrow(/simulated disk write failure/);
    expect(await readFile(target, 'utf8')).toBe('original');
    expect(await readdir(directory)).toEqual(['document.md']);
  });

  it('preserves the original and removes the temp file when replacement fails', async () => {
    const directory = await createDirectory();
    const target = join(directory, 'document.md');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(target, 'original'));
    const operations: AtomicWriteOperations = {
      open: async (path, flags) => await open(path, flags),
      rename: async () => { throw new Error('simulated replace failure'); },
      unlink: async (path) => (await import('node:fs/promises')).unlink(path)
    };

    await expect(atomicWriteFile(target, Buffer.from('replacement'), operations)).rejects.toThrow(/simulated replace failure/);
    expect(await readFile(target, 'utf8')).toBe('original');
    expect(await readdir(directory)).toEqual(['document.md']);
  });
});
