import type { EolStyle } from '../../shared/desktopApi';

export interface DecodedMarkdown { text: string; eol: EolStyle; hadBom: boolean; mixedEol: boolean }

export function decodeMarkdown(bytes: Buffer): DecodedMarkdown {
  let offset = 0;
  const hadBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hadBom) offset = 3;
  const body = bytes.subarray(offset);
  if (body.includes(0)) throw new Error('This file appears to be binary. Only UTF-8 Markdown files can be opened.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const decoded = decoder.decode(body);
  const crlf = (decoded.match(/\r\n/g) ?? []).length;
  const lf = (decoded.match(/(?<!\r)\n/g) ?? []).length;
  const mixedEol = crlf > 0 && lf > 0;
  const eol: EolStyle = crlf >= lf && crlf > 0 ? 'CRLF' : 'LF';
  return { text: decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), eol, hadBom, mixedEol };
}

export function encodeMarkdown(text: string, eol: EolStyle, hadBom: boolean): Buffer {
  const normalized = text.replace(/\r\n|\r|\n/g, eol === 'CRLF' ? '\r\n' : '\n');
  const body = Buffer.from(normalized, 'utf8');
  return hadBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
}
