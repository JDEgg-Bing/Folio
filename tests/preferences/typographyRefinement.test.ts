import { readFileSync } from 'node:fs';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { documentPresentation } from '../../src/renderer/appearance/writingTheme';
import { buildDocumentPreview, documentPreviewField } from '../../src/renderer/editor/extensions/documentPreview';
import { writingTokens } from '../../src/renderer/appearance/writingTokens';
import { TYPOGRAPHY_PRESETS } from '../../src/renderer/preferences/typographyPresets';
import { navigationBottomPadding, NAVIGATION_TOP_MARGIN } from '../../src/renderer/editor/navigationLayout';
import { parsedState } from '../editor/parsedState';

const css = readFileSync('src/renderer/styles/app.css', 'utf8');
function layout(source: string, from = 0, to = source.length) {
  const state = parsedState(EditorState.create({ doc: source, extensions: [createEditorExtensions(() => {}), documentPreviewField] }));
  const indents: number[] = [];
  documentPresentation(state, [{ from, to }]).between(0, source.length, (position, _end, decoration) => {
    if (decoration.spec.class.includes('cm-writing-paragraph')) indents.push(position);
  });
  return { state, indents };
}
describe('document typography refinement', () => {
  it('indents Chinese and mixed prose once per paragraph, including active prose', () => {
    const source = '中文正文 English $x$ **粗体**。\n续行不再缩进。\n\nEnglish 中文 paragraph.';
    expect(layout(source).indents).toEqual([0, source.indexOf('English 中文')]);
  });
  it('does not re-indent a paragraph continuation entering the viewport', () => {
    const source = '正文第一行\n正文续行';
    expect(layout(source, source.indexOf('正文续行')).indents).toEqual([0]);
  });
  it.each([
    '# 标题', '标题\n====', '- 列表\n  续行\n\n  列表内段落', '1. 列表', '> 引用\n>\n> 第二段',
    '$$\nx^2\n$$', '\\[\nx^2\n\\]', '$x^2$', '```ts\nconst x = 1\n```', '    code',
    '| A | B |\n| --- | --- |\n| 1 | 2 |', '![图](image.png){#fig:test}', '{#tbl:test}', '---'
  ])('excludes non-prose blocks: %s', source => { expect(layout(source).indents).toEqual([]); });
  it.each(['scientific-serif', 'scientific-sans'] as const)('shares the %s font stack with outline', preset => {
    const tokens = writingTokens(TYPOGRAPHY_PRESETS[preset].appearance) as Record<string, unknown>;
    expect(tokens['--writing-font-family']).toBeTruthy();
    expect(css.match(/\.document-outline \{[^}]+\}/)?.[0]).toContain('font: 12px/1.4 var(--writing-font-family)');
    expect(css.match(/\.outline-item \{[^}]+\}/)?.[0]).toContain('font: inherit');
  });
  it('provides enough space for a final heading at the navigation top margin', () => {
    const viewport = 700, remaining = 28;
    const padding = navigationBottomPadding(viewport, remaining, 16);
    expect(remaining + padding + NAVIGATION_TOP_MARGIN).toBe(viewport);
    expect(navigationBottomPadding(viewport, 1000, 16)).toBe(16);
    expect(navigationBottomPadding(420, remaining, 16)).toBe(376);
  });
  it('renders tables under the three-line rules without row or vertical borders', () => {
    const source = '正文\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
    const { state } = layout(source);
    const classes: string[] = [];
    buildDocumentPreview(state).between(0, source.length, (_from, _to, decoration) => {
      const widget = decoration.spec.widget;
      if (widget?.node?.kind === 'table') classes.push(widget.node.kind);
    });
    expect(classes).toEqual(['table']);
    expect(css.match(/\.document-table \{[^}]+\}/)?.[0]).toMatch(/border-top: 1.5px.*border-bottom: 1.5px/);
    expect(css.match(/\.document-table th, \.document-table td \{[^}]+\}/)?.[0]).toContain('border: 0');
    expect(css.match(/\.document-table th \{[^}]+\}/)?.[0]).toContain('border-bottom: 1px');
  });
  it('keeps Markdown and selection intact through all display decorations', () => {
    const source = readFileSync('manual-tests/long-document.md', 'utf8');
    const { state } = layout(source);
    buildDocumentPreview(state);
    expect(state.doc.toString()).toBe(source.replace(/\r\n?/g, '\n'));
    expect(state.selection.main.head).toBe(0);
  });
});
