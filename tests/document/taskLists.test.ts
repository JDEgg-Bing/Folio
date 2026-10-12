import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { modelFor } from './helpers';
import { walkNodes } from '../../src/document/model';
import { renderPdfManuscript } from '../../src/document/export/PdfRenderer';
import { renderDocx } from '../../src/document/export/DocxRenderer';
import { DEFAULT_WRITING_APPEARANCE } from '../../src/renderer/preferences/WritingAppearance';

describe('task lists through the shared semantic model', () => {
  const source = '- [ ] **todo**\n  - [x] done\n    - [X] ![image](assets/pic.png)\n- ordinary\n\n2. numbered';
  const model = modelFor(source);
  it('preserves task states, nested formatting and image resources', () => {
    const states: boolean[] = [], kinds: string[] = [];
    walkNodes(model.root, node => { if (node.checked !== undefined) states.push(node.checked); kinds.push(node.kind); });
    expect(states).toEqual([false, true, true]); expect(kinds).toContain('strong');
    expect(model.images.map(image => image.destination)).toEqual(['assets/pic.png']);
    expect(source).toContain('- [X]');
  });
  it('retains the parent bullet when a later paragraph has a task marker', async () => {
    const result = await renderPdfManuscript({ model: modelFor('- parent\n\n  [ ] secondary'), appearance: DEFAULT_WRITING_APPEARANCE, signal: new AbortController().signal, resources: { read: async () => { throw new Error(); } } }, '');
    expect(result.html).toContain('>parent</p>');
    expect(result.html).toContain('☐ secondary');
    expect(result.html).not.toContain('class="task-list-item"');
  });
  it('exports tasks and ordinary/ordered lists with the managed image in PDF and DOCX', async () => {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB0kAAAAASUVORK5CYII=', 'base64'));
    const request = { model, appearance: DEFAULT_WRITING_APPEARANCE, signal: new AbortController().signal, resources: { read: async () => ({ bytes: png, mime: 'image/png' }) } };
    const pdf = await renderPdfManuscript(request, '');
    expect(pdf.html).toContain('☐ <strong>todo</strong>'); expect(pdf.html).toContain('☑ done');
    expect(pdf.html).toContain('class="task-list-item"'); expect(pdf.html).toContain(' start="2"');
    expect(pdf.html).toContain('data:image/png;base64,'); expect(pdf.diagnostics).toEqual([]);
    const docx = await renderDocx(request, { image: async bytes => bytes, formula: async () => png });
    const files = unzipSync(docx.bytes), xml = strFromU8(files['word/document.xml']);
    expect(xml).toContain('☐'); expect(xml.match(/☑/g)).toHaveLength(2);
    expect(xml).toContain('todo'); expect(xml).toContain('<w:b/>'); expect(xml).toContain('<w:numPr>');
    expect(files['word/media/image1.png']).toEqual(png); expect(docx.diagnostics).toEqual([]);
  });
});
