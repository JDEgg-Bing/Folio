import { describe, expect, it } from 'vitest';
import { decodeMarkdown, encodeMarkdown } from '../../src/main/files/encoding';

describe('Markdown encoding round trips', () => {
  it.each([
    ['LF with trailing newline', Buffer.from('# A\n\ntext\n'), 'LF', false],
    ['CRLF without trailing newline', Buffer.from('# A\r\n\r\ntext'), 'CRLF', false],
    ['UTF-8 BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('你好\r\n')]), 'CRLF', true],
    ['empty file', Buffer.alloc(0), 'LF', false]
  ] as const)('%s', (_name, bytes, eol, bom) => {
    const decoded = decodeMarkdown(bytes);
    expect(encodeMarkdown(decoded.text, eol, bom)).toEqual(bytes);
  });

  it('detects mixed EOL and chooses the dominant style', () => {
    const decoded = decodeMarkdown(Buffer.from('a\r\nb\nc\r\n'));
    expect(decoded).toMatchObject({ text: 'a\nb\nc\n', eol: 'CRLF', mixedEol: true });
  });

  it('rejects binary input and invalid UTF-8', () => {
    expect(() => decodeMarkdown(Buffer.from([0, 1, 2]))).toThrow(/binary/i);
    expect(() => decodeMarkdown(Buffer.from([0xc3, 0x28]))).toThrow();
  });
});
