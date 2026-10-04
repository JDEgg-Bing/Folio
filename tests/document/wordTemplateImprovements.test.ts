import { describe,it,expect,vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strFromU8,strToU8,unzipSync,zipSync } from 'fflate';
import { analyzeWordTemplate } from '../../src/document/templates/WordTemplateAnalyzer';
import { rebindStyleRef } from '../../src/document/templates/WordTemplateFields';
import { attr,elements,parseXml,W } from '../../src/document/templates/WordXml';
import { WordTemplateStore } from '../../src/main/export/WordTemplateStore';
import { WordTemplateAnalysisService,type AnalysisWorkerFactory } from '../../src/main/export/WordTemplateAnalysisService';
import { type TemplateRole,type WordTemplateProfile } from '../../src/shared/wordTemplate';
import { wordTemplateFixture } from './wordTemplateFixtures';

function edit(change:(parts:Record<string,string>)=>void,kind:'formal'|'direct'='direct') {
  const parts=Object.fromEntries(Object.entries(unzipSync(wordTemplateFixture(kind))).map(([k,v])=>[k,strFromU8(v)]));change(parts);return zipSync(Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,strToU8(v)])));
}
const analyze=(bytes=wordTemplateFixture('direct'))=>analyzeWordTemplate(bytes,'Test','test');
const role=(p:WordTemplateProfile,r:TemplateRole)=>p.candidates.find(c=>c.id===p.mappings[r].candidateId)!;
const confirm=(p:WordTemplateProfile)=>({id:p.id,name:p.name,mappings:Object.fromEntries(Object.entries(p.mappings).map(([r,m])=>[r,m.candidateId])) as Record<TemplateRole,string|null>,warningsAccepted:true,makeDefault:true,confirmedRoles:(Object.keys(p.mappings) as TemplateRole[])});
const styled=(id:string,value:string)=>`<w:p><w:pPr><w:pStyle w:val="${id}"/></w:pPr><w:r><w:t>${value}</w:t></w:r></w:p>`;

