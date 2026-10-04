import { unzipSync, strFromU8 } from 'fflate';
import { type TemplateCandidate, type WordTemplateProfile } from '../../shared/wordTemplate';
import { attr, child, children, elements, make, mergeProperties, parseXml, R, resolvePart, serialize, text, W } from './WordXml';
import type { Element } from '@xmldom/xmldom';
import { formatFingerprint, noiseAllowance, recognizeTemplate, type ParagraphEvidence } from './WordTemplateRecognition';

export type TemplateParts = Record<string, Uint8Array>;
export function readTemplate(bytes: Uint8Array): TemplateParts {
  if (bytes.length > 25 * 1024 * 1024) throw new Error('模板超过 25 MB，请使用较小的 DOCX 或 DOTX。');
  // Check central-directory sizes before allocating decompressed data.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0, count = 0;
  for (let i = 0; i + 46 <= bytes.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    total += view.getUint32(i + 24, true); count++;
    if (total > 100 * 1024 * 1024 || count > 4000) throw new Error('模板解压后过大，无法安全分析。');
    i += 45 + view.getUint16(i + 28, true) + view.getUint16(i + 30, true) + view.getUint16(i + 32, true);
  }
  if (!count) throw new Error('请选择有效的 DOCX 或 DOTX，旧版 DOC 不受支持。');
  let actualTotal = 0, actualCount = 0;
  const parts = unzipSync(bytes, { filter: file => { actualTotal += file.originalSize; actualCount++; if (actualTotal > 100 * 1024 * 1024 || actualCount > 4000) throw new Error('模板解压后过大，无法安全分析。'); return true; } });
  if (!parts['word/document.xml'] || !parts['[Content_Types].xml']) throw new Error('模板缺少 Word 文档部件。');
  if (Object.keys(parts).some(p => /vbaProject|activeX|embeddings\//i.test(p))) throw new Error('模板含宏、ActiveX 或嵌入对象，请先另存为普通 DOCX 并移除这些对象。');
  for (const [path, data] of Object.entries(parts)) {
    if (/(?:^|\/)\.\.(?:\/|$)|^[/\\]|\\/.test(path)) throw new Error('模板包含无效部件路径。');
    if (/\.xml$|\.rels$/.test(path)) parseXml(strFromU8(data));
  }
  const doc = parseXml(strFromU8(parts['word/document.xml']));
  if (doc.documentElement?.namespaceURI !== W) throw new Error('暂不支持 Strict OOXML；请在 Word 中另存为普通 DOCX。');
  const rels = parts['word/_rels/document.xml.rels'] ? parseXml(strFromU8(parts['word/_rels/document.xml.rels'])) : undefined;
  const refs = [...elements(doc,'headerReference'), ...elements(doc,'footerReference')];
  for (const ref of refs) {
    const id = ref.getAttributeNS(R,'id'), relationship = rels && children(rels.documentElement!).find(n=>n.getAttribute('Id') === id);
    if (!relationship || relationship.getAttribute('TargetMode') === 'External' || !parts[resolvePart('word/document.xml',relationship.getAttribute('Target') || '')]) throw new Error('模板页眉页脚关系损坏或引用外部文件，无法可靠保留。');
  }
  return parts;
}
const raw = (node: Element | undefined) => node ? serialize(node) : undefined;
function summary(p: string, r: string): string {
  const pp = parseXml(p).documentElement!, rp = parseXml(r).documentElement!;
  const fonts = child(rp, 'rFonts'), spacing = child(pp, 'spacing'), ind = child(pp, 'ind');
  const v = (node: Element | undefined, key: string) => attr(node, key);
  const line = v(spacing, 'line'), rule = v(spacing, 'lineRule');
  return [v(fonts, 'eastAsia') && `中文 ${v(fonts, 'eastAsia')}`, (v(fonts, 'ascii') || v(fonts, 'hAnsi')) && `西文 ${v(fonts, 'ascii') || v(fonts, 'hAnsi')}`,
    v(child(rp, 'sz'), 'val') && `${Number(attr(child(rp, 'sz'))) / 2} pt`,
    child(rp, 'b') && attr(child(rp, 'b')) !== '0' && '加粗',
    line && `行距 ${rule === 'auto' || !rule ? `${(Number(line) / 240).toFixed(2)} 倍` : `${Number(line) / 20} pt（${rule === 'exact' ? '固定' : '最小'}）`}`,
    `段前 ${Number(v(spacing, 'before') || 0) / 20} / 段后 ${Number(v(spacing, 'after') || 0) / 20} pt`,
    (v(ind, 'firstLineChars') || v(ind, 'firstLine')) && `首行 ${v(ind, 'firstLineChars') ? `${Number(v(ind, 'firstLineChars')) / 100} 字` : `${Number(v(ind, 'firstLine')) / 20} pt`}`,
    ({ both: '两端对齐', center: '居中', right: '右对齐', left: '左对齐', distribute: '分散对齐' } as Record<string, string>)[attr(child(pp, 'jc'))],
    child(pp, 'pageBreakBefore') && attr(child(pp, 'pageBreakBefore')) !== '0' && '段前分页', child(pp, 'keepNext') && '与下段同页'
  ].filter(Boolean).join(' · ') || '继承 Word 默认格式（需确认）';
}

export function analyzeWordTemplate(bytes: Uint8Array, name: string, id: string): WordTemplateProfile {
  const parts = readTemplate(bytes), doc = parseXml(strFromU8(parts['word/document.xml']));
  const styles = parts['word/styles.xml'] ? parseXml(strFromU8(parts['word/styles.xml'])) : parseXml(`<w:styles xmlns:w="${W}"/>`);
  const definitions = new Map(elements(styles, 'style').map(s => [attr(s, 'styleId'), s]));
  const defaults = elements(styles, 'docDefaults')[0];
  const defaultP = raw(defaults && child(child(defaults, 'pPrDefault'), 'pPr'));
  const defaultR = raw(defaults && child(child(defaults, 'rPrDefault'), 'rPr'));
  const warnings: string[] = [];
  const theme = parts['word/theme/theme1.xml'] ? parseXml(strFromU8(parts['word/theme/theme1.xml'])) : undefined;
  const themeFonts = (fragment: string): string => {
    if (!theme) return fragment;
    const doc = parseXml(fragment), fonts = elements(doc, 'rFonts')[0];
    if (!fonts) return fragment;
    for (const [key, themed] of [['ascii','asciiTheme'],['hAnsi','hAnsiTheme'],['eastAsia','eastAsiaTheme'],['cs','cstheme']]) {
      const value = attr(fonts, themed); if (!value) continue;
      const group = Array.from(theme.getElementsByTagName('*')).find(n => n.localName === (value.startsWith('major') ? 'majorFont' : 'minorFont'));
      const font = group && Array.from(group.childNodes).filter((n): n is Element => n.nodeType === 1).find(n => n.localName === (key === 'eastAsia' ? 'ea' : key === 'cs' ? 'cs' : 'latin'));
      let face = font?.getAttribute('typeface');
      if (!face && key === 'eastAsia' && group) face = Array.from(group.getElementsByTagName('*')).find(n => n.getAttribute('script') === 'Hans')?.getAttribute('typeface');
      if (face) { fonts.setAttributeNS(W, `w:${key}`, face); fonts.removeAttributeNS(W, themed); }
    }
    return serialize(doc.documentElement!);
  };
  const baseFormat = { p: mergeProperties('pPr',[defaultP]), r: themeFonts(mergeProperties('rPr',[defaultR])) };
  const effectiveCache = new Map<string, typeof baseFormat>();
  const effective = (styleId: string): typeof baseFormat => {
    const path: string[] = [], seen = new Set<string>(); let current = styleId;
    while (definitions.has(current) && !effectiveCache.has(current) && !seen.has(current)) {
      seen.add(current); path.push(current); current = attr(child(definitions.get(current), 'basedOn'));
    }
    if(seen.has(current) && !warnings.includes('样式继承存在循环；相关映射需确认。')) warnings.push('样式继承存在循环；相关映射需确认。');
    let base = effectiveCache.get(current) || baseFormat;
    for(const key of path.reverse()) {
      const s=definitions.get(key)!;
      base={p:mergeProperties('pPr',[base.p,raw(child(s,'pPr'))]),r:themeFonts(mergeProperties('rPr',[base.r,raw(child(s,'rPr'))]))}; effectiveCache.set(key,base);
    }
    return effectiveCache.get(styleId) || baseFormat;
  };
  const candidates: TemplateCandidate[] = [];
  for (const [styleId, s] of definitions) {
    if (attr(s, 'type') !== 'paragraph') continue;
    const fmt = effective(styleId);
    candidates.push({ id: `style:${styleId}`, name: attr(child(s, 'name')) || styleId, styleId, source: 'style', count: 0, sample: '', paragraph: fmt.p, run: fmt.r, summary: summary(fmt.p, fmt.r) });
  }
  const defaultStyle = [...definitions].find(([, s]) => attr(s, 'default') === '1' && attr(s, 'type') === 'paragraph')?.[0] || 'Normal';
  const paragraphs = elements(doc, 'p').filter(p => text(p).trim());
  const styleCandidates = new Map(candidates.map(c=>[c.styleId,c]));
  const observations: ParagraphEvidence[] = [];
  const fingerprints = new Map<string, ReturnType<typeof formatFingerprint>>();
  const fingerprint = (p:string,r:string,tolerant=false) => { const key=`${tolerant}|${p}|${r}`; let result=fingerprints.get(key); if(!result){result=formatFingerprint(p,r,tolerant);fingerprints.set(key,result);}return result; };
  const clusters = new Map<string,{ candidate:TemplateCandidate; min:Record<string,number>; max:Record<string,number>; variants:Map<string,{p:string;r:string;count:number}> }[]>();
  const runCache = new Map<string,string>(), paragraphCache = new Map<string,string>();
  const numbering = parts['word/numbering.xml'] ? parseXml(strFromU8(parts['word/numbering.xml'])) : undefined;
  const numberIds = new Map((numbering ? elements(numbering,'num') : []).map(n=>[attr(n,'numId'),attr(child(n,'abstractNumId'))]));
  const abstracts = new Map((numbering ? elements(numbering,'abstractNum') : []).map(n=>[attr(n,'abstractNumId'),n]));
  for (const [index,p] of paragraphs.entries()) {
    let tableParagraph = false;
    for (let parent = p.parentNode; parent; parent = parent.parentNode) if (parent.nodeType === 1 && ['tbl','txbxContent'].includes((parent as Element).localName!)) tableParagraph = true;
    const pp = child(p, 'pPr'), styleId = attr(child(pp, 'pStyle')) || defaultStyle;
    const styled = styleCandidates.get(styleId);
    const base = effective(styleId), directP = pp?.cloneNode(true) as Element | undefined;
    if (directP) { for (const n of children(directP)) if (['pStyle', 'sectPr', 'rPr', 'pPrChange'].includes(n.localName!)) directP.removeChild(n); }
    // A dominant run sample avoids a single bold word becoming the body font.
    const runs = elements(p, 'r').filter(n => text(n).length);
    const groups = new Map<string, { weight: number; r: string }>();
    const fontVotes = new Map<string, Map<string, number>>();
    for (const run of runs) {
      const rp = child(run, 'rPr'), charStyle = attr(child(rp, 'rStyle'));
      const keyR=base.r+'|'+charStyle+'|'+raw(rp);
      let fmt=runCache.get(keyR); if(!fmt){fmt=themeFonts(mergeProperties('rPr',[base.r,charStyle?effective(charStyle).r:undefined,raw(rp)]));runCache.set(keyR,fmt);}
      const key = fmt, g = groups.get(key) || { weight: 0, r: fmt }; g.weight += text(run).length; groups.set(key, g);
      const fonts = elements(parseXml(fmt), 'rFonts')[0], value = text(run);
      for (const name of ['eastAsia', 'ascii', 'hAnsi']) {
        const weight = name === 'eastAsia' ? (value.match(/[\u3400-\u9fff]/g) || []).length : (value.match(/[A-Za-z]/g) || []).length;
        const face = attr(fonts, name); if (!weight || !face) continue;
        const votes = fontVotes.get(name) || new Map<string, number>(); votes.set(face, (votes.get(face) || 0) + weight); fontVotes.set(name, votes);
      }
    }
    const runDoc = parseXml([...groups.values()].sort((a, b) => b.weight - a.weight)[0]?.r || base.r);
    const fontNode = child(runDoc.documentElement!, 'rFonts') || make(runDoc, 'rFonts');
    for (const [name, votes] of fontVotes) fontNode.setAttributeNS(W, `w:${name}`, [...votes].sort((a,b) => b[1] - a[1])[0][0]);
    if (!fontNode.parentNode && fontVotes.size) runDoc.documentElement!.insertBefore(fontNode, runDoc.documentElement!.firstChild);
    const fmtR = serialize(runDoc.documentElement!);
    const keyP=base.p+'|'+raw(directP); let fmtP=paragraphCache.get(keyP); if(!fmtP){fmtP=mergeProperties('pPr',[base.p,raw(directP)]);paragraphCache.set(keyP,fmtP);}
    let sample:TemplateCandidate;
    if(styled && fingerprint(fmtP,fmtR).key===fingerprint(base.p,base.r).key) sample=styled;
    else {
      const fp=fingerprint(fmtP,fmtR,true), groupKey=styleId+'|'+fp.key, list=clusters.get(groupKey)||[];
      let cluster=list.find(c=>Object.entries(fp.numeric).every(([k,v])=>Math.max(c.max[k],v)-Math.min(c.min[k],v)<=noiseAllowance(k)));
      if(!cluster) {
        const number=candidates.length+1;
        sample={id:`sample:${number}`,name:`段落格式 ${number}`,source:'sample',styleId:definitions.has(styleId)?styleId:undefined,sample:'',count:0,paragraph:fmtP,run:fmtR,summary:summary(fmtP,fmtR)};
        candidates.push(sample); cluster={candidate:sample,min:{...fp.numeric},max:{...fp.numeric},variants:new Map()};list.push(cluster);clusters.set(groupKey,list);
        if(candidates.length>1500) throw new Error('模板中格式种类过多，请先简化文档。');
      }
      sample=cluster.candidate;
      for(const [k,v] of Object.entries(fp.numeric)){cluster.min[k]=Math.min(cluster.min[k],v);cluster.max[k]=Math.max(cluster.max[k],v);}
      const signature=fmtP+'|'+fmtR, variant=cluster.variants.get(signature)||{p:fmtP,r:fmtR,count:0};variant.count++;cluster.variants.set(signature,variant);
    }
    sample.count++;
    sample.sample ||= text(p).slice(0,100);
    if (!tableParagraph) sample.bodyCount = (sample.bodyCount || 0) + 1;
    sample.examples ||= [sample.sample];
    if (sample.examples.length < 8 && !sample.examples.includes(text(p).slice(0, 100))) sample.examples.push(text(p).slice(0, 100));
    const num=child(parseXml(fmtP).documentElement!,'numPr'), ilvl=Number(attr(child(num,'ilvl'))), abstract=abstracts.get(numberIds.get(attr(child(num,'numId'))) || '');
    const validNumber=abstract && elements(abstract,'lvl').some(n=>Number(attr(n,'ilvl'))===ilvl && !['none','bullet'].includes(attr(child(n,'numFmt'))));
    observations.push({candidateId:sample.id,value:text(p),index,table:tableParagraph,styleId,autoLevel:validNumber?ilvl:undefined});
  }
  for(const list of clusters.values()) for(const cluster of list) {
    const variants=[...cluster.variants.values()], median:Record<string,number>={};
    for(const key of Object.keys(cluster.min)) {const values=variants.map(v=>fingerprint(v.p,v.r,true).numeric[key]).sort((a,b)=>a-b);median[key]=values[Math.floor(values.length/2)];}
    const distance=(v:typeof variants[number])=>Object.entries(fingerprint(v.p,v.r,true).numeric).reduce((sum,[k,n])=>sum+Math.abs(n-median[k])/noiseAllowance(k),0);
    const representative=variants.sort((a,b)=>b.count-a.count || distance(a)-distance(b))[0];
    cluster.candidate.paragraph=representative.p;cluster.candidate.run=representative.r;cluster.candidate.summary=summary(representative.p,representative.r);
  }
  if (!candidates.length) throw new Error('模板没有可识别的段落或样式，请导入带有正文样本的 Word 文档。');
  if (candidates.length > 1500) throw new Error('模板中格式种类过多，请先简化文档。');
  const mappings = recognizeTemplate(candidates, observations, warnings);
  const sections = elements(doc, 'sectPr'), section = sections.at(-1);
  const pg = child(section, 'pgSz'), mar = child(section, 'pgMar');
  const n = (node: Element | undefined, name: string, fallback: number) => { const v = Number(attr(node, name)); return v > 0 ? v : fallback; };
  const page = { width: n(pg, 'w', 11906), height: n(pg, 'h', 16838), top: attr(mar, 'top') ? Number(attr(mar, 'top')) : 1440, right: attr(mar, 'right') ? Number(attr(mar, 'right')) : 1440, bottom: attr(mar, 'bottom') ? Number(attr(mar, 'bottom')) : 1440, left: attr(mar, 'left') ? Number(attr(mar, 'left')) : 1440, summary: '' };
  if (page.width - page.left - page.right < 720 || page.height - page.top - page.bottom < 720) throw new Error('模板页面可用区域过小，无法可靠导出。');
  const mm = (v: number) => (v * 25.4 / 1440).toFixed(1);
  const gutter = parts['word/settings.xml'] && /gutterAtTop/.test(strFromU8(parts['word/settings.xml'])) ? 0 : Math.max(0, Number(attr(mar,'gutter') || 0));
  if (page.width - page.left - page.right - gutter < 720) throw new Error('模板装订线使正文区域过小，无法可靠导出。');
  page.summary = `${mm(page.width)} × ${mm(page.height)} mm · ${page.width > page.height ? '横向' : '纵向'} · 页边距 上 ${mm(page.top)} / 右 ${mm(page.right)} / 下 ${mm(page.bottom)} / 左 ${mm(page.left)} mm`;
  if (!pg || !mar) warnings.push('页面大小或页边距未完整定义，缺失部分采用 A4 / 25.4 mm。');
  if (gutter) page.summary += ` · 装订线 ${mm(gutter)} mm`;
  if (sections.length > 1) warnings.push('存在多个分节：本轮统一采用末节页面规则和继承的页眉页脚；特殊封面和分节内容不会复制。');
  if (elements(doc, 'cols').some(c => Number(attr(c, 'num') || 1) > 1 || elements(c, 'col').length > 1)) warnings.push('多栏版式无法可靠映射，导出将使用单栏。');
  if (/txbxContent|<[^>]*:anchor\b|graphicData[^>]*diagram|<[^>]*:pict\b/.test(strFromU8(parts['word/document.xml']))) warnings.push('正文含文本框、浮动对象、SmartArt 或特殊封面：仅提取版式，不复制这些正文对象。');
  if (elements(doc, 'sdt').length || elements(doc, 'altChunk').length) warnings.push('内容控件或外部内容块不能可靠映射；不会复制原模板正文内容。');
  if (elements(doc, 'ins').length || elements(doc, 'del').length) warnings.push('存在修订记录，直接格式识别可能包含修订内容，请确认映射。');
  if (!parts['word/styles.xml']) warnings.push('缺少样式定义；主要依靠段落样本识别，标题层级需人工确认。');
  if (Object.values(mappings).some(m => m.candidateId && candidates.find(c => c.id === m.candidateId)?.source === 'sample')) warnings.push('部分规则来自直接格式样本；样本不能证明它们适用于所有同类段落，请核对映射。');
  const runningMatter: string[] = [];
  for (const [path, bytes] of Object.entries(parts)) {
    if (!/^word\/(header|footer)[^/]*\.xml$/.test(path)) continue;
    const part = parseXml(strFromU8(bytes)), value = text(part.documentElement!);
    if (/\b(?:REF|PAGEREF|DOCPROPERTY|INCLUDETEXT|TOC)\b/.test(strFromU8(bytes))) warnings.push('页眉页脚包含依赖原正文、书签或文档属性的字段；字段将保留，导出后需要在 Word 中核对。');
    runningMatter.push(`${path.includes('/header') ? '页眉' : '页脚'}：${value.slice(0, 100) || '（空白或对象）'}${/\bPAGE\b/.test(strFromU8(bytes)) ? ' · 保留原生页码字段' : ''}`);
  }
  if (section && child(section, 'titlePg')) runningMatter.push('首页不同：保留首页页眉页脚规则');
  if (parts['word/settings.xml'] && /evenAndOddHeaders/.test(strFromU8(parts['word/settings.xml']))) runningMatter.push('奇偶页不同：保留原规则');
  const tables = elements(doc, 'tbl'), tableStyle = tables[0] && attr(child(child(tables[0], 'tblPr'), 'tblStyle'));
  const tableSignatures = new Set(tables.map(t => {
    const properties=[child(t,'tblPr'),...children(t).filter(n=>n.localName==='tr').slice(0,2).flatMap(row=>elements(row,'tcPr'))].filter((n):n is Element=>!!n);
    return properties.map(n=>{const clone=n.cloneNode(true) as Element;for(const prop of children(clone))if(['tblW','tblLayout','tcW','gridSpan','vMerge','hMerge','tblCaption'].includes(prop.localName!))clone.removeChild(prop);return serialize(clone);}).join('|');
  }));
  if(tableSignatures.size>1) warnings.push('存在多套表格规则：导出统一采用首个表格的外观，不会自动按用途区分。');
  const styleCount = [...definitions.values()].filter(s => attr(s, 'type') === 'table').length;
  return { version: 1, analysisRevision: 2, id, name, confirmed: false, warningsAccepted: false, candidates, mappings, page: { ...page, gutter }, runningMatter: runningMatter.length ? runningMatter : ['模板未设置页眉页脚，导出保持空白'], tableSummary: tables.length ? `保留首个表格的${tableStyle ? ` ${tableStyle} 样式、` : ''}边框、底纹和单元格规则（${styleCount} 个表格样式）` : '没有表格样本；使用基础可编辑表格，表格风格未确认', warnings: [...new Set(warnings)] };
}
