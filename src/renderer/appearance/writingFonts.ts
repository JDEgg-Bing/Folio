import type { WritingAppearance } from '../preferences/WritingAppearance';

const ranges = {
  chinese: 'U+2E80-A4CF,U+F900-FAFF,U+FE30-FE4F,U+FF00-FFEF,U+20000-323AF',
  latin: 'U+0000-2E7F,U+A4D0-F8FF,U+FB00-FE2F,U+FE50-FEFF,U+1D400-1D7FF'
};

function fontNames(value: string): string[] {
  return value.split(',').map((name) => name.trim().replace(/^["']|["']$/g, ''))
    .filter((name) => name && !/^(serif|sans-serif|monospace)$/i.test(name));
}

export async function fontWarnings(appearance: Readonly<WritingAppearance>): Promise<string[]> {
  const messages: string[] = [];
  for (const [label, requested, fallback] of [
    ['中文', fontNames(appearance.chineseFontFamily), ['SimSun', 'Microsoft YaHei', 'Noto Sans CJK SC']],
    ['英文', fontNames(appearance.latinFontFamily), ['Times New Roman', 'Segoe UI', 'Arial']]
  ] as const) {
    const available = async (name: string) => {
      try { await new FontFace('Folio-font-check', `local(${JSON.stringify(name)})`).load(); return true; }
      catch { return false; }
    };
    let resolved: string | null = null;
    for (const name of [...new Set([...requested, ...fallback])]) if (await available(name)) { resolved = name; break; }
    if (requested[0] && resolved !== requested[0]) messages.push(`${label}字体“${requested[0]}”不可用，当前回退为 ${resolved ?? '系统默认字体'}`);
  }
  return messages;
}

export function writingFonts(appearance: Readonly<WritingAppearance>): { css: string; family: string } {
  let css = '';
  const aliases: string[] = [];
  for (const [script, fonts] of [
    ['latin', [...fontNames(appearance.latinFontFamily), 'Times New Roman', 'Segoe UI', 'Arial']],
    ['chinese', [...fontNames(appearance.chineseFontFamily), 'SimSun', 'Microsoft YaHei', 'Noto Sans CJK SC']]
  ] as const) {
    [...new Set(fonts)].forEach((font, index) => {
      const alias = `Writing-${script}-${index}`;
      aliases.push(JSON.stringify(alias));
      css += `@font-face{font-family:${JSON.stringify(alias)};src:local(${JSON.stringify(font)});unicode-range:${ranges[script]};font-display:swap;}\n`;
    });
  }
  return { css, family: `${aliases.join(', ')}, serif` };
}
