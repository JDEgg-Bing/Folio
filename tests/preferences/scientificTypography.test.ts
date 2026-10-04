import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { PreferencesService, PREFERENCES_KEY } from '../../src/renderer/preferences/PreferencesService';
import { TYPOGRAPHY_PRESETS } from '../../src/renderer/preferences/typographyPresets';
import { DEFAULT_WRITING_APPEARANCE, normalizeWritingAppearance } from '../../src/renderer/preferences/WritingAppearance';
import { writingTokens } from '../../src/renderer/appearance/writingTokens';
import { writingFonts } from '../../src/renderer/appearance/writingFonts';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { documentPresentation } from '../../src/renderer/appearance/writingTheme';
import { buildDecorations } from '../../src/renderer/editor/extensions/livePreview';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('scientific typography presets', () => {
  it.each([
    ['scientific-serif', 'SimSun', 'Times New Roman', 1.45, 1200, 1.12, false],
    ['scientific-sans', 'Microsoft YaHei', 'Segoe UI', 1.4, 1280, 1.1, true]
  ] as const)('maps %s to a complete immutable appearance', (id, chineseFontFamily, latinFontFamily, lineHeight, contentWidth, headingScale, quoteBorder) => {
    const preferences = new PreferencesService(storage());
    preferences.updateWritingAppearance({ fontSize: 28, listIndent: 48, quoteIndent: 40, inlineCodeStyle: 'subtle' });
    preferences.applyTypographyPreset(id);
    expect(preferences.getSnapshot().writingAppearance).toEqual({ typographyPreset: id, chineseFontFamily, latinFontFamily, lineHeight, contentWidth, headingScale, quoteBorder,
      fontSize: 16, paragraphSpacing: 0.5, writingLayout: 'compact', listIndent: 28, quoteIndent: 20, inlineCodeStyle: 'plain' });
    expect(Object.isFrozen(TYPOGRAPHY_PRESETS[id].appearance)).toBe(true);
  });
  it('writes a preset once and publishes one coherent snapshot', () => {
    const backend = storage(), write = vi.spyOn(backend, 'setItem');
    const preferences = new PreferencesService(backend), listener = vi.fn();
    preferences.subscribe(listener);
    preferences.applyTypographyPreset('scientific-sans');
    expect(write).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
    expect(new PreferencesService(backend).getSnapshot()).toEqual(preferences.getSnapshot());
  });
  it('stores Chinese and Latin fonts independently and restores both on restart', () => {
    const backend = storage(), preferences = new PreferencesService(backend);
    preferences.updateWritingAppearance({ chineseFontFamily: 'Noto Serif CJK SC' });
    expect(preferences.getSnapshot().writingAppearance.latinFontFamily).toBe('Times New Roman');
    preferences.updateWritingAppearance({ latinFontFamily: 'Georgia' });
    expect(new PreferencesService(backend).getSnapshot().writingAppearance).toMatchObject({ chineseFontFamily: 'Noto Serif CJK SC', latinFontFamily: 'Georgia', typographyPreset: 'custom' });
  });
  it.each([['paragraphSpacing', 0.65], ['contentWidth', 1560]] as const)('persists %s with the new units and limits', (key, value) => {
    const backend = storage(), preferences = new PreferencesService(backend);
    preferences.updateWritingAppearance({ [key]: value });
    expect(new PreferencesService(backend).getSnapshot().writingAppearance[key]).toBe(value);
  });
  it.each(['compact', 'centered'] as const)('retains %s alongside custom preset typography on restart', (writingLayout) => {
    const backend = storage(), preferences = new PreferencesService(backend);
    preferences.applyTypographyPreset('scientific-sans');
    preferences.updateWritingAppearance({ writingLayout, fontSize: 18 });
    expect(new PreferencesService(backend).getSnapshot().writingAppearance).toMatchObject({ writingLayout, fontSize: 18, lineHeight: 1.4, contentWidth: 1280 });
  });
  it('keeps preset values when an individual setting changes, and stays custom across later changes', () => {
    const preferences = new PreferencesService(storage());
    preferences.applyTypographyPreset('scientific-sans');
    preferences.updateWritingAppearance({ fontSize: 19 });
    preferences.updateWritingAppearance({ paragraphSpacing: 0.4 });
    expect(preferences.getSnapshot().writingAppearance).toEqual({ ...TYPOGRAPHY_PRESETS['scientific-sans'].appearance, typographyPreset: 'custom', fontSize: 19, paragraphSpacing: 0.4 });
    preferences.applyTypographyPreset('scientific-serif');
    expect(preferences.getSnapshot().writingAppearance).toEqual(DEFAULT_WRITING_APPEARANCE);
  });
  it('retains a preset identity when an unchanged value is submitted', () => {
    const preferences = new PreferencesService(storage());
    preferences.updateWritingAppearance({ fontSize: 16 });
    expect(preferences.getSnapshot().writingAppearance.typographyPreset).toBe('scientific-serif');
  });
  it('migrates a legacy font stack and pixel gap without resetting user width or layout', () => {
    const backend = storage();
    backend.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, writingAppearance: {
      fontFamily: '"Times New Roman", "SimSun", serif', fontSize: 20, lineHeight: 1.5, paragraphSpacing: 15, contentWidth: 960, writingLayout: 'centered'
    } }));
    const preferences = new PreferencesService(backend);
    expect(preferences.getSnapshot().writingAppearance).toMatchObject({ typographyPreset: 'custom', chineseFontFamily: 'SimSun', latinFontFamily: 'Times New Roman', fontSize: 20, paragraphSpacing: 0.5, contentWidth: 960, writingLayout: 'centered' });
    preferences.updateWritingAppearance({ headingScale: 1.15 });
    expect(JSON.parse(backend.getItem(PREFERENCES_KEY)!).version).toBe(4);
    expect(new PreferencesService(backend).getSnapshot()).toEqual(preferences.getSnapshot());
  });
  it('rejects unsafe font names in both independent font settings', () => {
    for (const key of ['chineseFontFamily', 'latinFontFamily'] as const) {
      expect(normalizeWritingAppearance({ [key]: 'serif; color:red' })[key]).toBe(DEFAULT_WRITING_APPEARANCE[key]);
    }
  });
  it('routes local fonts through disjoint Unicode ranges without downloading fonts', () => {
    const fonts = writingFonts(DEFAULT_WRITING_APPEARANCE);
    expect(fonts.css).toContain('src:local("Times New Roman")');
    expect(fonts.css).toContain('src:local("SimSun")');
    expect(fonts.css).toContain('unicode-range:U+2E80-A4CF');
    expect(fonts.css).toContain('unicode-range:U+0000-2E7F');
    expect(fonts.css).not.toContain('url(');
    expect(fonts.family.indexOf('Writing-latin-0')).toBeLessThan(fonts.family.indexOf('Writing-chinese-0'));
  });
  it('converts half-line spacing to pixels and centralizes list, quote and code styling', () => {
    const tokens = writingTokens(DEFAULT_WRITING_APPEARANCE) as Record<string, unknown>;
    expect(tokens['--writing-paragraph-spacing']).toBe('11.6px');
    expect(tokens['--writing-list-indent']).toBe('28px');
    expect(tokens['--writing-quote-indent']).toBe('20px');
    expect(tokens['--writing-code-background']).toBe('transparent');
    expect(tokens['--writing-heading-1-weight']).toBe(700);
    expect(tokens['--writing-heading-1-size']).toBe('1.24em');
    expect(tokens['--writing-heading-2-size']).toBe('1.12em');
    expect(tokens['--writing-heading-3-size']).toBe('1.054em');
  });
  it('applies presentation without changing Markdown, selection or history', () => {
    const source = '# 报告\n\n正文 English `code`。\n\n1. 第一项\n2. 第二项\n\n> 引用\n\n---\n\n```\n\nsource\n```';
    const state = EditorState.create({ doc: source, extensions: createEditorExtensions(() => {}) });
    const preferences = new PreferencesService(storage());
    for (const id of ['scientific-serif', 'scientific-sans'] as const) {
      preferences.applyTypographyPreset(id);
      writingTokens(preferences.getSnapshot().writingAppearance);
      documentPresentation(state, [{ from: 0, to: source.length }]);
      buildDecorations(state, [{ from: 0, to: source.length }]);
      expect(state.doc.toString()).toBe(source);
      expect(state.selection.main.head).toBe(0);
    }
  });
  it('preserves blank lines inside fenced code and keeps an active empty line editable', () => {
    const source = 'Body\n\n```\n\ncode\n```\n\nEnd';
    const state = EditorState.create({ doc: source, selection: { anchor: 5 }, extensions: createEditorExtensions(() => {}) });
    const gaps: number[] = [], codes: number[] = [];
    documentPresentation(state, [{ from: 0, to: source.length }]).between(0, source.length, (from, _to, decoration) => {
      const line = state.doc.lineAt(from).number;
      if (decoration.spec.class.includes('cm-writing-gap')) gaps.push(line);
      if (decoration.spec.class.includes('cm-writing-code')) codes.push(line);
    });
    expect(gaps).toEqual([7]);
    expect(codes).toEqual([3, 4, 5, 6]);
  });
  it('renders inactive rules and quote markers while retaining active source-first editing', () => {
    const source = 'Body\n\n---\n\n> Quote';
    const state = EditorState.create({ doc: source, extensions: createEditorExtensions(() => {}) });
    const marks: { from: number; to: number; className?: string }[] = [];
    buildDecorations(state, [{ from: 0, to: source.length }]).between(0, source.length, (from, to, decoration) => { marks.push({ from, to, className: decoration.spec.class }); });
    expect(marks).toContainEqual({ from: 6, to: 6, className: 'cm-writing-rule' });
    expect(marks).toContainEqual({ from: 6, to: 9, className: undefined });
    expect(marks).toContainEqual({ from: 11, to: 13, className: undefined });
    const active = state.update({ selection: { anchor: 7 } }).state;
    const activeMarks: number[] = [];
    buildDecorations(active, [{ from: 0, to: source.length }]).between(0, source.length, (from) => { activeMarks.push(from); });
    expect(activeMarks).not.toContain(6);
  });
  it('hides inactive fenced language markers but leaves the active fence source intact', () => {
    const source = 'Body\n\n```text\ncode\n```';
    const state = EditorState.create({ doc: source, extensions: createEditorExtensions(() => {}) });
    const replacements = (current: EditorState) => {
      const ranges: number[][] = [];
      buildDecorations(current, [{ from: 0, to: source.length }]).between(0, source.length, (from, to) => {
        if (from !== to) ranges.push([from, to]);
      });
      return ranges;
    };
    expect(replacements(state)).toEqual([[6, 9], [9, 13], [19, 22]]);
    expect(replacements(state.update({ selection: { anchor: 8 } }).state)).toEqual([[19, 22]]);
    expect(state.doc.toString()).toBe(source);
  });
});
