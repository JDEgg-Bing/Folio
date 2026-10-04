/** Curated interface colors only. Manuscript appearance/export never receives these. */
export const ACCENT_COLORS = [
  { id: 'green', label: '苔绿', light: '#466e60', dark: '#a5c7b5' },
  { id: 'blue', label: '雾蓝', light: '#476d8c', dark: '#a4bfd5' },
  { id: 'indigo', label: '靛蓝', light: '#5b648f', dark: '#b2b9dd' },
  { id: 'purple', label: '柔紫', light: '#78618c', dark: '#c7b3d9' },
  { id: 'mauve', label: '灰紫', light: '#786a79', dark: '#c6bac8' },
  { id: 'amber', label: '琥珀', light: '#806331', dark: '#d7bf91' },
  { id: 'graphite', label: '石墨', light: '#626b70', dark: '#b9c2c7' }
] as const;

export type AccentColorId = typeof ACCENT_COLORS[number]['id'];
export const DEFAULT_ACCENT_COLOR: AccentColorId = 'green';

export function normalizeAccentColor(value: unknown): AccentColorId {
  return ACCENT_COLORS.find(color => color.id === value)?.id ?? DEFAULT_ACCENT_COLOR;
}

/** Set on :root so dialog top layers and portaled menus share the same tokens. */
export function accentTokens(id: AccentColorId): Record<string, string> {
  const color = ACCENT_COLORS.find(color => color.id === id) ?? ACCENT_COLORS[0];
  return { '--accent-light': color.light, '--accent-dark': color.dark };
}
