import { semanticText, type DocumentNode } from '../model';
import { contentWidth, manuscriptLayout, mmToTwips, ptToTwips, type ManuscriptLayout } from './ManuscriptLayout';

/** Legacy public constants, derived from the shared default export layout. */
const defaultLayout = manuscriptLayout();
export const DOCX_LAYOUT = Object.freeze({
  contentWidth: contentWidth(defaultLayout),
  headerDistance: mmToTwips(defaultLayout.page.runningDistance),
  footerDistance: mmToTwips(defaultLayout.page.runningDistance),
  runningTitleCharacters: 42,
  table: { outerBorder: defaultLayout.table.outerBorder * 8, headerBorder: defaultLayout.table.headerBorder * 8,
    verticalMargin: ptToTwips(defaultLayout.table.verticalPadding), horizontalMargin: ptToTwips(defaultLayout.table.horizontalPadding),
    lineHeight: ptToTwips(defaultLayout.table.size * defaultLayout.table.lineHeight) }
});

function measure(node: DocumentNode): number {
  if (node.kind === 'attribute') return 0;
  if (node.kind === 'math') {
    // Estimate visible formula width without converting it to an image or parsing Markdown.
    const visible = (node.text ?? '').replace(/\\[a-zA-Z]+/g, 'x').replace(/[{}_^]/g, '');
    return Math.min(32, Math.max(3, Array.from(visible).length * 0.7));
  }
  if (node.text !== undefined) return Array.from(node.text).reduce((sum, c) => sum + (/[^\x00-\xff]/.test(c) ? 1 : 0.55), 0);
  return node.children.reduce((sum, child) => sum + measure(child), 0);
}

export function manuscriptTableLayout(table: DocumentNode, layout: ManuscriptLayout = manuscriptLayout()): { widths: number[]; align: ('left' | 'center' | 'right')[] } {
  const rows = table.children.filter(n => n.kind === 'row').map(row => row.children.filter(n => n.kind === 'cell'));
  const columns = Math.max(1, ...rows.map(row => row.length));
  const weights = Array.from({ length: columns }, (_, col) => {
    const lengths = rows.map(row => row[col] ? measure(row[col]) : 0).sort((a, b) => a - b);
    return Math.max(6, Math.min(38, Math.max(lengths[Math.floor((lengths.length - 1) * 0.8)] ?? 0, rows[0]?.[col] ? measure(rows[0][col]) : 0) + 3));
  });
  const total = contentWidth(layout);
  const minimum = Math.min(680, total / columns * 0.65);
  const maximum = columns === 1 ? total : Math.max(minimum, total * 0.7);
  const widths = weights.map(() => minimum);
  let remaining = total - minimum * columns;
  let active = weights.map((_, i) => i);
  while (remaining > 0.01 && active.length) {
    const weight = active.reduce((sum, i) => sum + weights[i], 0);
    const allocated = active.map(i => Math.min(maximum - widths[i], remaining * weights[i] / weight));
    active.forEach((i, index) => { widths[i] += allocated[index]; });
    remaining -= allocated.reduce((sum, value) => sum + value, 0);
    active = active.filter(i => widths[i] < maximum - 0.01);
  }
  const rounded = widths.map(Math.floor);
  for (let i = 0, extra = total - rounded.reduce((sum, width) => sum + width, 0); extra > 0; extra--, i++) rounded[i % columns]++;
  const align = weights.map((_, col): 'left' | 'center' | 'right' => {
    if (table.alignExplicit?.[col] || table.align?.[col] === 'center' || table.align?.[col] === 'right') return table.align?.[col] ?? 'left';
    const data = rows.slice(1).map(row => row[col] ? semanticText(row[col]).trim() : '').filter(Boolean);
    const numeric = data.filter(text => /^[+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?\s*(?:%|‰|[a-zA-Zμ°/]+)?$/.test(text)).length;
    if (data.length && numeric / data.length >= 0.8) return 'right';
    const math = rows.slice(1).map(row => row[col]).filter(Boolean);
    if (math.length && math.every(cell => cell.children.some(n => n.kind === 'math') && cell.children.every(n => n.kind === 'math' || n.kind === 'attribute' || n.kind === 'text' && !n.text?.trim()))) return 'center';
    return 'left';
  });
  return { widths: rounded, align };
}

// Compatibility for callers; both renderers use the same column estimator.
export const docxTableLayout = manuscriptTableLayout;
