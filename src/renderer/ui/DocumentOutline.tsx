import { useEffect, useRef, useState } from 'react';
import { semanticText, type DocumentNode } from '../../document/model';
const ROW = 28;
export function currentHeading(headings: readonly DocumentNode[], position: number): string | null {
  let id: string | null = null; for (const heading of headings) { if (heading.from > position) break; id = heading.id; } return id;
}
export function DocumentOutline({ headings, active, onJump, onClose }: { headings: readonly DocumentNode[]; active: string | null; onJump: (position: number) => void; onClose: () => void }) {
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const measure = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, [headings.length > 0]);
  const start = Math.max(0, Math.floor(viewport.top / ROW) - 8), end = Math.min(headings.length, Math.ceil((viewport.top + viewport.height) / ROW) + 8);
  return <aside className="document-outline" aria-label="文档目录">
    <div className="outline-header"><span>文档目录</span><button aria-label="关闭目录" onClick={onClose}>×</button></div>
    {!headings.length ? <p className="outline-empty">暂无标题<span>写下标题后，章节会显示在这里。</span></p> : <div ref={scroll} className="outline-scroll" onScroll={event => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })}>
      <div style={{ height: headings.length * ROW, position: 'relative' }} role="list">
        {headings.slice(start, end).map((heading, index) => <button role="listitem" className={`outline-item${heading.id === active ? ' active' : ''}`} data-level={heading.level ?? 1} key={heading.id} title={semanticText(heading).trim()} aria-current={heading.id === active ? 'location' : undefined} style={{ top: (start + index) * ROW, paddingLeft: 12 + ((heading.level ?? 1) - 1) * 12 }} onClick={() => onJump(heading.from)}>{semanticText(heading).trim() || '无标题内容'}</button>)}
      </div>
    </div>}
  </aside>;
}
