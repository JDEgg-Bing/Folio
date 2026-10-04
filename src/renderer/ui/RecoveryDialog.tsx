import { useEffect, useRef, useState } from 'react';
import type { RecoveryOutcome } from '../../shared/desktopApi';
import { useModal } from './useModal';

export function RecoveryDialog({ recovery, onDecide }: { recovery: RecoveryOutcome; onDecide(restore: boolean): Promise<void> }) {
  const dialog = useModal();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [discardConfirmed, setDiscardConfirmed] = useState(false);
  const decide = async (restore: boolean) => {
    setBusy(true); setError('');
    try { await onDecide(restore); }
    catch { setError('无法处理恢复草稿，请重试。草稿仍保留在本地。'); setBusy(false); }
  };
  return <dialog ref={dialog} className="appearance-dialog recovery-dialog" aria-labelledby="recovery-title" onCancel={event => event.preventDefault()}>
    <header className="appearance-header"><h1 id="recovery-title">找到了未保存的文稿</h1><p>上次写作可能未正常结束。</p></header>
    <div className="appearance-body">
      <p>{recovery.document.displayName || '未命名文档'}</p>
      <p className="template-help">草稿时间：{new Date(recovery.updatedAt).toLocaleString('zh-CN')}</p>
      <p>恢复后仍需手动保存。磁盘原文件不会自动改写；最后一小段输入可能尚未进入草稿。</p>
      <pre className="recovery-preview">{recovery.document.text.slice(0, 500) || '（空文稿）'}</pre>
      {discardConfirmed && <p role="alert" className="appearance-error">丢弃后无法恢复这份草稿。磁盘原文件保留。确认要丢弃吗？</p>}
      {error && <p role="alert" className="appearance-error">{error}</p>}
    </div>
    <footer className="appearance-actions"><button className="folio-button danger" disabled={busy} onClick={() => discardConfirmed ? void decide(false) : setDiscardConfirmed(true)}>{discardConfirmed ? '确认丢弃草稿' : '丢弃恢复草稿'}</button><button className="folio-button primary" data-initial-focus disabled={busy} onClick={() => void decide(true)}>{busy ? '正在处理…' : '恢复文稿'}</button></footer>
  </dialog>;
}
