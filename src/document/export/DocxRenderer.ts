import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import { zipSync, strToU8 } from 'fflate';
import { imageSize } from 'image-size';
import { semanticText, type DocumentNode } from '../model';
import { manuscriptTableLayout } from './DocxLayout';
import { contentWidth, manuscriptIdentity, manuscriptLayout, mmToTwips, proseIndent, ptToTwips } from './ManuscriptLayout';
import type { ExportRequest, ExportResult } from './ExportAdapter';
import { applyWordTemplate } from '../templates/WordTemplateRenderer';

export interface DocxMedia {
  /** Normalize formats unsupported by Word to a self-contained PNG. */
  image(bytes: Uint8Array, mime: string, signal: AbortSignal): Promise<Uint8Array>;
  formula(latex: string, display: boolean, signal: AbortSignal): Promise<Uint8Array>;
}
const x = (value: string) => value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const xml = (body: string) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + body;
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// WordprocessingML property order is significant even when XML is well formed.
function properties(raw: string, order: readonly string[]): string {
  const fragments = [...raw.matchAll(/<w:(\w+)\b[^>]*\/>|<w:(\w+)\b[^>]*>[\s\S]*?<\/w:\2>/g)];
  return fragments.sort((a, b) => order.indexOf(a[1] || a[2]) - order.indexOf(b[1] || b[2])).map(m => m[0]).join('');
}
const paragraphOrder = ['pStyle', 'keepNext', 'keepLines', 'widowControl', 'numPr', 'pBdr', 'shd', 'tabs', 'spacing', 'ind', 'jc', 'outlineLvl'];
const runOrder = ['rFonts', 'b', 'i', 'strike', 'color', 'sz', 'szCs', 'lang'];

