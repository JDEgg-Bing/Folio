import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { modelFor } from './helpers';
import { renderPdfManuscript } from '../../src/document/export/PdfRenderer';
import { renderDocx } from '../../src/document/export/DocxRenderer';
import { DEFAULT_WRITING_APPEARANCE } from '../../src/renderer/preferences/WritingAppearance';

describe('own-line image exports', () => {
  it.each(['above\n![a](a.png)\nbelow', 'above\n![a](a.png)\n![b](a.png)\nbelow', '- above\n  ![a](a.png)\n  below', 'above\n\n- ![a](a.png)\n  below'])('shares block layout, source order and full dimensions: %s', async source => {
    // Enough real PNG header for the renderer to read 400x200 dimensions.
    const bytes = Buffer.alloc(32); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); bytes.write('IHDR',12); bytes.writeUInt32BE(400,16); bytes.writeUInt32BE(200,20);
    const request = { model: modelFor(source), appearance: DEFAULT_WRITING_APPEARANCE, signal: new AbortController().signal, resources: { read: async () => ({ bytes, mime: 'image/png' }) } };
    const pdf = await renderPdfManuscript(request, '');
    expect(pdf.diagnostics).toEqual([]); expect(pdf.html.indexOf('above')).toBeLessThan(pdf.html.indexOf('<figure'));
    expect(pdf.html.indexOf('</figure>')).toBeLessThan(pdf.html.indexOf('below'));
    expect(pdf.html.match(/<figure /g)).toHaveLength(request.model.images.length);
    const docx = await renderDocx(request, { image: async bytes => bytes, formula: async () => bytes });
    expect(docx.diagnostics).toEqual([]);
    const xml = strFromU8(unzipSync(docx.bytes)['word/document.xml']);
    expect(xml.indexOf('above')).toBeLessThan(xml.indexOf('<w:drawing>')); expect(xml.indexOf('</w:drawing>')).toBeLessThan(xml.indexOf('below'));
    expect(xml).toContain('cx="3810000" cy="1905000"');
    if (source.includes('- ')) expect(xml.match(/<w:numPr>/g)).toHaveLength(1);
  });
});