describe('recognition evidence and ambiguity',()=>{
  it.each(['概念框架','1 概念框架','（一）概念框架','IV. 概念框架','一、'+ '长章节名称'.repeat(30)])('recognizes independent heading wording %s',text=>{
    const p=analyze(edit(f=>{f['word/document.xml']=f['word/document.xml'].replace('一、研究背景',text);}));expect(role(p,'heading1').summary).toContain('16 pt');expect(p.mappings.heading1.example).toContain(text.slice(0,30));
  });
  it('uses role-specific evidence when two levels share one format',()=>{
    const p=analyze(edit(f=>{f['word/document.xml']=f['word/document.xml'].replace('w:val="28"','w:val="32"');}));expect(p.mappings.heading1.candidateId).toBe(p.mappings.heading2.candidateId);expect(p.mappings.heading2.example).toContain('1.1');
  });
  it('does not let the first note conceal a subsequent heading',()=>{
    const p=analyze(edit(f=>{f['word/document.xml']=f['word/document.xml'].replace('一、研究背景','使用说明</w:t></w:r></w:p>'+f['word/document.xml'].match(/<w:p><w:pPr><w:keepNext\/>[\s\S]*?一、研究背景/)![0]);}));expect(p.mappings.heading1.example).toContain('一、');
  });
  it('flags an unused contradictory heading instead of claiming certainty',()=>{
    const p=analyze(edit(f=>{f['word/styles.xml']=f['word/styles.xml'].replace('</w:styles>',`<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="48"/></w:rPr></w:style></w:styles>`);}));expect(role(p,'heading1').summary).toContain('16 pt');expect(p.mappings.heading1.needsConfirmation).toBe(true);expect(p.mappings.heading1.confidence).toBe('low');
  });
  it('does not treat a plain hanging-numbered list as a heading',()=>{
    const bytes=edit(f=>{f['word/document.xml']=f['word/document.xml'].replace(/<w:body>[\s\S]*?<w:sectPr>/,`<w:body>${styled('Normal','这是连续的正文内容。用于确定正文格式和字号。')}<w:p><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:r><w:t>1. 清单条目</w:t></w:r></w:p><w:sectPr>`);});const p=analyze(bytes);expect(p.mappings.heading1.candidateId).toBeNull();expect(p.mappings.list.candidateId).not.toBeNull();
  });
  it('reads a caption after more than eight preceding examples',()=>{
    const p=analyze(edit(f=>{f['word/document.xml']=f['word/document.xml'].replace('图 1 实验装置',Array.from({length:30},(_,i)=>`注：${i}</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="楷体" w:ascii="Arial"/><w:sz w:val="20"/></w:rPr><w:t>`).join('')+'Figure 19 Instrument');}));expect(p.mappings.figureCaption.example).toContain('Figure 19');
  });
  it('warns when textual requirements have no applied body evidence',()=>{
    const p=analyze(edit(f=>{f['word/document.xml']=f['word/document.xml'].replace(/<w:body>[\s\S]*?<w:sectPr>/,`<w:body>${styled('Normal','正文要求宋体小四，首行缩进两字符。')}${styled('Normal','一级标题要求黑体三号，段前十二磅。')}<w:sectPr>`);}));expect(p.warnings.join()).toContain('不解析文字要求');expect(p.mappings.body.confidence).toBe('low');expect(p.mappings.body.needsConfirmation).toBe(true);
  });
  it('keeps meaningful font-size distinctions while merging paragraph noise',()=>{
    const bytes=edit(f=>{f['word/document.xml']=f['word/document.xml'].replace(/<w:body>[\s\S]*?<w:sectPr>/,`<w:body>${Array.from({length:21},(_,i)=>`<w:p><w:pPr><w:spacing w:after="${120+i}"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>这里是连续的正文段落。提供多种细微差异。</w:t></w:r></w:p>`).join('')}<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>其他正文。</w:t></w:r></w:p><w:sectPr>`);});
    const p=analyze(bytes),samples=p.candidates.filter(c=>c.source==='sample');expect(samples.length).toBe(3);expect(samples.filter(c=>c.summary.includes('11 pt'))).toHaveLength(2);expect(samples.some(c=>c.summary.includes('12 pt'))).toBe(true);
  });
  it('handles 1000 inherited styles without recursive expansion',()=>{
    const bytes=edit(f=>{f['word/styles.xml']=f['word/styles.xml'].replace('</w:styles>',Array.from({length:1000},(_,i)=>`<w:style w:type="paragraph" w:styleId="C${i}"><w:name w:val="custom ${i}"/><w:basedOn w:val="${i?'C'+(i-1):'Normal'}"/></w:style>`).join('')+'</w:styles>');f['word/document.xml']=f['word/document.xml'].replaceAll('w:val="Normal"','w:val="C999"');});expect(analyze(bytes).candidates.length).toBeGreaterThan(1000);
  });
  it('warns for cyclic styles and requires confirmation',()=>{
    const p=analyze(edit(f=>{f['word/styles.xml']=f['word/styles.xml'].replace('w:styleId="Normal"','w:styleId="Normal"').replace('<w:name w:val="Normal"/>','<w:name w:val="Normal"/><w:basedOn w:val="Normal"/>');}));expect(p.warnings.join()).toContain('循环');expect(p.mappings.body.needsConfirmation).toBe(true);
  });
});

describe('native heading fields',()=>{
  it.each(['<w:fldSimple w:instr="STYLEREF &quot;heading 1&quot; \\l"><w:r><w:t>cached</w:t></w:r></w:fldSimple>', '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> STYLE</w:instrText></w:r><w:r><w:instrText>REF "heading 1" \\n \\l </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>cached</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'])('rebinds a native field preserving switches %s',code=>{
    const doc=parseXml(`<w:hdr xmlns:w="${W}"><w:p>${code}</w:p></w:hdr>`),warnings:string[]=[];expect(rebindStyleRef(doc,new Map([['heading 1','Folio 一级标题']]),warnings)).toBe(true);const result=elements(doc,'instrText').map(n=>n.textContent).join('')||attr(elements(doc,'fldSimple')[0],'instr');expect(result).toContain('"Folio 一级标题"');expect(result).toContain('\\l');expect(warnings).toEqual([]);
  });
  it('retains ambiguous fields and reports the limitation',()=>{const doc=parseXml(`<w:hdr xmlns:w="${W}"><w:fldSimple w:instr="STYLEREF Custom \\l"/></w:hdr>`),warnings:string[]=[];expect(rebindStyleRef(doc,new Map(),warnings)).toBe(false);expect(attr(elements(doc,'fldSimple')[0],'instr')).toBe('STYLEREF Custom \\l');expect(warnings.join()).toContain('无法关联');});
});

