export const chinesePhrases = {
  Find: '查找', Replace: '替换', next: '下一个', previous: '上一个', all: '全选匹配', 'match case': '区分大小写', regexp: '正则表达式', 'by word': '完整词', replace: '替换', 'replace all': '全部替换', close: '关闭',
  'Go to line': '跳转到行', go: '跳转', 'Selection deleted': '已删除选中内容', 'No matches found': '未找到匹配内容', 'Document changed': '文档已修改',
  'current match': '当前匹配', 'on line': '位于行', 'replaced match on line $': '已替换行 $ 的匹配内容', 'Control character': '控制字符', 'replaced $ matches': '已替换 $ 处匹配', '$ matches': '$ 处匹配', 'Fold line': '折叠行', 'Unfold line': '展开行'
};
export const uiText = { unnamed: '未命名文档', appName: 'Folio', close: '关闭', search: '查找 / 替换', outline: '文档目录', noHeadings: '暂无标题' };
export function userError(cause: unknown, operation: 'open' | 'save' | 'image' = 'open'): string {
  const message = cause instanceof Error ? cause.message : '';
  // Preserve only app-authored Chinese messages, never Electron's invocation prefix.
  if (/^[\u4e00-\u9fff]/.test(message) && !/Error invoking/.test(message)) return message;
  return operation === 'save' ? '无法保存文档，请检查保存位置和磁盘空间。' : operation === 'image' ? '无法处理图片，请检查图片文件和文档保存位置。' : '无法打开文档，请检查文件是否存在并使用 UTF-8 编码。';
}
