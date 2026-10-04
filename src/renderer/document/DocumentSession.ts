import type { DocumentMetadata, EolStyle } from '../../shared/desktopApi';

export function createUntitledSession(): DocumentMetadata {
  return { id: crypto.randomUUID(), displayName: '未命名文档', displayPath: null, fileHandleId: null, eol: 'LF', hadBom: false, dirty: false, mixedEol: false };
}

export function createOpenedSession(document: {
  fileHandleId: string; displayName: string; displayPath: string; eol: EolStyle; hadBom: boolean; mixedEol: boolean
}): DocumentMetadata {
  return { id: crypto.randomUUID(), ...document, dirty: false };
}
