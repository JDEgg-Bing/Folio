import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderPdfManuscript } from '../../src/document/export/PdfRenderer';
import { exportDocument, type ExportRequest } from '../../src/document/export/ExportAdapter';
import { DEFAULT_WRITING_APPEARANCE } from '../../src/renderer/preferences/WritingAppearance';
import { modelFor } from './helpers';

function request(source: string): ExportRequest {
  return { model: modelFor(source), appearance: DEFAULT_WRITING_APPEARANCE, signal: new AbortController().signal,
    resources: { read: vi.fn(async () => ({ bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>'), mime: 'image/svg+xml' })) } };
}
describe('independent PDF manuscript renderer', () => {
  it('renders semantic content in Markdown order, with no editor UI or source delimiters', async () => {
    const source = '# 论文标题\n\n正文 **结论**。\n\n> 引用说明\n\n$$E=mc^2$$\n\n| 参数 | 数值 |\n| --- | --- |\n| E | 210 |\n\n![示意图](a.svg){#fig:a}\n\n结尾 [@fig:a]。';
    const input = request(source), before = JSON.stringify(input.model.root);
    const { html } = await renderPdfManuscript(input, '/* math styles */');
    const body = html.split('<article class="manuscript">')[1];
    const ordered = ['论文标题', '正文', '引用说明', 'class="equation"', '<table>', '<figure', '结尾'];
    for (let index = 1; index < ordered.length; index++) expect(body.indexOf(ordered[index])).toBeGreaterThan(body.indexOf(ordered[index - 1]));
    expect(body).toContain('<strong>结论</strong>');
    expect(body).toContain('data:image/svg+xml;base64,');
    expect(body).toContain('图 1');
    expect(body).not.toMatch(/cm-editor|cm-content|document-outline|status-bar|contenteditable|\{#fig:|\[@fig:/);
    expect(JSON.stringify(input.model.root)).toBe(before);
    expect(source).toContain('[@fig:a]');
  });
  it('uses white A4 pages, shared fonts, 2em indentation and paragraph justification', async () => {
    const { html } = await renderPdfManuscript(request('# 标题\n\n中文 English 正文。'), '');
    expect(html).toContain('@page{size:A4');
    expect(html).toContain('background:#fff;color:#222');
    expect(html).toContain('src:local("SimSun")');
    expect(html).toContain('src:local("Times New Roman")');
    expect(html).toContain('style="text-indent:2em"'); expect(html).toContain('p.prose{text-align:justify');
    expect(html).not.toContain('prefers-color-scheme');
  });
  it('excludes quote/list/math/image paragraphs from body justification', async () => {
    const { html } = await renderPdfManuscript(request('> 引用\n\n- 列表\n\n$x$\n\n![图](a.svg)'), '');
    const body = html.split('<article class="manuscript">')[1];
    expect(body).not.toContain('class="prose"');
    expect(body).toContain('<blockquote'); expect(body).toContain('<ul'); expect(body).toContain('<figure');
    expect(body).not.toContain('&gt; 引用');
  });
  it('renders numbered equations, cross references and scientific tables', async () => {
    const { html, diagnostics } = await renderPdfManuscript(request('$$\nE=mc^2\n$$\n{#eq:e}\n\n| A | B |\n| :--- | ---: |\n| 1 | 2 |\n{#tbl:t}\n\n参见 [@eq:e]、[@tbl:t]。'), '');
    expect(html).toContain('class="equation-number">(1)');
    expect(html).toContain('<thead>'); expect(html).toContain('<tbody>');
    expect(html).toContain('text-align:right'); expect(html).toContain('表 1');
    expect(html).toContain('border-top:1.25pt'); expect(html).toContain('border-bottom:1.25pt');
    expect(diagnostics).toEqual([]);
  });
  it('keeps headings with following content and repeats table headers', async () => {
    const { html } = await renderPdfManuscript(request('# 标题\n\n正文'), '');
    expect(html).toContain('break-after:avoid;break-inside:avoid');
    expect(html).toContain('orphans:3;widows:3');
    expect(html).toContain('thead{display:table-header-group}');
  });
  it('escapes HTML, rejects active link schemes and keeps code without fences', async () => {
    const { html } = await renderPdfManuscript(request('<script>alert(1)</script>\n\n[x](javascript:alert)\n\n```ts\nconst x = "<a>";\n```'), '');
    const body = html.split('<article class="manuscript">')[1];
    expect(body).not.toContain('<script>'); expect(body).not.toContain('href="javascript:');
    expect(body).toContain('&lt;script&gt;'); expect(body).toContain('const x = &quot;&lt;a&gt;&quot;');
    expect(body).not.toContain('```');
  });
  it('embeds repeated images once and diagnoses missing resources without dropping order', async () => {
    const input = request('![A](a.svg)\n\n![B](a.svg)\n\n![C](missing.svg)\n\n尾段');
    input.resources.read = vi.fn(async destination => { if (destination === 'missing.svg') throw new Error('不存在'); return { bytes: new Uint8Array([1]), mime: 'image/png' }; });
    const { html, diagnostics } = await renderPdfManuscript(input, '');
    expect(input.resources.read).toHaveBeenCalledTimes(2);
    expect(diagnostics).toEqual(['图片不可用：C']);
    expect(html.indexOf('[图片不可用：C]')).toBeLessThan(html.indexOf('尾段'));
  });
  it('preserves invalid formulas and unresolved references with diagnostics', async () => {
    const { html, diagnostics } = await renderPdfManuscript(request('无效 $\\invalidcommand$，缺失 [@fig:missing]。'), '');
    expect(html).toContain('$\\invalidcommand$'); expect(html).toContain('[@fig:missing]');
    expect(diagnostics).toContain('有公式无法渲染，已保留公式源码。');
    expect(diagnostics.some(message => message.includes('fig:missing'))).toBe(true);
  });
  it('omits reference definitions while keeping resolved images', async () => {
    const { html } = await renderPdfManuscript(request('![图][pic]\n\n[pic]: a.svg'), '');
    expect(html).toContain('data:image/svg+xml'); expect(html).not.toContain('[pic]:');
  });
  it('preserves explicit Markdown hard breaks without indenting a second paragraph', async () => {
    const { html } = await renderPdfManuscript(request('第一行  \n第二行'), '');
    const body = html.split('<article class="manuscript">')[1];
    expect(body).toContain('第一行<br>第二行');
    expect(body.match(/class="prose"/g)).toHaveLength(1);
  });
  it('honors cancellation and version completeness before export', async () => {
    const input = request('正文'), controller = new AbortController();
    controller.abort(); input.signal = controller.signal;
    await expect(renderPdfManuscript(input, '')).rejects.toThrow();
    const adapter = { format: 'pdf' as const, export: vi.fn() };
    const incomplete = request('正文'); incomplete.model.complete = false;
    await expect(exportDocument(adapter, incomplete, { documentId: incomplete.model.documentId, revision: 0 })).rejects.toThrow('尚未完成');
    expect(adapter.export).not.toHaveBeenCalled();
  });
  it('creates PDF through a separate sandbox window rather than the editing window', () => {
    const adapter = readFileSync('src/main/export/PdfExportAdapter.ts', 'utf8');
    expect(adapter).toContain('renderPdfManuscript(request, mathCss)');
    expect(adapter).toContain('new BrowserWindow({ show: false');
    expect(adapter).toContain('sandbox: true'); expect(adapter).toContain('document.fonts.ready');
    expect(adapter).toContain('window.webContents.printToPDF'); expect(adapter).not.toContain('getWindow()');
  });
});
