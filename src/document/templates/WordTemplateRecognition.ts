import { TEMPLATE_ROLES, type TemplateCandidate, type TemplateMapping, type TemplateRole } from '../../shared/wordTemplate';
import { attr, child, children, parseXml, W } from './WordXml';
import type { Element } from '@xmldom/xmldom';

export interface ParagraphEvidence {
  candidateId: string; value: string; index: number; table: boolean;
  styleId: string; autoLevel?: number;
}
export interface FormatFeatures {
  size: number; bold: boolean; font: string; align: string; outline: number | undefined;
  keep: boolean; left: number; right: number; hanging: number; before: number; numbered: boolean;
}
export function features(c: TemplateCandidate): FormatFeatures {
  const p = parseXml(c.paragraph).documentElement!, r = parseXml(c.run).documentElement!;
  const ind = child(p, 'ind'), outline = child(p, 'outlineLvl');
  return { size: Number(attr(child(r, 'sz'))) / 2, bold: !!child(r, 'b') && !/^(0|false|off)$/.test(attr(child(r, 'b'))),
    font: attr(child(r, 'rFonts'), 'eastAsia') || attr(child(r, 'rFonts'), 'ascii'), align: attr(child(p, 'jc')),
    outline: outline ? Number(attr(outline)) : undefined, keep: !!child(p, 'keepNext'),
    left: Number(attr(ind, 'left')), right: Number(attr(ind, 'right')), hanging: Number(attr(ind, 'hanging')),
    before: Number(attr(child(p, 'spacing'), 'before')), numbered: !!child(p, 'numPr') };
}

/** Namespace/order independent fingerprints. Numeric noise is bounded by the whole cluster diameter. */
export function formatFingerprint(paragraph: string, run: string, tolerant = false): { key: string; numeric: Record<string, number> } {
  const numeric: Record<string, number> = {};
  const visit = (node: Element, path: string): string => {
    const attrs = Array.from(node.attributes).filter(a => a.namespaceURI !== 'http://www.w3.org/2000/xmlns/').map(a => {
      const name = a.localName || a.name, key = `${path}/${name}`;
      const allowance = node.localName === 'spacing' && ['before','after','line'].includes(name) ? 10 : node.localName === 'ind' && ['left','right','firstLine','hanging'].includes(name) ? 2 : 0;
      if (tolerant && a.namespaceURI === W && allowance && /^-?\d+$/.test(a.value)) { numeric[key] = Number(a.value); return `${a.namespaceURI}:${name}=#`; }
      return `${a.namespaceURI}:${name}=${a.value}`;
    }).sort();
    return `${node.namespaceURI}:${node.localName}[${attrs.join('|')}](${children(node).filter(n => !['pStyle','rStyle'].includes(n.localName!)).map(n => visit(n, `${path}/${n.localName}`)).sort().join(';')})`;
  };
  return { key: visit(parseXml(paragraph).documentElement!, 'p') + visit(parseXml(run).documentElement!, 'r'), numeric };
}
export function noiseAllowance(key: string): number { return key.includes('/ind/') ? 2 : 10; }

const caption = (s: string) => /^\s*(?:图\s*\d|Figure\s*\d|表\s*\d|Table\s*\d)/i.test(s);
const instruction = (s: string) => /(?:要求|应使用|请使用|需使用|应显示).*(?:字体|体|号|行距|缩进|标题|章节|页眉|页脚)|(?:正文|标题|图题|表题).*(?:要求|用).*(?:体|号|磅|居中)|字体.*(?:要求|Times New Roman)/i.test(s);
const note = (s: string) => /^(?:使用说明|说明|注[：: ]|注意|模板说明|填写说明|报告的重要说明)/.test(s);
function manualLevel(s: string): number | undefined {
  const decimal = s.match(/^\s*(\d+(?:\.\d+)*)(?:[.．、]\s*|\s+)(?=\D)/);
  if (decimal) return Math.min(6, decimal[1].split('.').length);
  if (/^\s*(?:第[\d一二三四五六七八九十百]+章|[一二三四五六七八九十百]+[、．.])/.test(s)) return 1;
  if (/^\s*[（(][一二三四五六七八九十]+[）)]\.\d/.test(s)) return 2;
  if (/^\s*[（(][一二三四五六七八九十]+[）)]/.test(s)) return 1;
  if (/^\s*[IVXLCDM]+[.)、]\s+/i.test(s)) return 1;
  if (/^\s*[A-Z][.)、]\s+/i.test(s)) return 2;
  return undefined;
}

