import { describe, expect, it } from 'vitest';
import { PreferencesService, PREFERENCES_KEY } from '../../src/renderer/preferences/PreferencesService';
import { DEFAULT_WRITING_APPEARANCE, normalizeWritingAppearance } from '../../src/renderer/preferences/WritingAppearance';
import { writingTokens } from '../../src/renderer/appearance/writingTokens';

describe('writing layout and restrained typography', () => {
  it.each(['compact', 'centered'] as const)('persists and restores %s layout', (writingLayout) => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const preferences = new PreferencesService(storage);
    preferences.updateWritingAppearance({ writingLayout });
    expect(preferences.getSnapshot().writingAppearance.writingLayout).toBe(writingLayout);
    expect(new PreferencesService(storage).getSnapshot().writingAppearance.writingLayout).toBe(writingLayout);
  });
  it('uses Compact for new preferences and legacy persisted settings', () => {
    const old = JSON.stringify({ version: 1, writingAppearance: { fontSize: 19, contentWidth: 960 } });
    const preferences = new PreferencesService({ getItem: (key) => key === PREFERENCES_KEY ? old : null, setItem: () => {} });
    expect(preferences.getSnapshot().writingAppearance).toMatchObject({ writingLayout: 'compact', fontSize: 19, contentWidth: 960 });
  });
  it('falls back to Compact for invalid layout values', () => {
    for (const writingLayout of ['wide', null, 1, {}]) {
      expect(normalizeWritingAppearance({ writingLayout }).writingLayout).toBe('compact');
    }
  });
  it('generates fixed Compact start margin and automatic Centered start margin with the same width', () => {
    const compact = writingTokens(DEFAULT_WRITING_APPEARANCE) as Record<string, unknown>;
    const centered = writingTokens({ ...DEFAULT_WRITING_APPEARANCE, writingLayout: 'centered' }) as Record<string, unknown>;
    expect(compact['--writing-content-margin-start']).toBe('0px');
    expect(centered['--writing-content-margin-start']).toBe('auto');
    expect(compact['--writing-content-width']).toBe(centered['--writing-content-width']);
    expect(compact['--writing-page-gutter']).toBe('24px');
  });
  it('keeps heading sizes restrained at default and maximum scale, with decreasing weights and spacing', () => {
    for (const headingScale of [1.18, 1.35]) {
      const tokens = writingTokens({ ...DEFAULT_WRITING_APPEARANCE, headingScale }) as Record<string, unknown>;
      const sizes = Array.from({ length: 6 }, (_, i) => parseFloat(String(tokens[`--writing-heading-${i + 1}-size`])));
      expect(sizes[0]).toBeLessThanOrEqual(1.7);
      expect(sizes[2]).toBeLessThanOrEqual(1.28);
      expect(sizes[5]).toBe(1);
      for (let i = 1; i < 6; i++) {
        expect(sizes[i]).toBeLessThan(sizes[i - 1]);
        expect(Number(tokens[`--writing-heading-${i + 1}-weight`])).toBeLessThan(Number(tokens[`--writing-heading-${i}-weight`]));
        expect(parseFloat(String(tokens[`--writing-heading-${i + 1}-before`]))).toBeLessThan(parseFloat(String(tokens[`--writing-heading-${i}-before`])));
      }
    }
  });
});
