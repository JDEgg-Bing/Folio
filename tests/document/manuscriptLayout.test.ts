import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { renderPdfManuscript } from '../../src/document/export/PdfRenderer';
import { renderDocx } from '../../src/document/export/DocxRenderer';
import { contentWidth, exportPresetIds, manuscriptLayout, ptToTwips } from '../../src/document/export/ManuscriptLayout';
import { DEFAULT_WRITING_APPEARANCE } from '../../src/renderer/preferences/WritingAppearance';
import type { ExportRequest } from '../../src/document/export/ExportAdapter';
import { modelFor } from './helpers';

const source = '# 正式报告 & Research\n\n中文正文测试。\n\nEnglish prose for a technical report.\n\n## 方法\n\n> 参考说明\n\n```ts\nconst long = "' + 'token'.repeat(100) + '";\n```\n\n| 编号 | 描述 |\n| --- | --- |\n' + Array.from({ length: 85 }, (_, i) => `| ${i + 1} | Long table 分页测试记录 |`).join('\n');
const request = (): ExportRequest => ({ model: modelFor(source), appearance: DEFAULT_WRITING_APPEARANCE, signal: new AbortController().signal, resources: { read: async () => { throw new Error('unused'); } } });
const media = { image: async () => { throw new Error('unused'); }, formula: async () => { throw new Error('unused'); } };
const part = (files: Record<string, Uint8Array>, path: string) => strFromU8(files[path]);

describe('shared manuscript typography and pagination', () => {
  it.each(exportPresetIds)('uses %s type and page rules for PDF and Word', async preset => {
    const input = { ...request(), preset }, layout = manuscriptLayout(preset);
    const pdf = await renderPdfManuscript(input, ''), files = unzipSync((await renderDocx(input, media)).bytes);
    const styles = part(files, 'word/styles.xml'), doc = part(files, 'word/document.xml');
    expect(pdf.html).toContain(`font-size:${layout.body.size}pt;line-height:${layout.body.lineHeight}`);
    expect(styles).toContain(`w:sz w:val="${layout.body.size * 2}"`);
    expect(styles).toContain(`w:line="${ptToTwips(layout.body.size * layout.body.lineHeight)}" w:lineRule="atLeast"`);
    expect(doc).toContain(`w:tblW w:w="${contentWidth(layout)}"`);
    expect(doc).toContain(`w:ind w:firstLine="${ptToTwips(layout.body.size * layout.body.indent)}"`);
    expect(pdf.html).toContain(`style="text-indent:${layout.body.indent}em"`);
    expect(doc).toContain('w:firstLine="0"'); expect(pdf.html).toContain('style="text-indent:0em"');
    expect(pdf.html).toContain('table-layout:fixed'); expect(pdf.html).toContain('<colgroup>');
    expect(doc.match(/<w:tr>/g)).toHaveLength(86); expect(pdf.html.match(/<tr>/g)).toHaveLength(86);
    expect(doc.match(/<w:tblHeader\/>/g)).toHaveLength(1);
    expect(doc.match(/<w:cantSplit\/>/g)).toHaveLength(86);
    expect(pdf.html).toContain('tr{break-inside:avoid}'); expect(pdf.html).toContain('break-inside:auto');
    const codeStyle = styles.match(/<w:style[^>]*w:styleId="CodeBlock"[\s\S]*?<\/w:style>/)![0];
    expect(codeStyle).not.toContain('keepLines'); expect(codeStyle).toContain('w:shd');
    expect(pdf.html).toContain('overflow-wrap:anywhere');
  });
  it('is independent of writing preferences in both formats', async () => {
    const input = request(), before = JSON.stringify(input.model.root);
    const pdf = await renderPdfManuscript(input, ''), word = await renderDocx(input, media);
    input.appearance = { ...input.appearance, fontSize: 24, lineHeight: 2.4, paragraphSpacing: 2, headingScale: 2, chineseFontFamily: 'Arial', latinFontFamily: 'Arial' };
    expect(await renderPdfManuscript(input, '')).toEqual(pdf);
    expect((await renderDocx(input, media)).bytes).toEqual(word.bytes); expect(JSON.stringify(input.model.root)).toBe(before);
  });
  it('uses one opening title and quiet escaped running matter', async () => {
    const input = request(), pdf = await renderPdfManuscript(input, '');
    expect(pdf.html.match(/class="document-title"/g)).toHaveLength(1);
    expect(pdf.headerTemplate).toContain('正式报告 &amp; Research'); expect(pdf.footerTemplate).toContain('class="pageNumber"');
    for (const text of ['前言\n\n# 正文标题', '> # 引用标题\n\n# 正文标题']) {
      const rendered = await renderPdfManuscript({ ...input, model: modelFor(text) }, ''); expect(rendered.html).not.toContain('class="document-title"');
    }
    const files = unzipSync((await renderDocx(input, media)).bytes);
    expect(part(files, 'word/footer1.xml')).not.toContain('第 ');
  });
});
