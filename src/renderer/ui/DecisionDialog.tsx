import { useState } from 'react';
import type { DecisionRequest } from '../../shared/interaction';
import { useModal } from './useModal';

export function DecisionDialog({ request, onAnswer }: { request: DecisionRequest; onAnswer(answer: string): void }) {
  const dialog = useModal();
  const [selected, setSelected] = useState(request.defaultChoice);
  const cancel = () => onAnswer(request.cancelChoice);
  const choices = request.choices.filter(c => c.id !== request.cancelChoice);
  return <dialog ref={dialog} className="appearance-dialog decision-dialog" aria-labelledby={`decision-${request.id}`} onCancel={event => { event.preventDefault(); event.stopPropagation(); cancel(); }}>
    <header className="appearance-header"><p className="dialog-eyebrow">Folio · 轻页</p><h1 id={`decision-${request.id}`}>{request.title}</h1><p>{request.description}</p></header>
    {request.selection && <div className="appearance-body decision-options" role="radiogroup" aria-label="导出版式">
      {choices.map(choice => <label className="decision-option" key={choice.id} data-selected={selected === choice.id}>
        <input type="radio" name={request.id} checked={selected === choice.id} onChange={() => setSelected(choice.id)} data-initial-focus={choice.id === request.defaultChoice || undefined}/>
        <span><strong>{choice.label}</strong><small>{choice.description}</small></span>
      </label>)}
      <p className="template-help">PDF 固定分页；Word 可继续编辑，字体和分页可能随接收电脑变化。</p>
    </div>}
    <footer className="dialog-actions">
      <button className="folio-button" data-initial-focus={!request.selection && request.defaultChoice === request.cancelChoice || undefined} onClick={cancel}>取消</button>
      {request.selection ? <button className="folio-button primary" onClick={() => onAnswer(selected)}>{request.confirmLabel || '继续'}</button> : choices.map(choice => <button key={choice.id} className={`folio-button ${choice.kind || ''}`} data-initial-focus={choice.id === request.defaultChoice || undefined} onClick={() => onAnswer(choice.id)}>{choice.label}</button>)}
    </footer>
  </dialog>;
}
