import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

export class FileHandleRegistry {
  private readonly paths = new Map<string, string>();

  register(path: string): { fileHandleId: string; displayName: string; displayPath: string } {
    const fileHandleId = randomUUID();
    this.paths.set(fileHandleId, path);
    return { fileHandleId, displayName: basename(path), displayPath: path };
  }

  resolve(fileHandleId: string): string {
    const path = this.paths.get(fileHandleId);
    if (!path) throw new Error('This document handle is no longer valid.');
    return path;
  }
}