describe('safe reanalysis lifecycle',()=>{
  const withStore=async(run:(store:WordTemplateStore,folder:string)=>Promise<void>)=>{const folder=await mkdtemp(join(tmpdir(),'folio-reanalysis-'));try{await run(new WordTemplateStore(folder),folder);}finally{await rm(folder,{recursive:true,force:true});}};
  it('preserves bytes, mapping, default and persisted identity until confirmation',()=>withStore(async(store,folder)=>{
    const p=await store.import(wordTemplateFixture(),'Saved');await store.confirm(confirm(p));const old=await readFile(join(folder,p.id+'.json'));
    const draft=await store.reanalyze(p.id);expect(draft.id).not.toBe(p.id);expect(draft.review?.originalId).toBe(p.id);expect(await readFile(join(folder,p.id+'.json'))).toEqual(old);expect((await store.list()).defaultId).toBe(p.id);
    store.discardDraft(draft.id);expect(await readFile(join(folder,p.id+'.json'))).toEqual(old);
    const next=await store.reanalyze(p.id),saved=await store.confirm(confirm(next));expect(saved.id).toBe(p.id);expect(saved.review).toBeUndefined();expect((await store.list()).templates).toHaveLength(1);
  }));
  it('keeps a manually confirmed legacy format when it cannot be rediscovered',()=>withStore(async(store,folder)=>{
    const p=await store.import(wordTemplateFixture(),'Saved'),c=confirm(p);c.mappings.heading1=c.mappings.body;await store.confirm(c);
    const path=join(folder,p.id+'.json'),record=JSON.parse(await readFile(path,'utf8'));const candidate=record.profile.candidates.find((c:any)=>c.id===record.profile.mappings.heading1.candidateId);candidate.run=candidate.run.replace('w:val="22"','w:val="23"');await writeFile(path,JSON.stringify(record));
    const draft=await store.reanalyze(p.id);expect(draft.mappings.heading1.candidateId).toContain('retained:');expect(role(draft,'heading1').run).toContain('23');expect(draft.review?.suggestions.heading1.candidateId).not.toBe(draft.mappings.heading1.candidateId);expect(new Set(draft.candidates.map(c=>c.id)).size).toBe(draft.candidates.length);
  }));
  it('requires role acknowledgement independently from compatibility acceptance',()=>withStore(async(store)=>{
    const p=await store.import(edit(f=>{f['word/styles.xml']=f['word/styles.xml'].replace('</w:styles>',`<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="48"/></w:rPr></w:style></w:styles>`);}), 'Conflict');const c=confirm(p);c.confirmedRoles=[];await expect(store.confirm(c)).rejects.toThrow(/单独确认/);c.confirmedRoles=['heading1'];await expect(store.confirm(c)).resolves.toHaveProperty('confirmed',true);
  }));
  it('loads and exports old version-one records without automatic reanalysis',()=>withStore(async(store,folder)=>{
    const p=await store.import(wordTemplateFixture(),'Old');await store.confirm(confirm(p));const path=join(folder,p.id+'.json'),record=JSON.parse(await readFile(path,'utf8'));delete record.profile.analysisRevision;for(const m of Object.values(record.profile.mappings) as any[])for(const k of ['example','alternatives','needsConfirmation','confirmedByUser'])delete m[k];await writeFile(path,JSON.stringify(record));const before=await readFile(path),reopened=new WordTemplateStore(folder,async()=>{throw new Error('must not analyze');});expect((await reopened.get(p.id)).profile.version).toBe(1);expect((await reopened.list()).defaultId).toBe(p.id);expect(await readFile(path)).toEqual(before);
  }));
  it('does not persist a failed reanalysis',()=>withStore(async(store,folder)=>{
    const p=await store.import(wordTemplateFixture(),'Saved');await store.confirm(confirm(p));const path=join(folder,p.id+'.json'),before=await readFile(path);const failing=new WordTemplateStore(folder,async()=>{throw new Error('timeout');});await expect(failing.reanalyze(p.id)).rejects.toThrow('timeout');expect(await readFile(path)).toEqual(before);
  }));
  it('remaps old candidate identities and updates only the chosen role',()=>withStore(async(store,folder)=>{
    const p=await store.import(wordTemplateFixture(),'Old');await store.confirm(confirm(p));const path=join(folder,p.id+'.json'),record=JSON.parse(await readFile(path,'utf8'));
    for(const c of record.profile.candidates)c.id='old:'+c.id;
    for(const m of Object.values(record.profile.mappings) as any[]){if(m.candidateId)m.candidateId='old:'+m.candidateId;if(m.alternatives)m.alternatives=m.alternatives.map((id:string)=>'old:'+id);}
    await writeFile(path,JSON.stringify(record));const draft=await store.reanalyze(p.id),input=confirm(draft);input.mappings.heading1=draft.mappings.body.candidateId;const bodyBefore=role(draft,'body').run;await store.confirm(input);const reloaded=await new WordTemplateStore(folder).get(p.id);expect(role(reloaded.profile,'body').run).toBe(bodyBefore);expect(reloaded.profile.mappings.heading1.candidateId).toBe(input.mappings.body);expect((await store.list()).defaultId).toBe(p.id);
  }));
  it('rejects malformed optional recognition metadata',()=>withStore(async(store,folder)=>{
    const p=await store.import(wordTemplateFixture(),'Old');await store.confirm(confirm(p));const path=join(folder,p.id+'.json'),record=JSON.parse(await readFile(path,'utf8'));record.profile.mappings.body.alternatives='not-an-array';await writeFile(path,JSON.stringify(record));await expect(store.get(p.id)).rejects.toThrow(/损坏/);
  }));
});

