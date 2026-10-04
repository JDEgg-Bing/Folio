import type { WritingAppearance } from './WritingAppearance';

export type TypographyPresetId = 'scientific-serif' | 'scientific-sans';

export const TYPOGRAPHY_PRESETS: Readonly<Record<TypographyPresetId, {
  label: string; appearance: Readonly<WritingAppearance>;
}>> = Object.freeze({
  'scientific-serif': Object.freeze({
    label: '经典 · 衬线字体',
    appearance: Object.freeze({
      typographyPreset: 'scientific-serif', chineseFontFamily: 'SimSun', latinFontFamily: 'Times New Roman',
      fontSize: 16, lineHeight: 1.45, paragraphSpacing: 0.5, contentWidth: 1200, headingScale: 1.12,
      writingLayout: 'compact', listIndent: 28, quoteIndent: 20, quoteBorder: false, inlineCodeStyle: 'plain'
    })
  }),
  'scientific-sans': Object.freeze({
    label: '简洁 · 无衬线字体',
    appearance: Object.freeze({
      typographyPreset: 'scientific-sans', chineseFontFamily: 'Microsoft YaHei', latinFontFamily: 'Segoe UI',
      fontSize: 16, lineHeight: 1.4, paragraphSpacing: 0.5, contentWidth: 1280, headingScale: 1.1,
      writingLayout: 'compact', listIndent: 28, quoteIndent: 20, quoteBorder: true, inlineCodeStyle: 'plain'
    })
  })
});

export function migrateLegacyAppearance(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const families = typeof input.fontFamily === 'string' ? input.fontFamily.split(',').map((font) => font.trim().replace(/^["']|["']$/g, '')) : [];
  const chinese = families.find((font) => /YaHei|SimSun|宋|黑|CJK|Source Han|PingFang/i.test(font));
  const latin = families.find((font) => !/YaHei|SimSun|宋|黑|CJK|Source Han|PingFang|^(sans-serif|serif|monospace)$/i.test(font));
  const fontSize = typeof input.fontSize === 'number' && input.fontSize > 0 ? input.fontSize : 16;
  const lineHeight = typeof input.lineHeight === 'number' && input.lineHeight > 0 ? input.lineHeight : 1.55;
  return {
    ...input, typographyPreset: 'custom',
    chineseFontFamily: chinese ?? 'SimSun', latinFontFamily: latin ?? 'Times New Roman',
    paragraphSpacing: typeof input.paragraphSpacing === 'number' ? input.paragraphSpacing / (fontSize * lineHeight) : 0.5
  };
}
