import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteFile } from '../files/atomicWrite';
import { analyzeWordTemplate } from '../../document/templates/WordTemplateAnalyzer';
import { formatFingerprint } from '../../document/templates/WordTemplateRecognition';
import type { TemplateAnalyzer } from './WordTemplateAnalysisService';
import type { WordTemplateExport } from '../../document/templates/WordTemplateRenderer';
import { TEMPLATE_ROLES, type TemplateConfirmation, type TemplateLibrary, type TemplateRole, type WordTemplateProfile } from '../../shared/wordTemplate';

export class WordTemplateStore {
  private drafts = new Map<string, WordTemplateExport>();
  private replacements = new Map<string, string>();
  constructor(private readonly folder: string, private readonly analyze:TemplateAnalyzer=async(bytes,name,id)=>analyzeWordTemplate(bytes,name,id)) {}
  async import(bytes: Uint8Array, name: string, signal?:AbortSignal): Promise<WordTemplateProfile> {
    const profile = await this.analyze(bytes, name, randomUUID(),signal);
    if(signal?.aborted)throw new Error('模板分析已取消。');
    // Keep canceled imports bounded and in memory only.
    if (this.drafts.size >= 8) this.discardDraft(this.drafts.keys().next().value!);
    this.drafts.set(profile.id, { profile, bytes }); return profile;
  }
  discardDraft(id:string):void { this.drafts.delete(id);this.replacements.delete(id); }
  async reanalyze(id:string,signal?:AbortSignal):Promise<WordTemplateProfile> {
    const original=await this.get(id);
    if(!original.profile.confirmed)throw new Error('请先保存模板，再重新识别。');
    const profile=await this.import(original.bytes,original.profile.name,signal);
    try {
      const suggestions=structuredClone(profile.mappings), previous=structuredClone(original.profile.mappings);
      const fingerprints=new Map(profile.candidates.map(c=>[formatFingerprint(c.paragraph,c.run).key,c]));
      for(const role of Object.keys(TEMPLATE_ROLES) as TemplateRole[]) {
        const mapping=previous[role], old=original.profile.candidates.find(c=>c.id===mapping.candidateId);
        let equivalent=old && fingerprints.get(formatFingerprint(old.paragraph,old.run).key);
        if(old && !equivalent) {
          equivalent={...structuredClone(old),id:`retained:${old.id}`,name:`原已确认 · ${old.name}`};profile.candidates.push(equivalent);
          fingerprints.set(formatFingerprint(old.paragraph,old.run).key,equivalent);
        }
        profile.mappings[role]={...mapping,candidateId:equivalent?.id || null,alternatives:suggestions[role].alternatives,needsConfirmation:false,confirmedByUser:true};
      }
      if(profile.candidates.length>1500)throw new Error('保留已确认格式后候选超过上限，原模板未改变。');
      profile.review={originalId:id,previous,suggestions};this.replacements.set(profile.id,id);
      return profile;
    } catch(error){this.discardDraft(profile.id);throw error;}
  }
  private path(id: string): string { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('模板标识无效。'); return join(this.folder, `${id}.json`); }
  async get(id: string): Promise<WordTemplateExport> {
    const draft = this.drafts.get(id); if (draft) return draft;
    let value: { profile: WordTemplateProfile; source: string };
    try { value = JSON.parse(await readFile(this.path(id), 'utf8')); }
    catch { throw new Error('模板无法读取，请重新导入。'); }
    if (value.profile?.version !== 1 || value.profile.id !== id || !value.profile.confirmed || typeof value.source !== 'string' || value.source.length > 36 * 1024 * 1024) throw new Error('模板数据版本无效或已损坏，请重新导入。');
    const p = value.profile;
    if(p.analysisRevision!==undefined && (!Number.isInteger(p.analysisRevision) || p.analysisRevision<1) || p.review!==undefined)throw new Error('模板数据已损坏，请重新导入。');
    if(p.mappings && Object.values(p.mappings).some(m=>!m || typeof m.reason!=='string' || !['high','medium','low'].includes(m.confidence) || m.example!==undefined && typeof m.example!=='string' || m.needsConfirmation!==undefined && typeof m.needsConfirmation!=='boolean' || m.confirmedByUser!==undefined && typeof m.confirmedByUser!=='boolean' || m.alternatives!==undefined && (!Array.isArray(m.alternatives) || m.alternatives.length>5 || m.alternatives.some(id=>typeof id!=='string' || !Array.isArray(p.candidates) || !p.candidates.some(c=>c.id===id)))))throw new Error('模板数据已损坏，请重新导入。');
    if (typeof p.name !== 'string' || !p.name.trim() || !Array.isArray(p.candidates) || p.candidates.length > 1500 || p.candidates.some(c => !c || typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.paragraph !== 'string' || typeof c.run !== 'string' || typeof c.summary !== 'string' || typeof c.sample !== 'string') || !p.mappings || Object.keys(TEMPLATE_ROLES).some(role => { const m = p.mappings[role as TemplateRole]; return !m || m.candidateId !== null && !p.candidates.some(c => c.id === m.candidateId); }) || !p.page || !['width','height','top','right','bottom','left'].every(key=>Number.isFinite(p.page[key as 'width'])) || typeof p.page.summary !== 'string' || !Array.isArray(p.warnings) || p.warnings.some(w=>typeof w !== 'string') || !Array.isArray(p.runningMatter) || p.runningMatter.some(w=>typeof w !== 'string') || typeof p.tableSummary !== 'string' || typeof p.warningsAccepted !== 'boolean') throw new Error('模板数据已损坏，请重新导入。');
    return { profile: value.profile, bytes: Buffer.from(value.source, 'base64') };
  }
  async list(): Promise<TemplateLibrary> {
    await mkdir(this.folder, { recursive: true });
    const templates: WordTemplateProfile[] = [];
    for (const name of await readdir(this.folder)) if (/^[a-f0-9-]{36}\.json$/.test(name)) templates.push((await this.get(name.slice(0, -5))).profile);
    let defaultId: string | null = null;
    try { defaultId = JSON.parse(await readFile(join(this.folder, 'default.json'), 'utf8')).id; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('默认模板设置已损坏，请重新选择默认模板。'); }
    return { templates: templates.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')), defaultId: templates.some(t => t.id === defaultId) ? defaultId : null };
  }
  async confirm(input: TemplateConfirmation): Promise<WordTemplateProfile> {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || !input.mappings || typeof input.warningsAccepted !== 'boolean' || typeof input.makeDefault !== 'boolean') throw new Error('模板确认信息无效。');
    const template = await this.get(input.id), profile = structuredClone(template.profile);
    if(input.confirmedRoles!==undefined && (!Array.isArray(input.confirmedRoles) || input.confirmedRoles.some(r=>!(r in TEMPLATE_ROLES))))throw new Error('模板逐项确认信息无效。');
    for (const role of Object.keys(TEMPLATE_ROLES) as TemplateRole[]) {
      const candidateId = input.mappings[role];
      if (candidateId !== null && !profile.candidates.some(c => c.id === candidateId)) throw new Error('请选择模板中已有的样式或段落格式。');
      const current=profile.mappings[role], suggested=profile.review?.suggestions[role];
      const requires=current.needsConfirmation || suggested?.needsConfirmation && candidateId!==current.candidateId;
      if(requires && !input.confirmedRoles?.includes(role))throw new Error(`请单独确认${TEMPLATE_ROLES[role]}的格式冲突。`);
      profile.mappings[role] = { ...current, candidateId, example: candidateId===current.candidateId?current.example:candidateId===suggested?.candidateId?suggested.example:profile.candidates.find(c=>c.id===candidateId)?.sample, confidence: candidateId ? 'high' : 'low', needsConfirmation:false, confirmedByUser:true, reason: candidateId ? '已由用户确认映射。' : '用户确认使用基础版式或继承正文。' };
    }
    if (!input.mappings.body) throw new Error('请确认一个正文样式或段落格式。');
    if (profile.warnings.length && !input.warningsAccepted) throw new Error('请先阅读并确认模板兼容性提示。');
    profile.name = input.name.trim(); profile.confirmed = true; profile.warningsAccepted = input.warningsAccepted;
    const replacement=this.replacements.get(input.id);
    if(replacement){ if(!(await this.get(replacement)).profile.confirmed)throw new Error('原模板已移除，请重新导入。');profile.id=replacement; }
    delete profile.review;
    await mkdir(this.folder, { recursive: true });
    await atomicWriteFile(this.path(profile.id), Buffer.from(JSON.stringify({ profile, source: Buffer.from(template.bytes).toString('base64') })));
    this.discardDraft(input.id);
    if (input.makeDefault) await this.setDefault(profile.id);
    else if ((await this.list()).defaultId === profile.id) await this.setDefault(null);
    return profile;
  }
  async remove(id: string): Promise<void> {
    this.discardDraft(id);
    for(const [draft,original] of this.replacements)if(original===id)this.discardDraft(draft);
    try { await unlink(this.path(id)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    // list() also filters a stale default after a crash between these writes.
    const current = await this.list(); if (!current.defaultId) await this.setDefault(null);
  }
  async setDefault(id: string | null): Promise<void> {
    if (id !== null && !(await this.get(id)).profile.confirmed) throw new Error('请先保存并确认模板。');
    await mkdir(this.folder, { recursive: true }); await atomicWriteFile(join(this.folder, 'default.json'), Buffer.from(JSON.stringify({ id })));
  }
}
