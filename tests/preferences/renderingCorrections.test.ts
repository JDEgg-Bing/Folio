import { readFileSync } from 'node:fs';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { documentPresentation } from '../../src/renderer/appearance/writingTheme';
import { buildDecorations } from '../../src/renderer/editor/extensions/livePreview';
import { writingTokens } from '../../src/renderer/appearance/writingTokens';
import { DEFAULT_WRITING_APPEARANCE } from '../../src/renderer/preferences/WritingAppearance';
import { ReadingTracker } from '../../src/renderer/editor/ReadingTracker';
import { currentHeading } from '../../src/renderer/ui/DocumentOutline';
import { statusBarContent } from '../../src/renderer/ui/StatusBar';
import { resolveDocumentTitle } from '../../src/renderer/document/DocumentTitle';
import { modelFor } from '../document/helpers';

describe('rendering and reading state corrections', () => {
  it('styles inactive quote lines and keeps the active line source-first', () => {
    const source = '正文\n\n> 引用第一行\n> 引用第二行';
    const state = EditorState.create({ doc: source, selection: { anchor: source.indexOf('引用第二行') }, extensions: createEditorExtensions(() => {}) });
    const lines = new Map<number, string>();
    documentPresentation(state, [{ from: 0, to: source.length }]).between(0, source.length, (from, _to, decoration) => { lines.set(state.doc.lineAt(from).number, decoration.spec.class); });
    expect(lines.get(3)).toBe('cm-writing-quote');
    expect(lines.get(4)).toBe('cm-writing-quote cm-writing-quote-active');
    const hidden: number[] = [];
    buildDecorations(state, [{ from: 0, to: source.length }]).between(0, source.length, (from, to) => { if (to > from) hidden.push(from); });
    expect(hidden).toContain(source.indexOf('>'));
    expect(hidden).not.toContain(source.lastIndexOf('>'));
    const tokens = writingTokens(DEFAULT_WRITING_APPEARANCE) as Record<string, unknown>;
    expect(tokens['--writing-quote-preview-border']).toContain('1px solid');
    expect(tokens['--writing-quote-preview-color']).toContain('78%');
    expect(state.doc.toString()).toBe(source);
  });
  it('centralizes justification in paragraph typography with first-line indent and natural last line', () => {
    const tokens = writingTokens(DEFAULT_WRITING_APPEARANCE) as Record<string, unknown>;
    expect(tokens['--writing-paragraph-align']).toBe('justify');
    const theme = readFileSync('src/renderer/appearance/writingTheme.ts', 'utf8');
    expect(theme).toContain("textIndent: '2em', textAlign: 'var(--writing-paragraph-align)', textAlignLast: 'start', textJustify: 'auto'");
  });
  it.each(['# 标题', '- 列表', '> 引用', '```\n代码\n```', '$$x$$', '| A |\n| --- |\n| B |', '![图](a.png){#fig:a}'])('does not justify non-prose: %s', source => {
    const state = EditorState.create({ doc: source, extensions: createEditorExtensions(() => {}) });
    const prose: number[] = [];
    documentPresentation(state, [{ from: 0, to: source.length }]).between(0, source.length, (from, _to, decoration) => { if (decoration.spec.class.includes('cm-writing-paragraph')) prose.push(from); });
    expect(prose).toEqual([]);
  });
  it.each([
    ['报告标题', 'paper.md', 'handle', '报告标题'],
    [null, 'paper.md', 'handle', 'paper.md'],
    ['报告标题', 'Untitled', null, '报告标题'],
    [null, 'Untitled', null, '未命名文档']
  ])('shares document title for status and window: %s / %s', (headingTitle, displayName, fileHandleId, expected) => {
    const metadata = { displayName: displayName!, fileHandleId, dirty: true };
    const snapshot = { headingTitle, wordCount: 3, line: 1, column: 1 };
    expect(statusBarContent(metadata, snapshot).name).toBe(resolveDocumentTitle(headingTitle, metadata));
    expect(statusBarContent(metadata, snapshot)).toMatchObject({ name: expected, saved: '已修改' });
  });
  it('retains a final outline click across programmatic scroll and measurements', () => {
    const model = modelFor('# 开始\n\n## 5.2 长段落排版测试\n\n内容\n\n## 6. 最终结论');
    const tracker = new ReadingTracker(), target = model.headings.at(-1)!;
    expect(currentHeading(model.headings, tracker.jump(target.from))).toBe(target.id);
    expect(currentHeading(model.headings, tracker.position(target.from - 2))).toBe(target.id);
    expect(currentHeading(model.headings, tracker.position(0))).toBe(target.id);
  });
  it('returns to scroll spy after user navigation and handles successive jumps', () => {
    const tracker = new ReadingTracker();
    tracker.jump(500); tracker.jump(700);
    expect(tracker.position(450)).toBe(700);
    tracker.userMoved();
    expect(tracker.position(450)).toBe(450);
    expect(tracker.position(800)).toBe(800);
  });
});
