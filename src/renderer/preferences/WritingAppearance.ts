import { TYPOGRAPHY_PRESETS, type TypographyPresetId } from './typographyPresets';

export interface WritingAppearance {
  typographyPreset: TypographyPresetId | 'custom';
  writingLayout: 'compact' | 'centered';
  chineseFontFamily: string;
  latinFontFamily: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  /** Gap between paragraphs, in body line units. */
  paragraphSpacing: number;
  /** Controls a restrained linear heading hierarchy; h6 stays at body size. */
  headingScale: number;
  listIndent: number;
  quoteIndent: number;
  quoteBorder: boolean;
  inlineCodeStyle: 'plain' | 'subtle';
}

export const DEFAULT_WRITING_APPEARANCE = TYPOGRAPHY_PRESETS['scientific-serif'].appearance;

export const APPEARANCE_LIMITS = Object.freeze({
  fontSize: { min: 12, max: 32, step: 1 },
  lineHeight: { min: 1.2, max: 2.4, step: 0.05 },
  contentWidth: { min: 360, max: 1800, step: 20 },
  paragraphSpacing: { min: 0, max: 2, step: 0.05 },
  headingScale: { min: 1, max: 1.35, step: 0.01 },
  listIndent: { min: 12, max: 64, step: 2 },
  quoteIndent: { min: 8, max: 48, step: 2 }
});

export type NumericAppearanceKey = keyof typeof APPEARANCE_LIMITS;

export function normalizeWritingAppearance(value: unknown): WritingAppearance {
  const result = { ...DEFAULT_WRITING_APPEARANCE };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const input = value as Record<string, unknown>;
  if (input.writingLayout === 'compact' || input.writingLayout === 'centered') result.writingLayout = input.writingLayout;
  for (const key of ['chineseFontFamily', 'latinFontFamily'] as const) {
    if (typeof input[key] !== 'string') continue;
    const family = input[key].trim();
    // Accept font names and CSS font stacks, not CSS rules/functions or control characters.
    if (family.length > 0 && family.length <= 200 && !/[;{}()\\\x00-\x1f\x7f]/.test(family)) result[key] = family;
  }
  for (const key of Object.keys(APPEARANCE_LIMITS) as NumericAppearanceKey[]) {
    const number = input[key];
    const { min, max } = APPEARANCE_LIMITS[key];
    if (typeof number === 'number' && Number.isFinite(number)) {
      result[key] = Math.round(Math.min(max, Math.max(min, number)) * 100) / 100;
    }
  }
  if (typeof input.quoteBorder === 'boolean') result.quoteBorder = input.quoteBorder;
  if (input.inlineCodeStyle === 'plain' || input.inlineCodeStyle === 'subtle') result.inlineCodeStyle = input.inlineCodeStyle;
  const preset = input.typographyPreset;
  if (preset === 'scientific-serif' || preset === 'scientific-sans') {
    const expected = TYPOGRAPHY_PRESETS[preset].appearance;
    result.typographyPreset = (Object.keys(expected) as (keyof WritingAppearance)[])
      .every((key) => key === 'typographyPreset' || result[key] === expected[key]) ? preset : 'custom';
  } else if (Object.keys(input).length > 0) result.typographyPreset = 'custom';
  return result;
}
