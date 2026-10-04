import type { DocumentMetadata } from '../../shared/desktopApi';
import type { EditorSnapshot } from '../editor/EditorController';
import { resolveDocumentTitle } from '../document/DocumentTitle';

export function statusBarContent(document: Pick<DocumentMetadata, 'displayName' | 'fileHandleId' | 'dirty'>, snapshot: Pick<EditorSnapshot, 'wordCount' | 'line' | 'column'> & Partial<Pick<EditorSnapshot, 'headingTitle'>>) {
  return {
    name: resolveDocumentTitle(snapshot.headingTitle ?? null, document),
    saved: document.dirty ? '已修改' : document.fileHandleId ? '已保存' : '未保存',
    words: `${snapshot.wordCount.toLocaleString('zh-CN')} 字`,
    position: `行 ${snapshot.line}，列 ${snapshot.column}`
  };
}

export function StatusBar({ document, snapshot }: { document: DocumentMetadata; snapshot: EditorSnapshot }) {
  const content = statusBarContent(document, snapshot);
  return <footer className="status-bar" aria-label="文档状态">
    <span className="status-document" title={content.name}><span className="status-name">{content.name}</span><span className={`status-saved${document.dirty ? ' is-dirty' : ''}`}> · {content.saved}</span></span>
    <span className="status-details"><span title="中文按字，英文和数字按词；基于 Markdown 源文">{content.words}</span><span>{content.position}</span></span>
  </footer>;
}
