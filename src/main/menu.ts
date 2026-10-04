import type { MenuItemConstructorOptions } from 'electron';
import type { DocumentFeatures } from '../renderer/preferences/DocumentFeatures';
import { APP_MENUS, type MenuEntry } from '../shared/appMenu';
export function menuTemplate(send: (command: string) => void, features: DocumentFeatures): MenuItemConstructorOptions[] {
  const convert = (entry: MenuEntry): MenuItemConstructorOptions => {
    if (entry.kind === 'separator') return { type: 'separator' };
    const base = { id: entry.id, label: entry.label, accelerator: entry.accelerator };
    if (entry.children) return { ...base, submenu: entry.children.map(convert) };
    if (entry.role) return { ...base, role: entry.role };
    return { ...base, ...(entry.feature ? { type: 'checkbox' as const, checked: features[entry.feature] } : {}), click: () => send(entry.id) };
  };
  return APP_MENUS.map(menu => ({ label: menu.label, submenu: menu.entries.map(convert) }));
}
