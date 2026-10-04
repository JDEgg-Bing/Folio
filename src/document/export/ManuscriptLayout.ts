import { semanticText, type DocumentModel, type DocumentNode } from '../model';

export type ExportPresetId = 'manuscript' | 'academic' | 'reading';
export interface ManuscriptLayout {
  label: string;
  description: string;
  page: { width: number; height: number; top: number; right: number; bottom: number; left: number; runningDistance: number };
  fonts: { chinese: string; latin: string; code: string };
  body: { size: number; lineHeight: number; after: number; indent: number; align: 'justify' | 'left' };
  title: { size: number; before: number; after: number };
  headings: readonly { size: number; before: number; after: number }[];
  caption: { size: number; before: number; after: number };
  table: { size: number; lineHeight: number; verticalPadding: number; horizontalPadding: number; outerBorder: number; headerBorder: number };
  code: { size: number; lineHeight: number; padding: number; background: string };
  quoteIndent: number;
  listIndent: number;
  elementGap: number;
  imageMaxHeight: number;
  runningSize: number;
}

// Millimetres for the page and images, points for type and spacing. These rules
// belong exclusively to exports; editor appearance is deliberately not read.
const defaults: ManuscriptLayout = {
  label: '默认文稿', description: '通用报告与技术文档 · 12 pt · 1.5 倍行距',
  page: { width: 210, height: 297, top: 22, right: 20, bottom: 22, left: 20, runningDistance: 10 },
  fonts: { chinese: 'SimSun', latin: 'Times New Roman', code: 'Consolas' },
  body: { size: 12, lineHeight: 1.5, after: 6, indent: 2, align: 'justify' },
  title: { size: 22, before: 6, after: 20 },
  headings: [
    { size: 17, before: 18, after: 8 }, { size: 14, before: 16, after: 6 },
    { size: 12.5, before: 12, after: 5 }, { size: 12, before: 10, after: 4 },
    { size: 12, before: 8, after: 4 }, { size: 12, before: 8, after: 4 }
  ],
  caption: { size: 10, before: 5, after: 10 },
  table: { size: 10.5, lineHeight: 1.25, verticalPadding: 4, horizontalPadding: 6, outerBorder: 1.25, headerBorder: 0.625 },
  code: { size: 9.5, lineHeight: 1.3, padding: 8, background: 'F5F6F7' },
  quoteIndent: 12, listIndent: 24, elementGap: 10, imageMaxHeight: 180, runningSize: 9
};
export const EXPORT_PRESETS: Readonly<Record<ExportPresetId, ManuscriptLayout>> = {
  manuscript: defaults,
  academic: { ...defaults, label: '学术报告', description: '论文初稿与研究报告 · 12 pt · 1.65 倍行距',
    page: { ...defaults.page, top: 25, right: 25, bottom: 25, left: 25 },
    body: { ...defaults.body, lineHeight: 1.65, after: 4 }, title: { size: 20, before: 6, after: 22 } },
  reading: { ...defaults, label: '简洁阅读', description: '日常长文与阅读打印 · 11.5 pt · 1.55 倍行距',
    page: { ...defaults.page, right: 22, left: 22 }, fonts: { ...defaults.fonts, latin: 'Georgia' },
    body: { size: 11.5, lineHeight: 1.55, after: 8, indent: 0, align: 'left' } }
};
export const exportPresetIds: readonly ExportPresetId[] = ['manuscript', 'academic', 'reading'];
export const normalizeExportPreset = (value: unknown): ExportPresetId => exportPresetIds.includes(value as ExportPresetId) ? value as ExportPresetId : 'manuscript';
export const manuscriptLayout = (preset?: ExportPresetId): ManuscriptLayout => EXPORT_PRESETS[normalizeExportPreset(preset)];
export const mmToTwips = (mm: number): number => Math.round(mm * 1440 / 25.4);
export const ptToTwips = (pt: number): number => Math.round(pt * 20);
export const contentWidth = (layout: ManuscriptLayout): number => mmToTwips(layout.page.width) - mmToTwips(layout.page.left) - mmToTwips(layout.page.right);
export const proseIndent = (node: DocumentNode, layout: ManuscriptLayout): number => /[\u2e80-\ua4cf\uf900-\ufaff]/.test(semanticText(node)) ? layout.body.indent : 0;

export function manuscriptIdentity(model: DocumentModel): { titleNode?: DocumentNode; title: string; runningTitle: string } {
  const first = model.root.children.find(n => n.kind !== 'attribute' && !(n.kind === 'raw' && n.sourceType === 'LinkReference'));
  const titleNode = first?.kind === 'heading' && first.level === 1 ? first : undefined;
  const title = semanticText(titleNode ?? model.headings.find(n => n.level === 1) ?? model.headings[0] ?? { ...model.root, children: [] }).trim().replace(/\s+/g, ' ');
  const characters = Array.from(title);
  return { titleNode, title, runningTitle: characters.length > 42 ? characters.slice(0, 41).join('') + '…' : title };
}

export function manuscriptFonts(layout: ManuscriptLayout): { css: string; family: string } {
  const ranges = { latin: 'U+0000-2E7F,U+A4D0-F8FF,U+FB00-FE2F,U+FE50-FEFF,U+1D400-1D7FF', chinese: 'U+2E80-A4CF,U+F900-FAFF,U+FE30-FE4F,U+FF00-FFEF,U+20000-323AF' };
  const families: string[] = [];
  let css = '';
  for (const [script, fonts] of [
    ['latin', [layout.fonts.latin, 'Times New Roman']],
    ['chinese', [layout.fonts.chinese, 'Noto Serif CJK SC', 'Source Han Serif SC', 'Microsoft YaHei']]
  ] as const) {
    [...new Set(fonts)].forEach((font, i) => {
      const alias = `Manuscript-${script}-${i}`; families.push(JSON.stringify(alias));
      css += `@font-face{font-family:${JSON.stringify(alias)};src:local(${JSON.stringify(font)});unicode-range:${ranges[script]};font-display:swap;}\n`;
    });
  }
  return { css, family: families.join(',') + ',serif' };
}
