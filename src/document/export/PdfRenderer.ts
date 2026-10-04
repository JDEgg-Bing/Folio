import katex from 'katex';
import { semanticText, type DocumentNode } from '../model';
import type { ExportRequest } from './ExportAdapter';
import { manuscriptFonts, manuscriptIdentity, manuscriptLayout, proseIndent } from './ManuscriptLayout';
import { manuscriptTableLayout } from './DocxLayout';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}
export interface PdfManuscript { html: string; headerTemplate: string; footerTemplate: string; diagnostics: string[] }

/** Independent semantic renderer. It never reads an EditorView or editor DOM. */
export async function renderPdfManuscript(request: ExportRequest, mathCss: string): Promise<PdfManuscript> {
  const { model, resources, signal } = request;
  const layout = manuscriptLayout(request.preset), identity = manuscriptIdentity(model);
  const diagnostics: string[] = model.diagnostics.filter(diagnostic => diagnostic.code !== 'missing-id').map(diagnostic => diagnostic.message);
  const references = new Map(model.references.map(reference => [reference.from, reference]));
  const label = (node: DocumentNode) => {
    const targets = node.referenceId ? model.targets.get(node.referenceId) : undefined;
    return targets?.length === 1 ? targets[0].label : null;
  };
  const resourceCache = new Map<string, Promise<string>>();
  async function imageUrl(destination: string): Promise<string> {
    if (!resourceCache.has(destination)) resourceCache.set(destination, resources.read(destination, signal).then(({ bytes, mime }) => {
      if (!/^image\/(?:png|jpeg|webp|gif|bmp|avif|svg\+xml)$/.test(mime)) throw new Error('不支持此图片格式。');
      return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
    }));
    return resourceCache.get(destination)!;
  }
  async function render(node: DocumentNode, context: 'body' | 'quote' | 'list' | 'inline' = 'body'): Promise<string> {
    signal.throwIfAborted();
    const children = async (next = context) => (await Promise.all(node.children.map(child => render(child, next)))).join('');
    const id = `id="${escapeHtml(node.id)}"`;
    switch (node.kind) {
      case 'document': return children('body');
      case 'attribute': return '';
      case 'text': return node.sourceType === 'HardBreak' ? '<br>' : escapeHtml(node.text ?? '');
      case 'heading': {
        const level = Math.min(6, Math.max(1, node.level ?? 1));
        return `<h${level} ${id}${node === identity.titleNode ? ' class="document-title"' : ''}>${(await children('inline')).trim()}</h${level}>`;
      }
      case 'paragraph': {
        const figure = node.children.find(child => child.kind === 'image');
        if (figure && node.children.every(child => child === figure || child.kind === 'attribute' || child.kind === 'text' && !child.text?.trim())) return renderImage(figure, true);
        const mathOnly = node.children.every(child => child.kind === 'math' || child.kind === 'attribute' || child.kind === 'text' && !child.text?.trim());
        const prose = context === 'body' && !figure && !mathOnly;
        return `<p ${id} class="${prose ? 'prose' : 'plain'}"${prose ? ` style="text-indent:${proseIndent(node, layout)}em"` : ''}>${await children('inline')}</p>`;
      }
      case 'quote': return `<blockquote ${id}>${await children('quote')}</blockquote>`;
      case 'list': return `<${node.ordered ? 'ol' : 'ul'} ${id}${node.ordered ? ` start="${node.start ?? 1}"` : ''}>${await children('list')}</${node.ordered ? 'ol' : 'ul'}>`;
      case 'listItem': return `<li ${id}>${await children('list')}</li>`;
      case 'strong': return `<strong>${await children('inline')}</strong>`;
      case 'emphasis': return `<em>${await children('inline')}</em>`;
      case 'strike': return `<s>${await children('inline')}</s>`;
      case 'inlineCode': return `<code>${escapeHtml(semanticText(node))}</code>`;
      case 'code': {
        const raw = node.text ?? '';
        const text = /^\s*(`{3,}|~{3,})/.test(raw) ? raw.replace(/^\s*(`{3,}|~{3,})[^\n]*\n?/, '').replace(/\n?\s*(`{3,}|~{3,})\s*$/, '') : raw.replace(/^ {4}/gm, '');
        return `<pre ${id}><code>${escapeHtml(text)}</code></pre>`;
      }
      case 'rule': return '<hr>';
      case 'image': return renderImage(node, false);
      case 'math': {
        let formula: string;
        try { if ((node.text?.length ?? 0) > 50000) throw new Error('公式过长'); formula = katex.renderToString(node.text ?? '', { displayMode: !!node.display, throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20, strict: 'ignore', output: 'htmlAndMathml' }); }
        catch { diagnostics.push('有公式无法渲染，已保留公式源码。'); formula = `<code>${escapeHtml(node.sourceText ?? node.text ?? '')}</code>`; }
        return node.display ? `<div ${id} class="equation">${formula}${label(node) ? `<span class="equation-number">${escapeHtml(label(node)!)}</span>` : ''}</div>` : formula;
      }
      case 'reference': {
        const relation = references.get(node.from);
        if (!relation?.target) { diagnostics.push(`未解析引用：${node.referenceId}`); return escapeHtml(`[@${node.referenceId}]`); }
        return `<a href="#${escapeHtml(relation.target.nodeId)}">${escapeHtml(relation.target.label)}</a>`;
      }
      case 'link': {
        const href = node.destination ?? '';
        return /^(?:https?:|mailto:|#)/i.test(href) ? `<a href="${escapeHtml(href)}">${await children('inline')}</a>` : children('inline');
      }
      case 'table': {
        const rows = node.children.filter(child => child.kind === 'row');
        const columns = manuscriptTableLayout(node, layout), total = columns.widths.reduce((a, b) => a + b, 0);
        const rendered = await Promise.all(rows.map(async (row, index) => `<tr>${(await Promise.all(row.children.filter(cell => cell.kind === 'cell').map(async (cell, column) => {
          const tag = index === 0 ? 'th' : 'td';
          return `<${tag} style="text-align:${columns.align[column] ?? 'left'}">${await render(cell, 'inline')}</${tag}>`;
        }))).join('')}</tr>`));
        return `<div ${id} class="table-block">${label(node) ? `<div class="caption">${escapeHtml(label(node)!)}</div>` : ''}<table><colgroup>${columns.widths.map(width => `<col style="width:${width / total * 100}%">`).join('')}</colgroup><thead>${rendered[0] ?? ''}</thead><tbody>${rendered.slice(1).join('')}</tbody></table></div>`;
      }
      case 'cell': case 'row': return children('inline');
      case 'raw':
        if (node.sourceType === 'LinkReference') return '';
        return escapeHtml(node.text ?? '');
    }
  }
  async function renderImage(node: DocumentNode, block: boolean): Promise<string> {
    let content: string;
    try { content = `<img src="${escapeHtml(await imageUrl(node.destination ?? ''))}" alt="${escapeHtml(node.text ?? '')}">`; }
    catch (cause) {
      signal.throwIfAborted();
      diagnostics.push(`图片不可用：${node.text || node.destination || '未知图片'}`);
      content = `<span class="missing-image">[图片不可用：${escapeHtml(node.text || node.destination || '')}]</span>`;
    }
    const caption = label(node);
    return block ? `<figure id="${escapeHtml(node.id)}">${content}${caption || node.text ? `<figcaption>${escapeHtml([caption, node.text].filter(Boolean).join('　'))}</figcaption>` : ''}</figure>` : content;
  }
  const body = await render(model.root);
  signal.throwIfAborted();
  const headingStyles = layout.headings.map((h, i) => `h${i + 1}{font-size:${h.size}pt;font-weight:700;margin:${h.before}pt 0 ${h.after}pt}`).join('');
  const fonts = manuscriptFonts(layout), page = layout.page;
  const css = `${fonts.css}\n${mathCss}\n
    @page{size:A4;margin:${page.top}mm ${page.right}mm ${page.bottom}mm ${page.left}mm} :root{color-scheme:light}
    *{box-sizing:border-box}html,body{margin:0;background:#fff;color:#222}
    body{font-family:${fonts.family};font-size:${layout.body.size}pt;line-height:${layout.body.lineHeight}}
    p{margin:0 0 ${layout.body.after}pt;orphans:3;widows:3;overflow-wrap:break-word}
    p.prose{text-align:${layout.body.align};text-align-last:start;text-justify:auto}
    h1,h2,h3,h4,h5,h6{line-height:1.25;text-align:left;text-indent:0;color:#000;break-after:avoid;break-inside:avoid}
    ${headingStyles}
    h1.document-title{font-size:${layout.title.size}pt;margin:${layout.title.before}pt 0 ${layout.title.after}pt;text-align:center;color:#000}
    blockquote{margin:${layout.elementGap}pt 0 ${layout.elementGap}pt ${layout.quoteIndent}pt;padding-left:8pt;border-left:0.5pt solid #bbb;color:#555;text-align:left}
    ul,ol{padding-left:${layout.listIndent}pt;margin:0 0 ${layout.body.after}pt;text-align:left}
    li>p{margin-bottom:2pt}pre{white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;background:#${layout.code.background};padding:${layout.code.padding}pt;margin:${layout.elementGap}pt 0;font-size:${layout.code.size}pt;line-height:${layout.code.lineHeight};orphans:2;widows:2;box-decoration-break:clone}
    code{font-family:"${layout.fonts.code}",monospace;font-size:0.9em}pre code{font-size:inherit}
    figure{margin:${layout.elementGap}pt 0;text-align:center;break-inside:avoid}
    figure img{display:block;max-width:100%;max-height:${layout.imageMaxHeight}mm;width:auto;height:auto;margin:auto}
    p img{max-width:100%;max-height:2em;vertical-align:middle}
    figcaption,.caption{text-align:center;font-size:${layout.caption.size}pt;line-height:1.3;margin:${layout.caption.before}pt 0 ${layout.caption.after}pt;color:#555}
    .caption{break-after:avoid}figcaption{break-before:avoid}
    table{width:100%;border-collapse:collapse;border-top:${layout.table.outerBorder}pt solid #333;border-bottom:${layout.table.outerBorder}pt solid #333;text-indent:0;font:inherit;font-size:${layout.table.size}pt;line-height:${layout.table.lineHeight};table-layout:fixed}
    th,td{padding:${layout.table.verticalPadding}pt ${layout.table.horizontalPadding}pt;border:0;overflow-wrap:anywhere;vertical-align:middle}th{font-weight:700;border-bottom:${layout.table.headerBorder}pt solid #333}
    thead{display:table-header-group}tr{break-inside:avoid}.table-block{margin:${layout.elementGap}pt 0;break-inside:auto}
    .equation{position:relative;text-align:center;margin:${layout.elementGap}pt 0;padding:0 3em;break-inside:avoid}
    .equation .katex-display{margin:0}.equation-number{position:absolute;right:0;top:50%;transform:translateY(-50%)}
    a{color:inherit;text-decoration:none}hr{border:0;border-top:1px solid #bbb;margin:1em 0}
    .missing-image{font-size:0.9em;color:#555}`;
  // Chromium's print margin templates are separate from body CSS and cannot
  // inherit it. Give them explicit fonts, dimensions and restrained typography.
  const running = `width:100%;padding:0 ${page.right}mm 0 ${page.left}mm;text-align:center;font-family:'${layout.fonts.latin}','${layout.fonts.chinese}',serif;font-size:${layout.runningSize}pt;color:#666;line-height:1.2;`;
  const headerTemplate = `<div style="${running}padding-top:3mm;">${escapeHtml(identity.runningTitle)}</div>`;
  const footerTemplate = `<div style="${running}padding-bottom:3mm;"><span class="pageNumber"></span></div>`;
  const csp = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  return { html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${escapeHtml(identity.title)}</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><article class="manuscript">${body}</article></body></html>`, headerTemplate, footerTemplate, diagnostics: [...new Set(diagnostics)] };
}
