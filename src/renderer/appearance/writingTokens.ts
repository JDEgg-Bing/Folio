import type { CSSProperties } from 'react';
import type { WritingAppearance } from '../preferences/WritingAppearance';
import { writingFonts } from './writingFonts';

// H1–H6: small size differences, moderate weights, progressively tighter spacing.
const headingLevels = [
  { sizeFactor: 2, weight: 700, before: 0.35, after: 0.15 },
  { sizeFactor: 1, weight: 650, before: 0.3, after: 0.12 },
  { sizeFactor: 0.45, weight: 620, before: 0.22, after: 0.08 },
  { sizeFactor: 0.15, weight: 600, before: 0.16, after: 0.06 },
  { sizeFactor: 0.05, weight: 580, before: 0.12, after: 0.04 },
  { sizeFactor: 0, weight: 560, before: 0.08, after: 0.02 }
] as const;

export function writingTokens(appearance: Readonly<WritingAppearance>): CSSProperties {
  const tokens: Record<string, string | number> = {
    '--writing-chinese-font-family': appearance.chineseFontFamily,
    '--writing-latin-font-family': appearance.latinFontFamily,
    '--writing-font-family': writingFonts(appearance).family,
    '--document-caption-size': '0.9em',
    '--document-table-cell-padding': '0.2em 0.45em',
    '--writing-font-size': `${appearance.fontSize}px`,
    '--writing-line-height': appearance.lineHeight,
    '--writing-content-width': `${appearance.contentWidth}px`,
    '--writing-paragraph-spacing': `${Number((appearance.paragraphSpacing * appearance.fontSize * appearance.lineHeight).toFixed(2))}px`,
    '--writing-paragraph-align': 'justify',
    '--writing-quote-preview-border': '1px solid color-mix(in srgb, var(--text) 20%, transparent)',
    '--writing-quote-preview-color': 'color-mix(in srgb, var(--text) 78%, var(--bg))',
    '--writing-heading-scale': appearance.headingScale,
    '--writing-page-gutter': '24px',
    '--writing-page-block-padding': '16px',
    '--writing-content-margin-start': appearance.writingLayout === 'centered' ? 'auto' : '0px',
    '--writing-heading-line-height': 1.25,
    '--writing-strong-weight': 600,
    '--writing-code-font-size': '0.95em',
    '--writing-code-font-family': `"Cascadia Code", Consolas, ${writingFonts(appearance).family}`,
    '--writing-code-background': appearance.inlineCodeStyle === 'subtle' ? 'color-mix(in srgb, var(--text) 3%, transparent)' : 'transparent',
    '--writing-list-indent': `${appearance.listIndent}px`,
    '--writing-quote-indent': `${appearance.quoteIndent}px`,
    '--writing-quote-border': appearance.quoteBorder ? '1px solid var(--border)' : '0px solid transparent',
    '--writing-rule-color': 'color-mix(in srgb, var(--text) 20%, transparent)'
  };
  headingLevels.forEach((heading, index) => {
    const prefix = `--writing-heading-${index + 1}`;
    tokens[`${prefix}-size`] = `${Number((1 + (appearance.headingScale - 1) * heading.sizeFactor).toFixed(3))}em`;
    tokens[`${prefix}-weight`] = heading.weight;
    tokens[`${prefix}-before`] = `${appearance.fontSize * heading.before}px`;
    tokens[`${prefix}-after`] = `${appearance.fontSize * heading.after}px`;
  });
  return tokens as CSSProperties;
}