describe('analysis worker lifetime',()=>{
  const fake=()=>{const worker=new EventEmitter() as EventEmitter & {terminate:ReturnType<typeof vi.fn>};worker.terminate=vi.fn(async()=>0);let data:any;const factory:AnalysisWorkerFactory= d=>{data=d;return worker as unknown as ReturnType<AnalysisWorkerFactory>;};return {worker,factory,getData:()=>data};};
  it('copies source bytes and terminates after delivering a result',async()=>{const f=fake(),service=new WordTemplateAnalysisService(f.factory),bytes=wordTemplateFixture(),before=bytes.slice(),pending=service.analyze(bytes,'Template','id');f.getData().bytes[0]=0;expect(bytes).toEqual(before);f.worker.emit('message',{profile:analyze()});await expect(pending).resolves.toHaveProperty('version',1);expect(f.worker.terminate).toHaveBeenCalledOnce();});
  it('cancels and ignores late results and queued errors',async()=>{const f=fake(),controller=new AbortController(),pending=new WordTemplateAnalysisService(f.factory).analyze(wordTemplateFixture(),'Template','id',controller.signal),check=expect(pending).rejects.toThrow(/取消/);controller.abort();f.worker.emit('message',{profile:analyze()});expect(()=>f.worker.emit('error',new Error('late'))).not.toThrow();await check;await Promise.resolve();expect(f.worker.eventNames()).toEqual([]);expect(f.worker.terminate).toHaveBeenCalledOnce();});
  it('times out without retaining listeners',async()=>{vi.useFakeTimers();try{const f=fake(),pending=new WordTemplateAnalysisService(f.factory).analyze(wordTemplateFixture(),'Template','id'),check=expect(pending).rejects.toThrow(/30 秒/);await vi.advanceTimersByTimeAsync(30000);await check;expect(f.worker.eventNames()).toEqual([]);expect(f.worker.terminate).toHaveBeenCalledOnce();}finally{vi.useRealTimers();}});
  it.each(['error','exit'])('cleans up worker %s failures',async event=>{const f=fake(),pending=new WordTemplateAnalysisService(f.factory).analyze(wordTemplateFixture(),'Template','id'),check=expect(pending).rejects.toThrow(/退出/);f.worker.emit(event,new Error('crash'));await check;expect(f.worker.terminate).toHaveBeenCalledOnce();});
  it('does not start a worker after cancellation',async()=>{const f=fake(),controller=new AbortController();controller.abort();await expect(new WordTemplateAnalysisService(f.factory).analyze(wordTemplateFixture(),'Template','id',controller.signal)).rejects.toThrow(/取消/);expect(f.getData()).toBeUndefined();});
});
