import { describe, expect, it, vi } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { undo, redo } from '@codemirror/commands';
import { PreferencesService, PREFERENCES_KEY, type PreferencesStorage } from '../../src/renderer/preferences/PreferencesService';
import { APPEARANCE_LIMITS, DEFAULT_WRITING_APPEARANCE, normalizeWritingAppearance, type NumericAppearanceKey } from '../../src/renderer/preferences/WritingAppearance';
import { writingTokens } from '../../src/renderer/appearance/writingTokens';
import { documentPresentation } from '../../src/renderer/appearance/writingTheme';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { SavedDocumentTracker } from '../../src/renderer/editor/EditorController';

function memoryStorage(): PreferencesStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('writing appearance preferences', () => {
  it('loads default appearance with no stored preferences', () => {
    expect(new PreferencesService(memoryStorage()).getSnapshot().writingAppearance).toEqual(DEFAULT_WRITING_APPEARANCE);
  });

  it.each([['fontSize', 20], ['lineHeight', 1.8], ['contentWidth', 960], ['paragraphSpacing', 0.75], ['headingScale', 1.25]] as const)(
    'updates %s immediately and notifies subscribers', (key, value) => {
      const preferences = new PreferencesService(memoryStorage());
      const listener = vi.fn();
      preferences.subscribe(listener);
      preferences.updateWritingAppearance({ [key]: value });
      expect(preferences.getSnapshot().writingAppearance[key]).toBe(value);
      expect(listener).toHaveBeenCalledOnce();
    }
  );

  it('updates a Chinese font stack', () => {
    const preferences = new PreferencesService(memoryStorage());
    preferences.updateWritingAppearance({ chineseFontFamily: '"宋体", serif' });
    expect(preferences.getSnapshot().writingAppearance.chineseFontFamily).toBe('"宋体", serif');
  });

  it('persists a versioned preferences object separately', () => {
    const storage = memoryStorage();
    const preferences = new PreferencesService(storage);
    preferences.updateWritingAppearance({ fontSize: 22 });
    expect(JSON.parse(storage.getItem(PREFERENCES_KEY)!)).toEqual({ version: 4, accentColor: 'green', documentFeatures: preferences.getSnapshot().documentFeatures, writingAppearance: { ...DEFAULT_WRITING_APPEARANCE, typographyPreset: 'custom', fontSize: 22 } });
  });

  it('restores all parameters when the service is recreated', () => {
    const storage = memoryStorage();
    const preferences = new PreferencesService(storage);
    preferences.updateWritingAppearance({ chineseFontFamily: 'Georgia, serif', fontSize: 21, lineHeight: 1.7, contentWidth: 940, paragraphSpacing: 0.8, headingScale: 1.24 });
    expect(new PreferencesService(storage).getSnapshot()).toEqual(preferences.getSnapshot());
  });

  it.each(Object.keys(APPEARANCE_LIMITS) as NumericAppearanceKey[])('clamps both bounds of %s', (key) => {
    const preferences = new PreferencesService(memoryStorage());
    preferences.updateWritingAppearance({ [key]: -100 });
    expect(preferences.getSnapshot().writingAppearance[key]).toBe(APPEARANCE_LIMITS[key].min);
    preferences.updateWritingAppearance({ [key]: 10000 });
    expect(preferences.getSnapshot().writingAppearance[key]).toBe(APPEARANCE_LIMITS[key].max);
  });

  it('falls back for invalid numeric values and unsafe font strings', () => {
    for (const value of [NaN, Infinity, -Infinity, null, '20']) {
      expect(normalizeWritingAppearance({ fontSize: value }).fontSize).toBe(DEFAULT_WRITING_APPEARANCE.fontSize);
    }
    for (const value of ['', '   ', 'serif; color:red', 'var(--font)', 'a'.repeat(201), '\nserif\n;']) {
      expect(normalizeWritingAppearance({ chineseFontFamily: value }).chineseFontFamily).toBe(DEFAULT_WRITING_APPEARANCE.chineseFontFamily);
    }
  });

  it('normalizes corrupt stored values and ignores unknown versions', () => {
    const storage = memoryStorage();
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 2, writingAppearance: { fontSize: 1000, lineHeight: 'invalid' } }));
    expect(new PreferencesService(storage).getSnapshot().writingAppearance).toEqual({ ...DEFAULT_WRITING_APPEARANCE, typographyPreset: 'custom', fontSize: 32 });
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 99, writingAppearance: { fontSize: 22 } }));
    expect(new PreferencesService(storage).getSnapshot().writingAppearance).toEqual(DEFAULT_WRITING_APPEARANCE);
    storage.setItem(PREFERENCES_KEY, '{broken');
    expect(new PreferencesService(storage).getSnapshot().writingAppearance).toEqual(DEFAULT_WRITING_APPEARANCE);
  });

  it('reports storage failure, applies changes in memory and can retry', () => {
    const storage = memoryStorage();
    const write = vi.spyOn(storage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    const preferences = new PreferencesService(storage);
    preferences.updateWritingAppearance({ fontSize: 23 });
    expect(preferences.getSnapshot().writingAppearance.fontSize).toBe(23);
    expect(preferences.getSnapshot().persistenceError).toBeTruthy();
    preferences.updateWritingAppearance({ lineHeight: 1.8 });
    expect(preferences.getSnapshot().persistenceError).toBeNull();
    expect(write).toHaveBeenCalledTimes(2);
    expect(new PreferencesService(storage).getSnapshot().writingAppearance.fontSize).toBe(23);
  });

  it('falls back when reading storage throws', () => {
    const preferences = new PreferencesService({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} });
    expect(preferences.getSnapshot().writingAppearance).toEqual(DEFAULT_WRITING_APPEARANCE);
    expect(preferences.getSnapshot().persistenceError).toBeTruthy();
  });

  it('provides stable immutable snapshots and supports unsubscribe', () => {
    const preferences = new PreferencesService(memoryStorage());
    const snapshot = preferences.getSnapshot();
    expect(preferences.getSnapshot()).toBe(snapshot);
    expect(Object.isFrozen(snapshot.writingAppearance)).toBe(true);
    const listener = vi.fn();
    const unsubscribe = preferences.subscribe(listener);
    unsubscribe();
    preferences.updateWritingAppearance({ fontSize: 18 });
    expect(listener).not.toHaveBeenCalled();
    expect(snapshot.writingAppearance.fontSize).toBe(DEFAULT_WRITING_APPEARANCE.fontSize);
  });

  it('generates all writing tokens and heading sizes from the current preferences', () => {
    const preferences = new PreferencesService(memoryStorage());
    preferences.updateWritingAppearance({ fontSize: 20, lineHeight: 1.8, contentWidth: 900, paragraphSpacing: 0.5, headingScale: 1.2 });
    expect(writingTokens(preferences.getSnapshot().writingAppearance)).toMatchObject({
      '--writing-chinese-font-family': DEFAULT_WRITING_APPEARANCE.chineseFontFamily,
      '--writing-font-size': '20px', '--writing-line-height': 1.8,
      '--writing-content-width': '900px', '--writing-paragraph-spacing': '18px',
      '--writing-heading-scale': 1.2, '--writing-heading-1-size': `${1 + (1.2 - 1) * 2}em`, '--writing-heading-6-size': '1em'
    });
  });

  it('does not alter Markdown, selection, dirty tracking, save snapshots or undo/redo', () => {
    const source = '# 中文标题\n\n研究 **内容**\n第二行\n';
    let state = EditorState.create({ doc: source, selection: EditorSelection.cursor(3), extensions: createEditorExtensions(() => {}) });
    const saved = new SavedDocumentTracker(state.doc);
    state = state.update({ changes: { from: state.doc.length, insert: '新增' } }).state;
    const before = state;
    const preferences = new PreferencesService(memoryStorage());
    preferences.updateWritingAppearance({ writingLayout: 'centered', fontSize: 24, lineHeight: 2, contentWidth: 1000, chineseFontFamily: 'serif', paragraphSpacing: 0.6, headingScale: 1.3 });
    writingTokens(preferences.getSnapshot().writingAppearance);
    expect(state).toBe(before);
    expect(state.doc.toString()).toBe(source + '新增');
    expect(state.selection.main.head).toBe(3);
    expect(saved.isDirty(state.doc)).toBe(true);
    expect(saved.captureSaveSnapshot(state.doc).text).toBe(source + '新增');
    const target = { get state() { return state; }, dispatch: (transaction: import('@codemirror/state').Transaction) => { state = transaction.state; } };
    expect(undo(target)).toBe(true);
    expect(state.doc.toString()).toBe(source);
    expect(redo(target)).toBe(true);
    expect(state.doc.toString()).toBe(source + '新增');
  });

  it('compresses source blank lines while preserving code lines and Markdown source', () => {
    const source = '# Title\n\nFirst\ncontinued\n\n- item\n\n```\ncode\n```\n\nLast';
    const state = EditorState.create({ doc: source, extensions: createEditorExtensions(() => {}) });
    const lines: number[] = [];
    documentPresentation(state, [{ from: 0, to: state.doc.length }]).between(0, state.doc.length, (from, _to, decoration) => { if (decoration.spec.class.includes('cm-writing-gap')) lines.push(state.doc.lineAt(from).number); });
    expect(lines).toEqual([2, 5, 7, 11]);
    expect(state.doc.toString()).toBe(source);
  });
});
