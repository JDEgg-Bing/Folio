import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { EditorState } from '@codemirror/state';
import { undo, redo } from '@codemirror/commands';
import { renderDocx, type DocxMedia } from '../../src/document/export/DocxRenderer';
import { DEFAULT_WRITING_APPEARANCE } from '../../src/renderer/preferences/WritingAppearance';
import type { ExportRequest } from '../../src/document/export/ExportAdapter';
import { exportDocument } from '../../src/document/export/ExportAdapter';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { SavedDocumentTracker } from '../../src/renderer/editor/EditorController';
import { modelFor } from './helpers';
import { docxTableLayout, DOCX_LAYOUT } from '../../src/document/export/DocxLayout';

// Real 1×1 PNG; ZIP tests inspect bytes and relationships, not just existence.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const media: DocxMedia = { image: vi.fn(async () => png), formula: vi.fn(async () => png) };
function request(source: string): ExportRequest { return { model: modelFor(source), appearance: DEFAULT_WRITING_APPEARANCE, signal: new AbortController().signal, resources: { read: vi.fn(async () => ({ bytes: png, mime: 'image/png' })) } }; }
async function output(source: string, input = request(source), assets = media) {
  const result = await renderDocx(input, assets), files = unzipSync(result.bytes);
  const part = (path: string) => strFromU8(files[path]);
  return { ...result, files, part, doc: part('word/document.xml'), styles: part('word/styles.xml'), numbering: part('word/numbering.xml'), rels: part('word/_rels/document.xml.rels') };
}
describe('DOCX semantic renderer', () => {
  it.each([1, 2, 3, 4, 5, 6])('exports H%s as a real outline heading with a keep-next style', async level => {
    const o = await output(`正文\n\n${'#'.repeat(level)} 标题`);
    expect(o.doc).toContain(`w:pStyle w:val="Heading${level}"`);
    expect(o.styles).toContain(`<w:outlineLvl w:val="${level - 1}"`);
    expect(o.styles).toContain('<w:keepNext/>');
  });
  it('writes editable mixed-language paragraphs, two-character indent and justification', async () => {
    const o = await output('中文 English 123 正文');
    expect(o.doc).toContain('<w:t xml:space="preserve">中文 English 123 正文</w:t>');
    expect(o.doc).toContain('<w:jc w:val="both"/>'); expect(o.doc).toContain('<w:ind w:firstLine="480"/>');
    expect(o.doc).not.toMatch(/altChunk|cm-editor|contenteditable/);
  });
  it('sets export fonts independently of editor appearance and maps shared spacing onto A4', async () => {
    const o = await output('正文');
    expect(o.styles).toContain('w:ascii="Times New Roman"'); expect(o.styles).toContain('w:eastAsia="SimSun"');
    expect(o.styles).toContain('w:line="360"'); expect(o.styles).toContain('w:after="120"');
    expect(o.doc).toContain('w:w="11906" w:h="16838"'); expect(o.doc).toContain('w:top="1247" w:right="1134"');
    const custom = request('正文'); custom.appearance = { ...custom.appearance, chineseFontFamily: '"Microsoft YaHei", sans-serif', latinFontFamily: 'Arial', fontSize: 20, lineHeight: 2 };
    const c = await output('', custom); expect(c.styles).toEqual(o.styles);
  });
  it('preserves nested bold and italic as run properties', async () => {
    const o = await output('**粗体 *嵌套斜体*** 和 *斜体*');
    expect(o.doc).toContain('<w:b/>'); expect(o.doc).toContain('<w:i/>'); expect(o.doc).toContain('<w:b/><w:i/>'); expect(o.doc).not.toContain('**');
  });
  it('exports inline code and fenced code as editable monospace text', async () => {
    const o = await output('`parameter`\n\n```ts\nconst x = "<a>";\nreturn x;\n```');
    expect(o.doc).toContain('w:ascii="Consolas"'); expect(o.doc).toContain('const x = &quot;&lt;a&gt;&quot;;'); expect(o.doc).toContain('<w:br/>'); expect(o.doc).not.toContain('```');
  });
  it('uses native decimal and bullet numbering with restart and nested levels', async () => {
    const o = await output('3. 三\n4. 四\n   - 子项\n\n- 一\n- 二\n\n1. 重启');
    expect(o.numbering).toContain('<w:start w:val="3"/>'); expect(o.numbering).toContain('w:val="decimal"'); expect(o.numbering).toContain('w:val="bullet"'); expect(o.doc).toContain('<w:ilvl w:val="1"/>'); expect(o.doc).toContain('<w:numId w:val="4"/>');
  });
  it('does not repeat a number for continuation paragraphs in a list item', async () => {
    const o = await output('- 第一段\n\n  继续段');
    expect(o.doc.match(/<w:numPr>/g)).toHaveLength(1); expect(o.doc).toContain('继续段');
  });
  it('places all abstract numbering definitions before instances so Word preserves decimal lists', async () => {
    const o = await output('1. 有序\n\n- 无序');
    expect(o.numbering.lastIndexOf('</w:abstractNum>')).toBeLessThan(o.numbering.indexOf('<w:num '));
    expect(o.numbering).toContain('<w:num w:numId="1"><w:abstractNumId w:val="1"/>');
    expect(o.numbering).toContain('<w:num w:numId="2"><w:abstractNumId w:val="2"/>');
  });
  it('omits reference definition paragraphs and preserves schema order for paragraph properties', async () => {
    const o = await output('![图][pic]\n\n[pic]: a.png\n\n> - 引用中的列表');
    expect(o.doc).not.toContain('[pic]:');
    const parser = new DOMParser(), dom = parser.parseFromString(o.doc, 'application/xml');
    for (const props of Array.from(dom.getElementsByTagName('w:pPr'))) {
      const names = Array.from(props.childNodes).filter(n => n.nodeType === 1).map(n => n.nodeName);
      expect(new Set(names).size).toBe(names.length);
      if (names.includes('w:numPr') && names.includes('w:ind')) expect(names.indexOf('w:numPr')).toBeLessThan(names.indexOf('w:ind'));
    }
  });
  it('exports quotation indents and a restrained left border without prose indentation', async () => {
    const o = await output('> 引用说明'); expect(o.doc).toContain('<w:left w:val="single"'); expect(o.doc).toContain('<w:ind w:left='); expect(o.doc).not.toContain('w:firstLine'); expect(o.doc).not.toContain('&gt;');
  });
  it('exports a separator as a paragraph border', async () => { const o = await output('---'); expect(o.doc).toContain('<w:bottom w:val="single"'); });
  it('uses editable three-line tables, repeated headers and per-column alignment', async () => {
    const o = await output('| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| **数据** | 2 | $x^2$ |\n{#tbl:t}');
    expect(o.doc.match(/<w:tbl>/g)).toHaveLength(1); expect(o.doc.match(/<w:tc>/g)).toHaveLength(6); expect(o.doc).toContain('<w:tblHeader/>'); expect(o.doc).toContain('<w:insideV w:val="nil"'); expect(o.doc).toContain('<w:jc w:val="right"/>'); expect(o.doc).toContain('表 1'); expect(o.doc).toContain('<m:oMath');
  });
  it('embeds local PNG bytes and keeps caption and alt text', async () => {
    const o = await output('![实验装置](a.png){#fig:a}');
    expect(o.files['word/media/image1.png']).toEqual(new Uint8Array(png)); expect(o.rels).toContain('Target="media/image1.png"'); expect(o.doc).toContain('<w:drawing>'); expect(o.doc).toContain('descr="实验装置"'); expect(o.doc).toContain('图 1　实验装置'); expect(o.rels).not.toContain('a.png');
  });
  it('normalizes SVG through the image renderer and preserves its aspect ratio', async () => {
    const input = request('![图](a.svg)'); input.resources.read = async () => ({ bytes: Buffer.from('<svg/>'), mime: 'image/svg+xml' });
    const transform = vi.fn(async () => png); const o = await output('', input, { ...media, image: transform }); expect(transform).toHaveBeenCalledOnce(); expect(o.doc).toContain('<wp:extent cx="9525" cy="9525"/>'); expect(o.files['word/media/image1.png']).toBeTruthy();
  });
  it('keeps missing-image placeholders, caption and following content with diagnostics', async () => {
    const input = request('![缺失](missing.png){#fig:a}\n\n尾段'); input.resources.read = async () => { throw new Error('missing'); };
    const o = await output('', input); expect(o.diagnostics).toContain('图片不可用：缺失'); expect(o.doc).toContain('[图片不可用：缺失]'); expect(o.doc).toContain('图 1　缺失'); expect(o.doc.indexOf('缺失')).toBeLessThan(o.doc.indexOf('尾段'));
  });
  it.each([['x^2', 'm:sSup'], ['\\frac{a}{b}', 'm:f'], ['\\sqrt{x}', 'm:rad'], ['\\sum_{i=1}^n i', 'm:nary'], ['\\begin{aligned}x&=1\\\\y&=2\\end{aligned}', 'm:']])('converts %s to native OMML', async (formula, tag) => {
    const o = await output(`$${formula}$`); expect(o.doc).toContain('<m:oMath'); expect(o.doc).toContain(`<${tag}`); expect(o.diagnostics).toEqual([]); expect(o.doc).not.toContain('<w:drawing>');
  });
  it('centers numbered block equations and resolves all reference types using model numbering', async () => {
    const source = '# 节 {#sec:s}\n\n![图](a.png){#fig:f}\n\n| A |\n| --- |\n| 1 |\n{#tbl:t}\n\n$$\nx=1\n$$\n{#eq:e}\n\n参见 [@sec:s] [@fig:f] [@tbl:t] [@eq:e]';
    const o = await output(source); for (const text of ['节', '图 1', '表 1', '(1)']) expect(o.doc).toContain(text); expect(o.doc).toContain('<w:tab w:val="right" w:pos="9638"/>'); expect(o.doc).not.toContain('[@'); expect(o.diagnostics).toEqual([]);
  });
  it('falls back for layout-heavy formulas with PNG, recoverable LaTeX and a warning', async () => {
    const formula = '\\phantom{x}+y'; const o = await output(`$${formula}$`); expect(o.doc).toContain('<w:drawing>'); expect(o.doc).toContain(`descr="LaTeX: ${formula}"`); expect(o.diagnostics.join()).toContain('降级为图片');
  });
  it('preserves invalid LaTeX source and unresolved references when fallback fails', async () => {
    const o = await output('$\\invalidcommand$ [@fig:missing]', undefined, { ...media, formula: async () => { throw new Error('invalid'); } }); expect(o.doc).toContain('$\\invalidcommand$'); expect(o.doc).toContain('[@fig:missing]'); expect(o.diagnostics.join()).toContain('源码');
  });
  it('preserves external hyperlinks but rejects active schemes and escapes XML', async () => {
    const o = await output('[外部](https://example.com/?a=1&b=2) [危险](javascript:alert)\n\n<script>'); expect(o.doc).toContain('<w:hyperlink r:id='); expect(o.rels).toContain('TargetMode="External"'); expect(o.rels).toContain('a=1&amp;b=2'); expect(o.rels).not.toContain('javascript:'); expect(o.doc).toContain('&lt;script&gt;');
  });
  it('preserves content order and explicit line breaks', async () => {
    const o = await output('# 标题\n\n正文甲  \n正文乙\n\n> 引用\n\n$$x=1$$\n\n| 列 |\n| --- |\n| 数据 |\n\n![图片](a.png)\n\n结尾');
    const markers = ['标题', '正文甲', '正文乙', '引用', '<m:oMath', '<w:tbl>', '<w:drawing>', '结尾']; for (let i = 1; i < markers.length; i++) expect(o.doc.indexOf(markers[i])).toBeGreaterThan(o.doc.indexOf(markers[i - 1])); expect(o.doc).toContain('<w:br/>');
  });
  it('builds a real ZIP/OPC package with well-formed XML and complete part relationships', async () => {
    const o = await output('正文 $a<b$\n\n![图](a.png)'); expect([...o.bytes.slice(0, 2)]).toEqual([80, 75]); expect(o.mime).toContain('wordprocessingml.document');
    for (const path of Object.keys(o.files).filter(path => /xml$|rels$/.test(path))) {
      const errors: string[] = []; new DOMParser({ onError: (level, message) => errors.push(`${level}: ${message}`) }).parseFromString(o.part(path), 'application/xml'); expect(errors, path).toEqual([]);
    }
    expect(o.part('[Content_Types].xml')).toContain('/word/document.xml'); expect(o.part('_rels/.rels')).toContain('Target="word/document.xml"');
    for (const m of o.rels.matchAll(/Target="([^"]+)"/g)) expect(o.files[`word/${m[1]}`]).toBeTruthy();
  });
  it('does not mutate the model, source, dirty tracker or undo/redo history', async () => {
    const source = '# 标题\n\n正文'; let state = EditorState.create({ doc: source, extensions: createEditorExtensions(() => {}) }); const saved = new SavedDocumentTracker(state.doc); state = state.update({ changes: { from: state.doc.length, insert: '新增' } }).state;
    const before = state.doc, input = request(before.toString()), snapshot = JSON.stringify(input.model.root); await renderDocx(input, media);
    expect(state.doc).toBe(before); expect(saved.isDirty(state.doc)).toBe(true); expect(JSON.stringify(input.model.root)).toBe(snapshot);
    const target = { get state() { return state; }, dispatch: (tr: import('@codemirror/state').Transaction) => { state = tr.state; } }; expect(undo(target)).toBe(true); expect(state.doc.toString()).toBe(source); expect(saved.isDirty(state.doc)).toBe(false); expect(redo(target)).toBe(true); expect(state.doc.toString()).toBe(before.toString());
  });
  it('rejects abort before output and after resource work without emitting a package', async () => {
    const input = request('![图](a.png)'), abort = new AbortController(); input.signal = abort.signal; input.resources.read = async () => { abort.abort(); return { bytes: png, mime: 'image/png' }; };
    await expect(renderDocx(input, media)).rejects.toThrow(); await expect(exportDocument({ format: 'docx', export: r => renderDocx(r, media) }, input, input.model)).rejects.toThrow();
  });
});

