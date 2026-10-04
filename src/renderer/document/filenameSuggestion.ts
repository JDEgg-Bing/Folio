import type { DocumentMetadata } from '../../shared/desktopApi';
import { filenameStem } from './DocumentTitle';

/** Only a dialog suggestion. Never renames or writes any file. */
export function safeMarkdownFilename(title: string | null): string {
  let stem = (title ?? '').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '').trim().replace(/[. ]+$/, '');
  // 120 UTF-16 units leaves room for the extension and avoids splitting surrogate pairs.
  let shortened = '';
  for (const character of stem) {
    if (shortened.length + character.length > 120) break;
    shortened += character;
  }
  stem = shortened.trim().replace(/[. ]+$/, '') || 'Untitled';
  // Windows device names are reserved even when followed by an extension.
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  return `${stem}.md`;
}

export function suggestedFilename(heading: string | null, metadata: Pick<DocumentMetadata, 'fileHandleId' | 'displayName'>): string {
  return safeMarkdownFilename(metadata.fileHandleId ? filenameStem(metadata.displayName) : heading);
}
