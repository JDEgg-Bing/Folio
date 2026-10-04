import { describe, expect, it, vi } from 'vitest';
import { APP_MENUS, MENU_COMMAND_IDS, menuActions } from '../../src/shared/appMenu';
import { menuTemplate } from '../../src/main/menu';
import { normalizeDocumentFeatures } from '../../src/renderer/preferences/DocumentFeatures';
import type { MenuItemConstructorOptions } from 'electron';

function leaves(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap(item => Array.isArray(item.submenu) ? leaves(item.submenu) : item.type === 'separator' ? [] : [item]);
}

describe('desktop menu compatibility', () => {
  it('keeps writing commands and help while excluding destructive developer commands', () => {
    const actions = APP_MENUS.flatMap(menu => menuActions(menu.entries));
    expect(actions.map(action => action.id).sort()).toEqual([
      'new', 'open', 'save', 'save-as', 'export-pdf', 'export-docx', 'word-templates', 'find', 'appearance', 'help', 'sample', 'feedback', 'about',
      'toggle:outlineVisible', 'toggle:mathPreview', 'toggle:imagePreview', 'toggle:tablePreview', 'toggle:referencePreview',
      ...['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'quit', 'resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen'].map(role => `role:${role}`)
    ].sort());
    expect(MENU_COMMAND_IDS.size).toBe(actions.length);
    const native = leaves(menuTemplate(vi.fn(), normalizeDocumentFeatures(null)));
    expect(native.map(item => item.id).sort()).toEqual(actions.map(action => action.id).sort());
    expect(native.find(item => item.id === 'save')?.accelerator).toBe('CmdOrCtrl+S');
    expect(native.find(item => item.id === 'export-pdf')?.accelerator).toBe('CmdOrCtrl+Shift+E');
    expect(native.find(item => item.id === 'role:undo')?.role).toBe('undo');
    expect(MENU_COMMAND_IDS.has('preview')).toBe(false);
    expect(MENU_COMMAND_IDS.has('role:reload')).toBe(false);
    expect(native.some(item => item.accelerator === 'CmdOrCtrl+R')).toBe(false);
  });

  it('routes custom actions once and reflects feature state without replacing native edit roles', () => {
    const send = vi.fn();
    const features = normalizeDocumentFeatures({ outlineVisible: true, mathPreview: false });
    const native = leaves(menuTemplate(send, features));
    const open = native.find(item => item.id === 'open')!;
    open.click?.({} as never, {} as never, {} as never);
    expect(send).toHaveBeenCalledExactlyOnceWith('open');
    expect(native.find(item => item.id === 'toggle:outlineVisible')).toMatchObject({ type: 'checkbox', checked: true });
    expect(native.find(item => item.id === 'toggle:mathPreview')).toMatchObject({ type: 'checkbox', checked: false });
    expect(native.find(item => item.id === 'role:paste')?.click).toBeUndefined();
  });
});
