import { useEffect, useRef, useState } from 'react';
import { TEMPLATE_ROLES, type TemplateLibrary, type TemplateRole, type WordTemplateAPI, type WordTemplateProfile } from '../../shared/wordTemplate';
import { useModal } from './useModal';
import { DecisionDialog } from './DecisionDialog';
const primary: TemplateRole[] = ['body','title','heading1','heading2','figureCaption','tableCaption'];
const secondary: TemplateRole[] = ['heading3','heading4','heading5','heading6','tableText','list','quote','equation','code'];
export function WordTemplateDialog({ api, onClose, onExport }: { api: WordTemplateAPI; onClose(): void; onExport(templateId?: string): Promise<void> }) {
  const dialog=useModal(), alive=useRef(true), request=useRef<string|null>(null), draft=useRef<string|null>(null);
  const [removing, setRemoving] = useState(false);
  const [library,setLibrary]=useState<TemplateLibrary>({templates:[],defaultId:null}), [selected,setSelected]=useState<WordTemplateProfile|null>(null);
  const [busy,setBusy]=useState(true),[analyzing,setAnalyzing]=useState(false),[error,setError]=useState('');
  const [changed,setChanged]=useState(false),[makeDefault,setMakeDefault]=useState(false);
  const [chooser,setChooser]=useState<TemplateRole|null>(null),[query,setQuery]=useState(''),[visible,setVisible]=useState(10);
  const select=(p:WordTemplateProfile|null,defaultId:string|null)=>{
    if(draft.current && draft.current!==p?.id)void api.discardDraft(draft.current).catch(()=>{});
    draft.current=p&&!p.confirmed?p.id:null;
    setSelected(p);setChanged(false);setMakeDefault(!!p&&(p.review?.originalId||p.id)===defaultId);setError('');setChooser(null);
  };
  useEffect(()=>{
    alive.current=true;
    api.list().then(v=>{if(alive.current){setLibrary(v);select(v.templates.find(t=>t.id===v.defaultId)||null,v.defaultId);}}).catch(e=>{if(alive.current)setError(String(e.message||e));}).finally(()=>{if(alive.current)setBusy(false);});
    return()=>{alive.current=false;if(request.current)void api.cancelAnalysis(request.current).catch(()=>{});if(draft.current)void api.discardDraft(draft.current).catch(()=>{});};
  },[api]);
  const action=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'模板操作失败，请重试。');}finally{if(alive.current)setBusy(false);}};
  const analyze=async(id?:string)=>action(async()=>{
    const token=crypto.randomUUID();request.current=token;setAnalyzing(true);
    try{const p=id?await api.reanalyze(id,token):await api.import(token);if(p){if(!alive.current||request.current!==token){await api.discardDraft(p.id);return;}select(p,library.defaultId);setChanged(true);}}
    finally{if(request.current===token)request.current=null;if(alive.current)setAnalyzing(false);}
  });
  const cancel=async()=>{const token=request.current;if(token){request.current=null;await api.cancelAnalysis(token);}};
  const save=async():Promise<WordTemplateProfile|null>=>{
    if(!selected){if(makeDefault)await api.setDefault(null);setLibrary(await api.list());setChanged(false);return null;}
    const p=await api.confirm({id:selected.id,name:selected.name,mappings:Object.fromEntries(Object.entries(selected.mappings).map(([r,m])=>[r,m.candidateId])) as Record<TemplateRole,string|null>,warningsAccepted:selected.warningsAccepted,makeDefault,confirmedRoles:(Object.keys(TEMPLATE_ROLES) as TemplateRole[]).filter(r=>selected.mappings[r].confirmedByUser)});
    draft.current=null;setSelected(p);setChanged(false);setLibrary(await api.list());return p;
  };
  const choose=(role:TemplateRole,id:string|null)=>{
    if(!selected)return;const c=selected.candidates.find(c=>c.id===id);
    const old=selected.mappings[role],suggested=selected.review?.suggestions[role];
    setSelected({...selected,mappings:{...selected.mappings,[role]:{...old,candidateId:id,confidence:id?'high':'low',needsConfirmation:false,confirmedByUser:true,example:id===old.candidateId?old.example:id===suggested?.candidateId?suggested.example:c?.sample,reason:'由你确认的映射。'}}});setChanged(true);setChooser(null);
  };
  const roles=(keys:TemplateRole[])=>keys.map(role=>{
    const m=selected!.mappings[role],c=selected!.candidates.find(c=>c.id===m.candidateId),s=selected!.review?.suggestions[role],suggested=selected!.candidates.find(c=>c.id===s?.candidateId);
    const recommended=(m.alternatives?.length?m.alternatives:selected!.candidates.slice().sort((a,b)=>b.count-a.count).slice(0,5).map(c=>c.id)).slice(0,5);
    const options=[...new Set([...recommended,...(m.candidateId?[m.candidateId]:[])])].map(id=>selected!.candidates.find(c=>c.id===id)).filter(c=>!!c);
    const status=m.confirmedByUser || selected!.confirmed && !m.needsConfirmation?'已确认':m.needsConfirmation?'需确认':m.confidence==='high'?'已识别':m.candidateId?'建议核对':'未确定';
    return <div className="template-mapping" id={`template-mapping-${role}`} key={role}>
      <label>{TEMPLATE_ROLES[role]}<select aria-label={`${TEMPLATE_ROLES[role]}映射`} value={m.candidateId||''} disabled={busy} onChange={e=>{if(e.target.value==='__browse__'){setChooser(role);setQuery('');setVisible(10);}else choose(role,e.target.value||null);}}><option value="">{role==='body'?'请选择正文格式':'继承正文 / 使用基础版式'}</option>{options.map(c=><option key={c!.id} value={c!.id}>{c!.name}{c!.source==='sample'?` · ${c!.sample.slice(0,28)}`:''}</option>)}<option value="__browse__">其他样式…</option></select></label>
      <small className={m.needsConfirmation||m.confidence!=='high'?'template-uncertain':''}>{status} · {m.reason}</small>
      {c&&<><p>{c.summary}</p>{(m.example||c.sample)&&<small>样本：{m.example||c.sample}（使用 {c.count} 次）</small>}</>}
      {m.needsConfirmation&&!m.confirmedByUser&&<button disabled={busy||role==='body'&&!c} onClick={()=>choose(role,m.candidateId)}>{c?'使用此格式':'使用基础版式'}</button>}
      {s&&s.candidateId!==m.candidateId&&<div className="template-reanalysis"><small>重新识别建议：{suggested?.summary||'使用基础版式'} · {s.reason}</small><button disabled={busy||role==='body'&&!suggested} onClick={()=>choose(role,s.candidateId)}>采用新建议</button><small>保留当前选择无需操作。</small></div>}
    </div>;
  });
  const ready=!selected||!!selected.name.trim()&&!!selected.mappings.body.candidateId&&(!selected.warnings.length||selected.warningsAccepted)&&!Object.values(selected.mappings).some(m=>m.needsConfirmation&&!m.confirmedByUser);
  const matches=selected&&chooser?selected.candidates.filter(c=>`${c.name} ${c.sample} ${c.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())):[];
  const pending=selected?(Object.keys(TEMPLATE_ROLES) as TemplateRole[]).filter(r=>selected.mappings[r].needsConfirmation&&!selected.mappings[r].confirmedByUser):[];
  return <dialog className="appearance-dialog word-template-dialog" ref={dialog} aria-labelledby="word-template-title" onCancel={e=>{if(busy){e.preventDefault();if(analyzing)void cancel();}else onClose();}}>
    <header className="appearance-header"><h1 id="word-template-title">Word 模板与导出</h1><p>选用已有模板，或导入 DOCX / DOTX 并核对格式。</p></header>
    <div className="appearance-body">
      <p className="template-help">导出使用所选模板或内置文稿版式，不沿用编辑器外观。取消或失败后保留当前选择，可继续重试。</p>
      <div className="template-toolbar"><label>选择模板<select aria-label="选择模板" disabled={busy} value={selected?.id||''} onChange={e=>select(library.templates.find(t=>t.id===e.target.value)||null,library.defaultId)}><option value="">默认文稿（内置版式）</option>{library.templates.map(t=><option key={t.id} value={t.id}>{t.name}{t.id===library.defaultId?' · 默认':''}</option>)}{selected&&!library.templates.some(t=>t.id===selected.id)&&<option value={selected.id}>{selected.name} · 待确认</option>}</select></label><button disabled={busy} onClick={()=>void analyze()}>导入 Word 模板…</button>{selected?.confirmed&&<button disabled={busy} onClick={()=>void analyze(selected.id)}>重新识别</button>}</div>
      {selected?<>
        <label className="appearance-field">模板名称<input aria-label="模板名称" maxLength={100} value={selected.name} disabled={busy} onChange={e=>{setSelected({...selected,name:e.target.value});setChanged(true);}}/></label>
        {selected.review&&<p className="template-help">正在重新识别：已保留原来的确认结果。只在需要时采用新建议；保存后才更新模板。</p>}
        {pending.length>0&&<p className="template-uncertain">有 {pending.length} 项格式需要确认。<button disabled={busy} onClick={()=>document.getElementById(`template-mapping-${pending[0]}`)?.scrollIntoView({block:'start'})}>查看需要确认的格式</button></p>}
        <section className="template-summary"><h2>页面与页眉页脚</h2><p>{selected.page.summary}</p>{selected.runningMatter.map((line,i)=><p key={i}>{line}</p>)}<p>{selected.tableSummary}</p><small>保留原样式体系和资源。原模板正文仅用作排版样本，不会复制到导出文稿。</small></section>
        <h2>识别结果</h2><p className="template-help">通常只需核对下面几项。有冲突时确认一项已有格式即可。</p>
        {chooser&&<section className="template-chooser" aria-label={`选择${TEMPLATE_ROLES[chooser]}格式`}><label>查找已有格式<input autoFocus aria-label="查找已有格式" value={query} onChange={e=>{setQuery(e.target.value);setVisible(10);}}/></label><p>找到 {matches.length} 项，显示前 {Math.min(visible,matches.length)} 项</p>{matches.slice(0,visible).map(c=><button key={c.id} disabled={busy} onClick={()=>choose(chooser,c.id)}>{c.name} · {c.sample.slice(0,40)}<small>{c.summary}</small></button>)}{matches.length>visible&&<button onClick={()=>setVisible(visible+10)}>再显示 10 项</button>}<button onClick={()=>setChooser(null)}>收起选择</button></section>}
        {roles(primary)}<details className="appearance-details" open={secondary.some(r=>selected.mappings[r].needsConfirmation&&!selected.mappings[r].confirmedByUser)||undefined}><summary>更多内容映射</summary>{roles(secondary)}</details>
        {selected.warnings.length>0&&<section className="template-warnings"><h2>需要留意</h2><ul>{selected.warnings.map(message=><li key={message}>{message}</li>)}</ul><label><input type="checkbox" disabled={busy} checked={selected.warningsAccepted} onChange={e=>{setSelected({...selected,warningsAccepted:e.target.checked});setChanged(true);}}/>我已了解这些限制，使用识别出的版式导出</label></section>}
      </>:<p>使用现有 Word 导出，也可以导入 DOCX / DOTX 自动识别。</p>}
      <label className="template-default"><input type="checkbox" disabled={busy} checked={makeDefault} onChange={e=>{setMakeDefault(e.target.checked);setChanged(true);}}/>下次优先使用此模板</label>
      {error&&<p className="template-error appearance-error" role="alert">{error}</p>}{busy&&<p className="inline-progress" role="status">正在处理 Word 模板…{analyzing&&<button onClick={()=>void cancel()}>取消分析</button>}</p>}
    </div>
    <footer className="template-footer">{selected?.confirmed&&<button className="folio-button danger" disabled={busy} onClick={()=>setRemoving(true)}>删除模板</button>}<button className="folio-button" disabled={busy||!ready||!selected&&!changed} onClick={()=>void action(async()=>{await save();})}>保存模板</button><button className="folio-button" disabled={busy} onClick={onClose}>关闭</button><button className="folio-button primary template-export" data-initial-focus disabled={busy||!ready} onClick={()=>void action(async()=>{const p=changed||selected&&!selected.confirmed?await save():selected;await onExport(p?.id);})}>{selected?'按此模板导出 Word':'导出 Word'}</button></footer>
    {removing && selected && <DecisionDialog request={{id:'remove-template',title:`删除“${selected.name}”？`,description:'只移除轻页保存的模板副本。原始 Word 文件和已导出的文稿保留。',choices:[{id:'cancel',label:'取消'},{id:'remove',label:'删除模板',kind:'danger'}],defaultChoice:'cancel',cancelChoice:'cancel'}} onAnswer={answer=>{setRemoving(false);if(answer==='remove')void action(async()=>{await api.remove(selected.id);const next=await api.list();setLibrary(next);select(null,next.defaultId);});}}/>}
  </dialog>;
}