describe('DOCX formal manuscript layout', () => {
  const parse = (text: string) => new DOMParser().parseFromString(text, 'application/xml');
  it.each([[':---', 'left'], [':---:', 'center'], ['---:', 'right']])('sets native equation justification for %s cells, independently of paragraph alignment', async (delimiter, alignment) => {
    const o = await output(`| 数值 |\n| ${delimiter} |\n| 210 |\n| $x^2$ |\n| 1 |`);
    const dom = parse(o.doc), equation = dom.getElementsByTagName('m:oMathPara')[0];
    expect(equation.getElementsByTagName('m:jc')[0].getAttribute('m:val')).toBe(alignment);
    expect(dom.getElementsByTagName('m:sSup')).toHaveLength(1); expect(o.doc).not.toContain('<w:drawing>');
    expect(equation.parentNode!.childNodes[0].nodeName).toBe('w:pPr');
  });
  it('keeps mixed text and math inline and preserves fallback images', async () => {
    const o = await output('| 数值 |\n| ---: |\n| 结果 $x^2$ MPa |\n| $\\phantom{x}+y$ |');
    expect(o.doc).not.toContain('<m:oMathPara>'); expect(o.doc).toContain('<m:oMath'); expect(o.doc).toContain('<w:drawing>'); expect(o.doc).toContain('MPa');
  });
  it('sets one shared equation alignment for multiple native formulas in a cell', async () => {
    const o = await output('| 数值 |\n| ---: |\n| $x^2$ $y^2$ |');
    const equations = parse(o.doc).getElementsByTagName('m:oMathPara'); expect(equations).toHaveLength(1); expect(equations[0].getElementsByTagName('m:oMath')).toHaveLength(2); expect(equations[0].getElementsByTagName('m:jc')[0].getAttribute('m:val')).toBe('right');
  });
  it('uses an editable centered Title only for the opening H1', async () => {
    const o = await output('# 主标题\n\n正文\n\n# 正文一级标题');
    const paragraphs = Array.from(parse(o.doc).getElementsByTagName('w:p'));
    expect(paragraphs[0].getElementsByTagName('w:pStyle')[0].getAttribute('w:val')).toBe('Title');
    expect(paragraphs[2].getElementsByTagName('w:pStyle')[0].getAttribute('w:val')).toBe('Heading1');
    const title = Array.from(parse(o.styles).getElementsByTagName('w:style')).find(n => n.getAttribute('w:styleId') === 'Title')!;
    expect(title.getElementsByTagName('w:jc')[0].getAttribute('w:val')).toBe('center');
    expect(title.getElementsByTagName('w:sz')[0].getAttribute('w:val')).toBe('44');
    expect(title.getElementsByTagName('w:outlineLvl')).toHaveLength(0);
    expect(title.getElementsByTagName('w:b')).toHaveLength(1);
  });
  it('keeps a late H1 and a quoted H1 as body headings', async () => {
    for (const source of ['前言\n\n# 第一章', '> # 引用标题\n\n# 第一章']) {
      const o = await output(source); expect(o.doc).not.toContain('w:pStyle w:val="Title"'); expect(o.doc).toContain('w:pStyle w:val="Heading1"');
    }
  });
  it('ignores hidden reference definitions when identifying the title', async () => {
    const o = await output('[link]: https://example.com\n\n# 主标题'); expect(o.doc).toContain('w:pStyle w:val="Title"');
  });
  it('links native header/footer parts and content types with safe distances', async () => {
    const o = await output('# 中文 & English\n\n正文');
    expect(o.doc).toContain('<w:headerReference w:type="default"'); expect(o.doc).toContain('<w:footerReference w:type="default"');
    expect(o.doc).toContain('w:header="567" w:footer="567"'); expect(o.rels).toContain('Target="header1.xml"'); expect(o.rels).toContain('Target="footer1.xml"');
    expect(o.part('word/header1.xml')).toContain('中文 &amp; English');
    expect(o.part('[Content_Types].xml')).toContain('wordprocessingml.header+xml'); expect(o.part('[Content_Types].xml')).toContain('wordprocessingml.footer+xml');
    expect(o.styles).toContain('w:styleId="RunningMatter"'); expect(o.doc).not.toContain('第 ');
  });
  it('uses a native PAGE field with begin/instruction/separate/result/end', async () => {
    const o = await output('正文'), footer = o.part('word/footer1.xml');
    const markers = ['w:fldCharType="begin"', '> PAGE <', 'w:fldCharType="separate"', '>1<', 'w:fldCharType="end"'];
    for (let i = 1; i < markers.length; i++) expect(footer.indexOf(markers[i])).toBeGreaterThan(footer.indexOf(markers[i - 1]));
    expect(footer).toContain('w:dirty="true"'); expect(o.doc).not.toContain('titlePg'); // defaults repeat on every page
  });
  it('shortens long running titles without altering body content or splitting Unicode', async () => {
    const title = '科研😀标题'.repeat(20), o = await output(`# ${title}`);
    expect(o.doc).toContain(title); const headerText = parse(o.part('word/header1.xml')).getElementsByTagName('w:t')[0].textContent!;
    expect(Array.from(headerText)).toHaveLength(DOCX_LAYOUT.runningTitleCharacters); expect(headerText.endsWith('…')).toBe(true);
  });
  it('assigns wider text columns and fills the full manuscript width exactly', () => {
    const table = modelFor('| 序号 | 技术描述 | 值 |\n| --- | --- | --- |\n| 1 | 中英文混合 compression response 的详细说明 | 210 |\n| 2 | 短说明 | 3.5 |').root.children[0];
    const layout = docxTableLayout(table); expect(layout.widths.reduce((a,b) => a+b)).toBe(9638); expect(layout.widths[1]).toBeGreaterThan(layout.widths[0]); expect(layout.widths[1]).toBeGreaterThan(layout.widths[2]); expect(layout.align).toEqual(['right', 'left', 'right']);
  });
  it('retains explicit alignment including an explicitly left-aligned numeric column', () => {
    const table = modelFor('| A | B | C |\n| :--- | :---: | ---: |\n| 123 | 中文 | 4 |').root.children[0];
    expect(table.alignExplicit).toEqual([true,true,true]); expect(docxTableLayout(table).align).toEqual(['left','center','right']);
  });
  it('centers formula-only columns and right-aligns signed decimal and unit values', () => {
    const table = modelFor('| 公式 | 值 |\n| --- | --- |\n| $x^2$ | -1.25 MPa |\n| $\\frac{a}{b}$ | 2e-3 |').root.children[0]; expect(docxTableLayout(table).align).toEqual(['center','right']);
  });
  it('bounds extreme column weights and keeps one-column and wide tables valid', () => {
    for (const count of [1,2,12]) {
      const source = `| ${Array.from({length:count}, (_,i) => i === 0 ? '很长的中文说明'.repeat(100) : 'A').join(' | ')} |\n| ${Array.from({length:count}, () => '---').join(' | ')} |\n| ${Array.from({length:count}, () => '1').join(' | ')} |`;
      const widths = docxTableLayout(modelFor(source).root.children[0]).widths; expect(widths.reduce((a,b) => a+b)).toBe(9638); expect(widths.every(w => w > 0)).toBe(true); if (count > 1) expect(Math.max(...widths)).toBeLessThanOrEqual(Math.ceil(9638 * 0.7));
    }
  });
  it('writes consistent fixed grids, compact table styles and three-line borders', async () => {
    const o = await output('| 技术参数 | 值 |\n| --- | --- |\n| Compression 中文 | $x^2$ |\n{#tbl:t}'), dom = parse(o.doc), table = dom.getElementsByTagName('w:tbl')[0];
    const widths = Array.from(table.getElementsByTagName('w:gridCol')).map(n => n.getAttribute('w:w'));
    expect(table.getElementsByTagName('w:tblLayout')[0].getAttribute('w:type')).toBe('fixed');
    Array.from(table.getElementsByTagName('w:tcW')).forEach((n,i) => expect(n.getAttribute('w:w')).toBe(widths[i % widths.length]));
    expect(table.getElementsByTagName('w:top')[0].getAttribute('w:sz')).toBe('10'); expect(table.getElementsByTagName('w:tcBorders')[0].getElementsByTagName('w:bottom')[0].getAttribute('w:sz')).toBe('5');
    expect(o.doc).toContain('<w:insideV w:val="nil"'); expect(o.styles).toContain('w:line="263"'); expect(o.doc).toContain('<m:oMath'); expect(o.doc).toContain('w:after="60"'); expect(o.doc).toContain('<w:keepNext/>');
  });
  it('keeps all new XML parts well formed with valid default header/footer references', async () => {
    const o = await output('# 主标题\n\n| A |\n| --- |\n| 1 |');
    for (const part of ['word/header1.xml', 'word/footer1.xml', 'word/styles.xml', 'word/document.xml']) {
      const errors: string[] = []; new DOMParser({ onError: (_,message) => errors.push(message) }).parseFromString(o.part(part), 'application/xml'); expect(errors).toEqual([]);
    }
    const section = parse(o.doc).getElementsByTagName('w:sectPr')[0]; const names = Array.from(section.childNodes).map(n => n.nodeName); expect(names.slice(0,2)).toEqual(['w:headerReference','w:footerReference']);
  });
});
