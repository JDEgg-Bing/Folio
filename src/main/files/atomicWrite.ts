import { randomUUID } from 'node:crypto';
import { open, rename, unlink, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface AtomicWriteFileHandle {
  writeFile(data: Buffer): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicWriteOperations {
  open(path: string, flags: string): Promise<AtomicWriteFileHandle>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

const nativeOperations: AtomicWriteOperations = {
  open: async (path, flags) => await open(path, flags) as FileHandle,
  rename,
  unlink
};

export async function atomicWriteFile(
  targetPath: string,
  contents: Buffer,
  operations: AtomicWriteOperations = nativeOperations
): Promise<void> {
  const temporaryPath = join(dirname(targetPath), `.${basename(targetPath)}.${randomUUID()}.tmp`);
  let handle: AtomicWriteFileHandle | null = null;
  let temporaryCreated = false;

  try {
    handle = await operations.open(temporaryPath, 'wx');
    temporaryCreated = true;
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = null;
    await operations.rename(temporaryPath, targetPath);
    temporaryCreated = false;
  } catch (cause) {
    if (handle) {
      try { await handle.close(); } catch { /* Preserve the original write error. */ }
    }
    if (temporaryCreated) {
      try { await operations.unlink(temporaryPath); } catch { /* Preserve the original write error. */ }
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not safely save ${targetPath}: ${detail}`, { cause });
  }
}
