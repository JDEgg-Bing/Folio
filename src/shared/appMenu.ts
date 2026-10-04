import type { DocumentFeatures } from '../renderer/preferences/DocumentFeatures';

export type MenuRole = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'quit' | 'resetZoom' | 'zoomIn' | 'zoomOut' | 'togglefullscreen';
export interface MenuAction {
  kind: 'item';
  id: string;
  label: string;
  accelerator?: string;
  shortcut?: string;
  role?: MenuRole;
  feature?: keyof DocumentFeatures;
  children?: readonly MenuEntry[];
}
export type MenuEntry = MenuAction | { kind: 'separator' };
export interface AppMenu { id: string; label: string; entries: readonly MenuEntry[] }
const item = (id: string, label: string, accelerator?: string, shortcut?: string): MenuAction => ({ kind: 'item', id, label, accelerator, shortcut });
const role = (value: MenuRole, label: string, accelerator?: string, shortcut?: string): MenuAction => ({ ...item(`role:${value}`, label, accelerator, shortcut), role: value });
const toggle = (feature: keyof DocumentFeatures, label: string, accelerator?: string, shortcut?: string): MenuAction => ({ ...item(`toggle:${feature}`, label, accelerator, shortcut), feature });
const separator: MenuEntry = { kind: 'separator' };

/** The native accelerator menu and the visible menus use the same commands. */
export const APP_MENUS: readonly AppMenu[] = [
  { id: 'file', label: '文件', entries: [
    item('new', '新建', 'CmdOrCtrl+N', 'Ctrl N'), item('open', '打开…', 'CmdOrCtrl+O', 'Ctrl O'),
    item('save', '保存', 'CmdOrCtrl+S', 'Ctrl S'), item('save-as', '另存为…', 'CmdOrCtrl+Shift+S', 'Ctrl Shift S'),
    separator, item('export-pdf', '导出 PDF…', 'CmdOrCtrl+Shift+E', 'Ctrl Shift E'), item('export-docx', '导出 Word…'),
    item('word-templates', 'Word 模板…'), separator, role('quit', '退出')
  ] },
  { id: 'edit', label: '编辑', entries: [
    role('undo', '撤销', 'CmdOrCtrl+Z', 'Ctrl Z'), role('redo', '重做', 'CmdOrCtrl+Y', 'Ctrl Y'), separator,
    role('cut', '剪切', 'CmdOrCtrl+X', 'Ctrl X'), role('copy', '复制', 'CmdOrCtrl+C', 'Ctrl C'),
    role('paste', '粘贴', 'CmdOrCtrl+V', 'Ctrl V'), role('selectAll', '全选', 'CmdOrCtrl+A', 'Ctrl A'), separator,
    item('find', '查找 / 替换', 'CmdOrCtrl+F', 'Ctrl F')
  ] },
  { id: 'view', label: '视图', entries: [
    toggle('outlineVisible', '文档目录', 'CmdOrCtrl+Shift+O', 'Ctrl Shift O'),
    { ...item('preview', '文档预览'), children: [toggle('mathPreview', '数学公式'), toggle('imagePreview', '图片'), toggle('tablePreview', '表格'), toggle('referencePreview', '内部引用')] },
    item('appearance', '外观 / 排版…'), separator,
    role('resetZoom', '实际大小', 'CmdOrCtrl+0', 'Ctrl 0'), role('zoomIn', '放大', 'CmdOrCtrl+Plus', 'Ctrl +'),
    role('zoomOut', '缩小', 'CmdOrCtrl+-', 'Ctrl −'), role('togglefullscreen', '全屏', 'F11', 'F11')
  ] },
  { id: 'help', label: '帮助', entries: [
    item('help', '使用指南', 'F1', 'F1'), item('sample', '打开示例文稿'),
    item('feedback', '问题反馈…'), separator, item('about', '关于轻页')
  ] }
];

export function menuActions(entries: readonly MenuEntry[]): MenuAction[] {
  return entries.flatMap(entry => entry.kind === 'separator' ? [] : entry.children ? menuActions(entry.children) : [entry]);
}
export const MENU_COMMAND_IDS = new Set(APP_MENUS.flatMap(menu => menuActions(menu.entries)).map(entry => entry.id));
