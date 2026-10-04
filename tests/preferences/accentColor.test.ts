import { describe, expect, it, vi } from 'vitest';
import { ACCENT_COLORS, normalizeAccentColor } from '../../src/renderer/appearance/accentColors';
import { PreferencesService, PREFERENCES_KEY } from '../../src/renderer/preferences/PreferencesService';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map(part => parseInt(part, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}

describe('controlled interface accent', () => {
  it.each(ACCENT_COLORS)('applies and restores $id without changing typography or features', color => {
    const backend = storage(), preferences = new PreferencesService(backend);
    preferences.updateWritingAppearance({ fontSize: 23 });
    preferences.updateDocumentFeatures({ outlineVisible: true });
    const before = preferences.getSnapshot(), listener = vi.fn();
    preferences.subscribe(listener);
    preferences.updateAccentColor(color.id);
    expect(listener).toHaveBeenCalledOnce();
    expect(preferences.getSnapshot().accentColor).toBe(color.id);
    expect(preferences.getSnapshot().writingAppearance).toBe(before.writingAppearance);
    expect(preferences.getSnapshot().documentFeatures).toBe(before.documentFeatures);
    preferences.applyTypographyPreset('scientific-sans');
    preferences.updateDocumentFeatures({ outlineVisible: false });
    expect(new PreferencesService(backend).getSnapshot()).toEqual(preferences.getSnapshot());
    expect(preferences.getSnapshot().accentColor).toBe(color.id);
    expect(JSON.parse(backend.getItem(PREFERENCES_KEY)!).writingAppearance).not.toHaveProperty('accentColor');
  });

  it.each([1, 2, 3])('restores v%s settings with the default brand accent', version => {
    const backend = storage();
    backend.setItem(PREFERENCES_KEY, JSON.stringify({ version, writingAppearance: { fontSize: 21 }, documentFeatures: { outlineVisible: true } }));
    expect(new PreferencesService(backend).getSnapshot()).toMatchObject({ accentColor: 'green', writingAppearance: { fontSize: 21 }, documentFeatures: { outlineVisible: true } });
  });

  it.each(['#ff0000', 'rgb(0,255,0)', 'unknown', null, {}, 7])('rejects arbitrary stored color %s', value => {
    expect(normalizeAccentColor(value)).toBe('green');
    const backend = storage();
    backend.setItem(PREFERENCES_KEY, JSON.stringify({ version: 4, writingAppearance: {}, accentColor: value }));
    expect(new PreferencesService(backend).getSnapshot().accentColor).toBe('green');
  });

  it('keeps a failed write effective in memory and retries without losing typography', () => {
    const backend = storage(), preferences = new PreferencesService(backend);
    preferences.updateWritingAppearance({ fontSize: 22 });
    vi.spyOn(backend, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    preferences.updateAccentColor('blue');
    expect(preferences.getSnapshot()).toMatchObject({ accentColor: 'blue', writingAppearance: { fontSize: 22 } });
    expect(preferences.getSnapshot().persistenceError).toBeTruthy();
    preferences.updateAccentColor('blue');
    expect(preferences.getSnapshot().persistenceError).toBeNull();
    expect(new PreferencesService(backend).getSnapshot().accentColor).toBe('blue');
  });

  it.each(ACCENT_COLORS)('maintains readable $id text and filled controls in both modes', color => {
    for (const surface of ['#faf9f6', '#f2f2ee', '#fffefa']) expect(contrast(color.light, surface)).toBeGreaterThanOrEqual(4.5);
    for (const surface of ['#232625', '#292d2b', '#2d312f']) expect(contrast(color.dark, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.light, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.dark, '#232625')).toBeGreaterThanOrEqual(4.5);
  });
});