export function recognizeTemplate(candidates: TemplateCandidate[], observations: ParagraphEvidence[], warnings: string[]): Record<TemplateRole, TemplateMapping> {
  const formats = new Map(candidates.map(c => [c.id, features(c)]));
  const byId = new Map(candidates.map(c => [c.id, c]));
  const evidence = new Map<string, ParagraphEvidence[]>();
  for (const o of observations) { const list = evidence.get(o.candidateId) || []; list.push(o); evidence.set(o.candidateId, list); }
  const named = (rx: RegExp) => candidates.filter(c => c.source === 'style' && rx.test(`${c.name} ${c.styleId}`));
  const namedHeading = (c: TemplateCandidate) => /heading|标题|title|caption|图题|表题|页眉|页脚|header|footer|引用|quote|list|列表|代码|code|公式|equation/i.test(c.name);
  const proseScore = (c: TemplateCandidate): number => (evidence.get(c.id) || []).reduce((sum, o) => {
    const f = formats.get(c.id)!;
    if (o.table || caption(o.value) || instruction(o.value) || note(o.value) || namedHeading(c) || f.outline !== undefined || f.hanging || f.numbered || manualLevel(o.value) || f.align === 'center' && o.value.length < 100 || f.bold && f.keep) return sum;
    return sum + Math.min(300, o.value.length) * (/[。；.!?]/.test(o.value) ? 2 : 1);
  }, 0);
  const bodies = candidates.map(c => ({ c, score: proseScore(c) })).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
  const namedBody = named(/^(normal|正文|body text|bodytext|普通)(\s|$)/i)[0];
  const body = bodies[0]?.c || (observations.length === 0 ? namedBody : undefined);
  const bodyFormat = body ? formats.get(body.id)! : { size: 11, bold: false, font: '', align: '' };
  const result = {} as Record<TemplateRole, TemplateMapping>;
  const set = (role: TemplateRole, c: TemplateCandidate | undefined, confidence: TemplateMapping['confidence'], reason: string, alternatives: TemplateCandidate[] = [], example?: string) => {
    const unique = [...new Set([c?.id, ...alternatives.map(c => c.id)].filter((s): s is string => !!s))].slice(0,5);
    result[role] = { candidateId: c?.id || null, confidence: c ? confidence : 'low', reason,
      example: (example || evidence.get(c?.id || '')?.[0]?.value || c?.sample || '').slice(0,160), alternatives: unique };
  };
  set('body', body, body?.source === 'style' ? 'high' : 'medium', body ? '根据实际正文文字量与段落格式识别；已排除标题、题注和说明。' : '没有实际正文格式证据，请选择已有格式作为正文。', bodies.slice(1,5).map(x=>x.c));
  if (bodies.length > 1 && bodies[1].score >= bodies[0].score * .7 && formatFingerprint(bodies[0].c.paragraph,bodies[0].c.run).key !== formatFingerprint(bodies[1].c.paragraph,bodies[1].c.run).key) {
    result.body.needsConfirmation = true; result.body.confidence = 'low'; result.body.reason = '正文存在两套接近的使用证据，请确认应采用哪套格式。';
  }
  const allOutside = observations.filter(o=>!o.table);
  if (allOutside.length && allOutside.filter(o=>instruction(o.value)).length >= allOutside.length * .6) {
    warnings.push('文档主要用文字描述排版要求，未实际应用对应格式；本轮不解析文字要求，请导入已应用格式的样本。');
    result.body.needsConfirmation = true; result.body.confidence = 'low';
  }
  const titles = candidates.filter(c => formats.get(c.id)!.align === 'center' && formats.get(c.id)!.size >= Math.max(16,bodyFormat.size+3) && (evidence.get(c.id)||[]).some(o=>!o.table && o.index<20 && !caption(o.value))).sort((a,b)=>formats.get(b.id)!.size-formats.get(a.id)!.size);
  const namedTitle = named(/^(title|文档标题|主标题|标题)(\s|$)/i)[0];
  const title = titles[0] || namedTitle;
  set('title', title, title?.source==='style' ? 'high' : 'medium', '根据主标题样式、前部居中位置与字号突出程度识别。', titles.slice(1));
  if (titles.length>1 && formats.get(titles[0].id)!.size===formats.get(titles[1].id)!.size) { result.title.needsConfirmation=true; result.title.confidence='low'; result.title.reason='前部存在多个同样突出的居中格式，请确认主标题。'; }
  if(title && namedTitle && title.id!==namedTitle.id && formatFingerprint(title.paragraph,title.run).key!==formatFingerprint(namedTitle.paragraph,namedTitle.run).key) {
    result.title.needsConfirmation=true;result.title.confidence='low';result.title.alternatives=[...new Set([title.id,namedTitle.id,...(result.title.alternatives||[])])].slice(0,5);result.title.reason='主标题样式与实际样本不一致，请确认。';
  }
  const isHeading = (c: TemplateCandidate, o: ParagraphEvidence) => {
    const f = formats.get(c.id)!;
    return !o.table && !caption(o.value) && !instruction(o.value) && !note(o.value) && c.id!==title?.id && !f.hanging &&
      (f.outline!==undefined || f.size>bodyFormat.size+.5 || f.bold && !bodyFormat.bold && (f.keep || f.before>0 || f.font!==bodyFormat.font));
  };
  const visual = candidates.filter(c=>(evidence.get(c.id)||[]).some(o=>isHeading(c,o))).sort((a,b)=>formats.get(b.id)!.size-formats.get(a.id)!.size || Number(formats.get(b.id)!.bold)-Number(formats.get(a.id)!.bold));
  const ranks = new Map<string,number>(); let rank=0, previous='';
  for(const c of visual) { const f=formats.get(c.id)!, key=`${f.size}|${f.bold}|${f.font}`; if(key!==previous) {rank++; previous=key;} ranks.set(c.id,Math.min(6,rank)); }
  for(let level=1;level<=6;level++) {
    const role=`heading${level}` as TemplateRole, rx=new RegExp(`(?:heading\\s*${level}\\b|标题\\s*${level}\\b|${['一','二','三','四','五','六'][level-1]}级标题)`,'i');
    const explicit=candidates.filter(c=>c.source==='style' && (rx.test(`${c.name} ${c.styleId}`) || formats.get(c.id)!.outline===level-1));
    const scores = candidates.map(c=> {
      const f=formats.get(c.id)!, hits=(evidence.get(c.id)||[]).filter(o=>isHeading(c,o) && (f.outline!==undefined ? f.outline===level-1 : manualLevel(o.value)!==undefined ? manualLevel(o.value)===level : o.autoLevel!==undefined && o.autoLevel>0 ? o.autoLevel===level-1 : ranks.get(c.id)===level));
      return {c,hits,score:hits.length ? 20+Math.min(10,hits.length)+(f.outline===level-1?15:0)+(explicit.includes(c)?5:0):0};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    const chosen=scores[0]?.c || explicit[0];
    const alternatives=[...scores.slice(1).map(x=>x.c),...explicit.filter(c=>c!==chosen)];
    set(role,chosen,chosen?.source==='style' && explicit.includes(chosen) ? 'high':'medium', chosen ? '综合实际段落、大纲、编号及字号字重推断标题层级。':'没有足够标题证据，导出使用基础标题版式。',alternatives,scores[0]?.hits[0]?.value);
    const variants=chosen?.styleId && (explicit.some(c=>c.styleId===chosen.styleId) || formats.get(chosen.id)!.outline!==undefined) ? candidates.filter(c=>c.id!==chosen.id && c.styleId===chosen.styleId && c.count>0 && (evidence.get(c.id)||[]).some(o=>!o.table) && formatFingerprint(c.paragraph,c.run).key!==formatFingerprint(chosen.paragraph,chosen.run).key) : [];
    const contradictory=alternatives.some(c=>formatFingerprint(c.paragraph,c.run).key!==formatFingerprint(chosen!.paragraph,chosen!.run).key);
    if(chosen && (contradictory || variants.length)) {
      result[role].needsConfirmation=true; result[role].confidence='low'; result[role].alternatives=[...new Set([chosen.id,...variants.map(c=>c.id),...alternatives.map(c=>c.id)])].slice(0,5);
      result[role].reason='标题样式与实际段落存在不同格式，无法确定哪套是目标，请确认。';
    }
  }
  const semantic = (rx:RegExp) => {
    const style=named(rx)[0]; if(!style)return undefined;
    return candidates.filter(c=>c.styleId===style.styleId && c.count>0).sort((a,b)=>b.count-a.count)[0] || style;
  };
  for(const [role,rx,label] of [['figureCaption',/figure.*caption|图题|图注|图片标题/i,/^\s*(图\s*\d|Figure\s*\d)/i],['tableCaption',/table.*caption|表题|表注|表格标题/i,/^\s*(表\s*\d|Table\s*\d)/i]] as [TemplateRole,RegExp,RegExp][]) {
    const o=observations.find(o=>label.test(o.value)), c=semantic(rx) || (o && byId.get(o.candidateId)) || semantic(/^(caption|题注)(\s|$)/i);
    set(role,c,c?.source==='style'?'high':'medium','根据独立题注样式或全部段落中的题注文字识别。',[],o?.value);
  }
  for(const [role,rx] of [['quote',/quote|引用/i],['list',/list paragraph|listparagraph|列表/i],['equation',/equation|公式/i],['tableText',/table text|tabletext|表格文字/i],['code',/code|代码/i]] as [TemplateRole,RegExp][]) {
    const explicit=semantic(rx);
    const inferred=role==='list' ? candidates.find(c=>{const f=formats.get(c.id)!;return (evidence.get(c.id)||[]).some(o=>!o.table && (f.hanging>0 || f.numbered && !isHeading(c,o)) && (f.numbered || /^\s*(?:\d+[.)、]|[-•·])\s*/.test(o.value)));}):role==='quote'?candidates.find(c=>{const f=formats.get(c.id)!;return f.left>0 && !f.hanging && (f.right>0 || /引文|引用|“|「/.test(c.sample)) && (evidence.get(c.id)||[]).some(o=>!o.table);}):undefined;
    set(role,explicit||inferred,explicit?'high':'medium',explicit?'根据样式名称识别。':'根据缩进、字体及内容线索建议，请核对。');
  }
  if(warnings.some(w=>w.includes('继承存在循环'))) for(const m of Object.values(result)) if(m.candidateId) {m.confidence='low';m.needsConfirmation=true;m.reason+=' 样式继承异常，需要确认。';}
  for(const role of Object.keys(TEMPLATE_ROLES) as TemplateRole[]) result[role] ||= {candidateId:null,confidence:'low',reason:'没有明确证据。'};
  return result;
}