/** Document Model → editable WordprocessingML. No Markdown parser or editor DOM. */
export async function renderDocx(request: ExportRequest, media: DocxMedia): Promise<ExportResult> {
  const { model, signal } = request;
  const base = manuscriptLayout(request.preset), templatePage = request.template?.profile.page;
  const a = templatePage ? { ...base, page: { ...base.page, width: templatePage.width * 25.4 / 1440, height: templatePage.height * 25.4 / 1440, top: templatePage.top * 25.4 / 1440, right: (templatePage.right + (templatePage.gutter || 0)) * 25.4 / 1440, bottom: templatePage.bottom * 25.4 / 1440, left: templatePage.left * 25.4 / 1440 } } : base;
  const width = contentWidth(a), page = a.page;
  const diagnostics = model.diagnostics.filter(d => d.code !== 'missing-id').map(d => d.message);
  const files: Record<string, Uint8Array> = {};
  const relationships: string[] = [];
  const numbering: { abstract: string; instance: string }[] = [];
  const { titleNode, runningTitle } = manuscriptIdentity(model);
  const refs = new Map(model.references.map(ref => [ref.from, ref]));
  const anchors = new Map([...model.targets.values()].filter(targets => targets.length === 1).map((targets, i) => [targets[0].id, { name: `_FolioRef${i}`, id: i + 1 }]));
  const bookmarked = (n: DocumentNode, content: string) => {
    const anchor = n.referenceId ? anchors.get(n.referenceId) : undefined;
    if (!request.template || !anchor) return content;
    const start = `<w:bookmarkStart w:id="${anchor.id}" w:name="${anchor.name}"/>`, end = `<w:bookmarkEnd w:id="${anchor.id}"/>`;
    const last = content.lastIndexOf('</w:p>');
    if (last < 0) return start + content + end;
    return (content.slice(0, last) + end + content.slice(last)).replace(/(<w:p><w:pPr>[\s\S]*?<\/w:pPr>)/, '$1' + start);
  };
  const size = Math.round(a.body.size * 2);
  const spacing = ptToTwips(a.body.after), gap = ptToTwips(a.elementGap);
  const label = (n: DocumentNode) => { const ts = n.referenceId ? model.targets.get(n.referenceId) : undefined; return ts?.length === 1 ? ts[0].label : ''; };
  const run = (text: string, props = '') => '<w:r>' + (props ? `<w:rPr>${properties(props, runOrder)}</w:rPr>` : '') + text.split(/(\n|\t)/).map(s => s === '\n' ? '<w:br/>' : s === '\t' ? '<w:tab/>' : `<w:t xml:space="preserve">${x(s)}</w:t>`).join('') + '</w:r>';
  const p = (content: string, props = '') => `<w:p><w:pPr>${properties(props, paragraphOrder)}</w:pPr>${content || run('')}</w:p>`;
  const rel = (type: string, target: string, external = false) => { const id = `rId${relationships.length + 1}`; relationships.push(`<Relationship Id="${id}" Type="${r}/${type}" Target="${x(target)}"${external ? ' TargetMode="External"' : ''}/>`); return id; };
  const caption = (text: string, table = false) => p(run(text), `<w:pStyle w:val="${request.template ? table ? 'TableCaption' : 'FigureCaption' : 'Caption'}"/><w:jc w:val="center"/><w:spacing w:before="${ptToTwips(a.caption.before)}" w:after="${table ? 60 : ptToTwips(a.caption.after)}"/>${table ? '<w:keepNext/>' : ''}`);
  let drawingId = 0;
  async function drawing(bytes: Uint8Array, mime: string, alt: string, inline: boolean, naturalScale = 1): Promise<string> {
    signal.throwIfAborted();
    const data = /^image\/(png|jpeg)$/.test(mime) ? bytes : await media.image(bytes, mime, signal);
    const dim = imageSize(data);
    if (!dim.width || !dim.height) throw new Error('图片尺寸无效');
    const factor = Math.min(naturalScale, width / 15 / dim.width, (inline ? a.body.size * 8 / 3 : a.imageMaxHeight * 96 / 25.4) / dim.height);
    const cx = Math.round(dim.width * factor * 9525), cy = Math.round(dim.height * factor * 9525);
    const id = ++drawingId, ext = mime === 'image/jpeg' ? 'jpg' : 'png';
    files[`word/media/image${id}.${ext}`] = data;
    const rid = rel('image', `media/image${id}.${ext}`);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="图片 ${id}" descr="${x(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image${id}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  async function image(n: DocumentNode, block: boolean) {
    let content: string;
    try { const resource = await request.resources.read(n.destination ?? '', signal); content = await drawing(resource.bytes, resource.mime, n.text ?? '', !block); }
    catch { signal.throwIfAborted(); diagnostics.push(`图片不可用：${n.text || n.destination}`); content = run(`[图片不可用：${n.text || n.destination}]`); }
    const hasCaption = [label(n), n.text].some(Boolean);
    return block ? bookmarked(n, p(content, `<w:jc w:val="center"/><w:keepLines/>${hasCaption ? '<w:keepNext/>' : ''}<w:spacing w:before="${gap}" w:after="${hasCaption ? 0 : gap}"/>`) + (hasCaption ? caption([label(n), n.text].filter(Boolean).join('　')) : '')) : content;
  }
  async function math(n: DocumentNode) {
    const latex = n.text ?? '';
    let content: string;
    try {
      if (latex.length > 50000) throw new Error('公式过长');
      const mml = katex.renderToString(latex, { output: 'mathml', displayMode: !!n.display, throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20, strict: 'ignore' }).match(/<math[\s\S]*<\/math>/)?.[0];
      if (!mml) throw new Error('没有数学内容');
      // Conservative gate: layout-heavy MathML gets a visual fallback rather than silent conversion loss.
      const allowed = new Set(['math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'mfrac', 'msqrt', 'mroot', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mstyle']);
      if ([...mml.matchAll(/<([a-z]+)\b/g)].some(m => !allowed.has(m[1])) || /\\(?:phantom|smash|raisebox|color|html|href|kern|hspace|vspace|tag|cancel)/.test(latex)) throw new Error('需要视觉降级');
      // KaTeX's annotation is source metadata, not visible equation content.
      // Preserve its XML entities: the converter's serializer writes decoded text verbatim.
      content = mml2omml(mml.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/g, ''), { disableDecode: true });
      if (!content.includes('<m:oMath') || !content.includes('<m:t')) throw new Error('转换为空');
    } catch {
      signal.throwIfAborted();
      try {
        content = await drawing(await media.formula(latex, !!n.display, signal), 'image/png', `LaTeX: ${latex}`, !n.display, a.body.size / 18);
        diagnostics.push('有公式已降级为图片；LaTeX 源码保留在图片替代文字中。');
      } catch { signal.throwIfAborted(); content = run(n.sourceText ?? latex, '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'); diagnostics.push('有公式无法渲染，已保留完整公式源码。'); }
    }
    if (!n.display) return content;
    const number = label(n);
    return p((number ? run('\t') : '') + content + (number ? run(`\t${number}`) : ''), ` ${request.template ? '<w:pStyle w:val="Equation"/>' : ''}<w:keepLines/><w:spacing w:before="${gap}" w:after="${gap}"/><w:jc w:val="${number ? 'left' : 'center'}"/>${number ? `<w:tabs><w:tab w:val="center" w:pos="${Math.round(width / 2)}"/><w:tab w:val="right" w:pos="${width}"/></w:tabs>` : ''}`);
  }
  async function inline(n: DocumentNode, props = '', contextSize = a.body.size): Promise<string> {
    signal.throwIfAborted();
    const children = async (next = props) => (await Promise.all(n.children.map(child => inline(child, next, contextSize)))).join('');
    switch (n.kind) {
      case 'attribute': return '';
      case 'strong': return children(props + '<w:b/>');
      case 'emphasis': return children(props + '<w:i/>');
      case 'strike': return children(props + '<w:strike/>');
      case 'inlineCode': return run(semanticText(n), props + `<w:rFonts w:ascii="${a.fonts.code}" w:hAnsi="${a.fonts.code}"/><w:sz w:val="${Math.round(contextSize * 0.9 * 2)}"/>`);
      case 'math': return math(n);
      case 'image': return image(n, false);
      case 'reference': { const ref = refs.get(n.from); if (ref?.target) { const anchor = request.template && anchors.get(ref.target.id); return anchor ? `<w:hyperlink w:anchor="${anchor.name}">${run(ref.target.label, props)}</w:hyperlink>` : run(ref.target.label, props); } diagnostics.push(`未解析引用：${n.referenceId}`); return run(`[@${n.referenceId}]`, props); }
      case 'link': { const content = await children(); return /^(https?:|mailto:)/i.test(n.destination ?? '') ? `<w:hyperlink r:id="${rel('hyperlink', n.destination!, true)}">${content}</w:hyperlink>` : content; }
      case 'raw': return n.sourceType === 'LinkReference' ? '' : run(n.text ?? '', props);
      default: return n.text !== undefined ? run(n.sourceType === 'HardBreak' ? '\n' : n.text, props) : children();
    }
  }
  type Context = { quote?: number; list?: number; depth?: number; first?: boolean };
  async function blocks(n: DocumentNode, ctx: Context = {}): Promise<string> {
    const result = await renderBlock(n, ctx);
    return n.kind === 'image' || n.kind === 'math' && !n.display ? result : bookmarked(n, result);
  }
  async function renderBlock(n: DocumentNode, ctx: Context = {}): Promise<string> {
    signal.throwIfAborted();
    const children = async (context = ctx) => { let result = ''; for (const child of n.children) result += await blocks(child, context); return result; };
    const indent = ptToTwips(a.quoteIndent * (ctx.quote ?? 0) + (ctx.list ? a.listIndent * ((ctx.depth ?? 0) + 1) : 0));
    const contextProps = `${indent ? `<w:ind w:left="${indent}"/>` : ''}${ctx.quote ? '<w:pStyle w:val="Quote"/><w:pBdr><w:left w:val="single" w:sz="4" w:space="8" w:color="BBBBBB"/></w:pBdr>' : ''}${ctx.list ? '<w:spacing w:after="40"/>' : ''}${ctx.list && ctx.first ? `<w:numPr><w:ilvl w:val="${ctx.depth ?? 0}"/><w:numId w:val="${ctx.list}"/></w:numPr>` : ''}`;
    switch (n.kind) {
      case 'document': return children();
      case 'attribute': return '';
      case 'raw': return n.sourceType === 'LinkReference' ? '' : p(await inline(n), contextProps);
      case 'heading': return p(await inline(n), `<w:pStyle w:val="${n === titleNode ? 'Title' : `Heading${n.level ?? 1}`}"/>`);
      case 'paragraph': {
        const fig = n.children.find(c => c.kind === 'image');
        if (fig && n.children.every(c => c === fig || c.kind === 'attribute' || c.kind === 'text' && !c.text?.trim())) return image(fig, true);
        const mathOnly = n.children.every(c => c.kind === 'math' || c.kind === 'attribute' || c.kind === 'text' && !c.text?.trim());
        if (request.template && /^(?:图\s*\d|表\s*\d|图\s*[:：]|表\s*[:：]|Figure\s+\d|Table\s+\d)/i.test(semanticText(n))) return p(await inline(n), `<w:pStyle w:val="${/^(?:表|Table)/i.test(semanticText(n)) ? 'TableCaption' : 'FigureCaption'}"/>`);
        return p(await inline(n), contextProps + (!ctx.quote && !ctx.list && !fig && !mathOnly ? `<w:jc w:val="${a.body.align === 'justify' ? 'both' : 'left'}"/><w:ind w:firstLine="${ptToTwips(a.body.size * proseIndent(n, a))}"/>` : '<w:jc w:val="left"/>'));
      }
      case 'quote': return children({ ...ctx, quote: (ctx.quote ?? 0) + 1 });
      case 'list': {
        const id = numbering.length + 1;
        const levels = Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="${n.start ?? 1}"/><w:numFmt w:val="${n.ordered ? 'decimal' : 'bullet'}"/><w:lvlText w:val="${n.ordered ? `%${i + 1}.` : '•'}"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${ptToTwips(a.listIndent * (i + 1))}"/></w:tabs><w:ind w:left="${ptToTwips(a.listIndent * (i + 1))}" w:hanging="240"/></w:pPr></w:lvl>`).join('');
        numbering.push({ abstract: `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="multilevel"/>${levels}</w:abstractNum>`, instance: `<w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>` });
        return children({ ...ctx, list: id, depth: Math.min(8, ctx.list ? (ctx.depth ?? 0) + 1 : 0) });
      }
      case 'listItem': { let out = '', first = true; for (const child of n.children) { out += await blocks(child, { ...ctx, first: first && child.kind !== 'list' }); if (child.kind !== 'list' && child.kind !== 'attribute') first = false; } return out; }
      case 'code': { const raw = n.text ?? ''; const text = /^\s*(`{3,}|~{3,})/.test(raw) ? raw.replace(/^\s*(`{3,}|~{3,})[^\n]*\n?/, '').replace(/\n?\s*(`{3,}|~{3,})\s*$/, '') : raw.replace(/^ {4}/gm, ''); return p(run(text), contextProps.replace('<w:pStyle w:val="Quote"/>', '') + '<w:pStyle w:val="CodeBlock"/><w:jc w:val="left"/>'); }
      case 'rule': return p('', '<w:pBdr><w:bottom w:val="single" w:sz="4" w:color="BBBBBB"/></w:pBdr>');
      case 'math': return math(n);
      case 'image': return image(n, true);
      case 'table': {
        const rows = n.children.filter(c => c.kind === 'row'), columns = Math.max(1, ...rows.map(row => row.children.filter(c => c.kind === 'cell').length));
        const layout = manuscriptTableLayout(n, a), tableStyle = a.table;
        let out = label(n) ? caption(label(n), true) : '';
        out += `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="${tableStyle.outerBorder * 8}" w:color="333333"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="${tableStyle.outerBorder * 8}" w:color="333333"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${ptToTwips(tableStyle.verticalPadding)}" w:type="dxa"/><w:left w:w="${ptToTwips(tableStyle.horizontalPadding)}" w:type="dxa"/><w:bottom w:w="${ptToTwips(tableStyle.verticalPadding)}" w:type="dxa"/><w:right w:w="${ptToTwips(tableStyle.horizontalPadding)}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${layout.widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`;
        for (const [i, row] of rows.entries()) {
          out += `<w:tr><w:trPr><w:cantSplit/>${i === 0 ? '<w:tblHeader/>' : ''}</w:trPr>`;
          const cells = row.children.filter(c => c.kind === 'cell');
          for (let col = 0; col < columns; col++) {
            const cell = cells[col];
            let content = cell ? await inline(cell, i === 0 ? '<w:b/>' : '', a.table.size) : '';
            const mathOnly = cell?.children.some(child => child.kind === 'math') && cell.children.every(child => child.kind === 'math' || child.kind === 'attribute' || child.kind === 'text' && !child.text?.trim());
            if (mathOnly && cell) {
              // Word treats a standalone oMath as a display equation and applies
              // its own justification, independently of the cell's w:jc.
              // Set both alignments explicitly; mixed prose/math remains inline.
              const equations = content.match(/<m:oMath(?:\s[^>]*)?>[\s\S]*?<\/m:oMath>/g);
              if (equations?.length === cell.children.filter(child => child.kind === 'math').length) content = `<m:oMathPara><m:oMathParaPr><m:jc m:val="${layout.align[col]}"/></m:oMathParaPr>${equations.join('')}</m:oMathPara>`;
            }
            const border = i === 0 ? `<w:tcBorders><w:bottom w:val="single" w:sz="${tableStyle.headerBorder * 8}" w:color="333333"/></w:tcBorders>` : '';
            out += `<w:tc><w:tcPr><w:tcW w:w="${layout.widths[col]}" w:type="dxa"/>${border}<w:vAlign w:val="center"/></w:tcPr>${p(content, `<w:pStyle w:val="TableText"/>${i === 0 ? '<w:keepNext/>' : ''}<w:jc w:val="${layout.align[col]}"/>`)}</w:tc>`;
          }
          out += '</w:tr>';
        }
        return out + '</w:tbl>' + p('', `<w:spacing w:after="${spacing}" w:line="1" w:lineRule="exact"/>`);
      }
      default: return p(await inline(n), contextProps);
    }
  }
  const body = await blocks(model.root);
  const font = `<w:rFonts w:ascii="${x(a.fonts.latin)}" w:hAnsi="${x(a.fonts.latin)}" w:eastAsia="${x(a.fonts.chinese)}" w:cs="${x(a.fonts.latin)}"/>`;
  const headingStyles = a.headings.map((h, i) => `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${ptToTwips(h.before)}" w:after="${ptToTwips(h.after)}" w:line="${ptToTwips(h.size * 1.25)}" w:lineRule="atLeast"/><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="${h.size * 2}"/></w:rPr></w:style>`).join('');
  const titleStyle = `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${ptToTwips(a.title.before)}" w:after="${ptToTwips(a.title.after)}" w:line="${ptToTwips(a.title.size * 1.25)}" w:lineRule="atLeast"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="${a.title.size * 2}"/></w:rPr></w:style>`;
  const tableTextStyle = `<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="${ptToTwips(a.table.size * a.table.lineHeight)}" w:lineRule="atLeast"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:sz w:val="${a.table.size * 2}"/></w:rPr></w:style>`;
  const runningStyle = `<w:style w:type="paragraph" w:styleId="RunningMatter"><w:name w:val="Running Matter"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="666666"/><w:sz w:val="${a.runningSize * 2}"/></w:rPr></w:style>`;
  const codeBorders = ['top', 'left', 'bottom', 'right'].map(side => `<w:${side} w:val="single" w:sz="1" w:space="${a.code.padding}" w:color="${a.code.background}"/>`).join('');
  const codeStyle = `<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:widowControl w:val="0"/><w:pBdr>${codeBorders}</w:pBdr><w:shd w:val="clear" w:fill="${a.code.background}"/><w:spacing w:before="${gap}" w:after="${gap}" w:line="${ptToTwips(a.code.size * a.code.lineHeight)}" w:lineRule="atLeast"/><w:ind w:left="${ptToTwips(a.code.padding)}" w:right="${ptToTwips(a.code.padding)}"/></w:pPr><w:rPr><w:rFonts w:ascii="${a.fonts.code}" w:hAnsi="${a.fonts.code}"/><w:sz w:val="${a.code.size * 2}"/></w:rPr></w:style>`;
  const quoteStyle = `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="${gap}" w:after="${gap}"/></w:pPr><w:rPr><w:color w:val="555555"/></w:rPr></w:style>`;
  files['word/styles.xml'] = strToU8(xml(`<w:styles xmlns:w="${w}"><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:color w:val="222222"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl/><w:spacing w:after="${spacing}" w:line="${ptToTwips(a.body.size * a.body.lineHeight)}" w:lineRule="atLeast"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${titleStyle}${headingStyles}${tableTextStyle}${runningStyle}${codeStyle}${quoteStyle}<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:pPr><w:keepLines/><w:spacing w:line="260" w:lineRule="atLeast"/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="${a.caption.size * 2}"/></w:rPr></w:style></w:styles>`));
  files['word/numbering.xml'] = strToU8(xml(`<w:numbering xmlns:w="${w}">${numbering.map(n => n.abstract).join('')}${numbering.map(n => n.instance).join('')}</w:numbering>`));
  rel('styles', 'styles.xml'); rel('numbering', 'numbering.xml');
  const headerId = rel('header', 'header1.xml'), footerId = rel('footer', 'footer1.xml');
  files['word/header1.xml'] = strToU8(xml(`<w:hdr xmlns:w="${w}">${p(run(runningTitle), '<w:pStyle w:val="RunningMatter"/>')}</w:hdr>`));
  const pageField = '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + run('1') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  files['word/footer1.xml'] = strToU8(xml(`<w:ftr xmlns:w="${w}">${p(pageField, '<w:pStyle w:val="RunningMatter"/>')}</w:ftr>`));
  files['word/document.xml'] = strToU8(xml(`<w:document xmlns:w="${w}" xmlns:r="${r}" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="${headerId}"/><w:footerReference w:type="default" r:id="${footerId}"/><w:pgSz w:w="${mmToTwips(page.width)}" w:h="${mmToTwips(page.height)}"/><w:pgMar w:top="${mmToTwips(page.top)}" w:right="${mmToTwips(page.right)}" w:bottom="${mmToTwips(page.bottom)}" w:left="${mmToTwips(page.left)}" w:header="${mmToTwips(page.runningDistance)}" w:footer="${mmToTwips(page.runningDistance)}" w:gutter="0"/></w:sectPr></w:body></w:document>`));
  files['word/_rels/document.xml.rels'] = strToU8(xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`));
  files['_rels/.rels'] = strToU8(xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${r}/officeDocument" Target="word/document.xml"/></Relationships>`));
  files['[Content_Types].xml'] = strToU8(xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'));
  signal.throwIfAborted();
  const result = { bytes: zipSync(files), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', diagnostics: [...new Set(diagnostics)] };
  return request.template ? applyWordTemplate(result, request.template) : result;
}
