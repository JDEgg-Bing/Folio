import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ExportResult } from '../export/ExportAdapter';
import { TEMPLATE_ROLES, type TemplateRole, type WordTemplateProfile } from '../../shared/wordTemplate';
import { readTemplate } from './WordTemplateAnalyzer';
import { attr, child, children, CT, elements, make, mergeProperties, orderProperties, parseXml, PR, R, remove, resolvePart, serialize, W } from './WordXml';
import type { Element } from '@xmldom/xmldom';
import { rebindStyleRef } from './WordTemplateFields';

export interface WordTemplateExport { bytes: Uint8Array; profile: WordTemplateProfile }
/** Keep native template parts and replace only the main story with editable model output. */
export function applyWordTemplate(generated: ExportResult, template: WordTemplateExport): ExportResult {
  const { profile } = template;
  if (!profile.confirmed || (profile.warnings.length && !profile.warningsAccepted)) throw new Error('请先确认模板识别结果和兼容性提示。');
  if(Object.values(profile.mappings).some(m=>m.needsConfirmation && !m.confirmedByUser))throw new Error('请先逐项确认模板格式冲突。');
  const fieldWarnings:string[]=[];
  const original = readTemplate(template.bytes), fresh = unzipSync(generated.bytes);
  const parse = (parts: Record<string, Uint8Array>, path: string, fallback: string) => parseXml(parts[path] ? strFromU8(parts[path]) : fallback);
  const styles = parse(original, 'word/styles.xml', `<w:styles xmlns:w="${W}"/>`);
  const freshStyles = parseXml(strFromU8(fresh['word/styles.xml']));
  const styleIds = new Set(elements(styles, 'style').map(n => attr(n, 'styleId')));
  let prefix = 'FolioExport'; while ([...styleIds].some(id => id.startsWith(prefix))) prefix += 'X';
  const roleIds = Object.fromEntries(Object.keys(TEMPLATE_ROLES).map(role => [role, prefix + role])) as Record<TemplateRole, string>;
  const generatedRole: Record<string, TemplateRole> = { Normal: 'body', Title: 'title', Heading1: 'heading1', Heading2: 'heading2', Heading3: 'heading3', Heading4: 'heading4', Heading5: 'heading5', Heading6: 'heading6', Caption: 'figureCaption', FigureCaption: 'figureCaption', TableCaption: 'tableCaption', Quote: 'quote', ListParagraph: 'list', Equation: 'equation', TableText: 'tableText', CodeBlock: 'code' };
  const paragraphStyleIds = { ...roleIds };
  for (const role of Object.keys(TEMPLATE_ROLES) as TemplateRole[]) {
    const candidate = profile.candidates.find(c => c.id === profile.mappings[role].candidateId);
    if (candidate?.source === 'style' && candidate.styleId && styleIds.has(candidate.styleId) && (!role.startsWith('heading') || attr(elements(parseXml(candidate.paragraph), 'outlineLvl')[0]) === String(Number(role.slice(7)) - 1))) paragraphStyleIds[role] = candidate.styleId;
  }
  for (const role of Object.keys(TEMPLATE_ROLES) as TemplateRole[]) {
    const mapping = profile.mappings[role], candidate = profile.candidates.find(c => c.id === mapping.candidateId);
    const style = make(styles, 'style', { type: 'paragraph', styleId: roleIds[role] });
    style.appendChild(make(styles, 'name', { val: `Folio ${TEMPLATE_ROLES[role]}` }));
    if (role !== 'body') style.appendChild(make(styles, 'basedOn', { val: roleIds.body }));
    style.appendChild(make(styles, 'next', { val: roleIds.body }));
    style.appendChild(make(styles, 'qFormat'));
    const fallbackId = Object.keys(generatedRole).find(key => generatedRole[key] === role);
    const fallback = elements(freshStyles, 'style').find(n => attr(n, 'styleId') === fallbackId);
    const pp = parseXml(candidate?.paragraph || (fallback && child(fallback, 'pPr') ? serialize(child(fallback, 'pPr')!) : `<w:pPr xmlns:w="${W}"/>`)).documentElement!;
    const rp = parseXml(candidate?.run || (fallback && child(fallback, 'rPr') ? serialize(child(fallback, 'rPr')!) : `<w:rPr xmlns:w="${W}"/>`)).documentElement!;
    remove(pp, ['pStyle', 'sectPr', 'pPrChange']); remove(rp, ['rStyle', 'rPrChange']);
    if (!candidate && role === 'code') { remove(pp, ['jc']); pp.appendChild(make(styles, 'jc', { val: 'left' })); const ind = child(pp, 'ind') || make(styles, 'ind'); ind.setAttributeNS(W, 'w:firstLine', '0'); ind.setAttributeNS(W, 'w:firstLineChars', '0'); if (!ind.parentNode) pp.appendChild(ind); }
    if (role !== 'list' && !role.startsWith('heading')) remove(pp, ['numPr', 'outlineLvl']);
    if (role.startsWith('heading')) { remove(pp, ['outlineLvl']); pp.appendChild(make(styles, 'outlineLvl', { val: String(Number(role.slice(7)) - 1) })); }
    if (role === 'body' && !candidate) {
      const defaults = elements(freshStyles, 'docDefaults')[0];
      style.appendChild(styles.importNode(parseXml(mergeProperties('pPr', [serialize(child(child(defaults, 'pPrDefault'), 'pPr')!), serialize(pp)])).documentElement!, true));
      style.appendChild(styles.importNode(parseXml(mergeProperties('rPr', [serialize(child(child(defaults, 'rPrDefault'), 'rPr')!), serialize(rp)])).documentElement!, true));
    } else { style.appendChild(styles.importNode(pp, true)); style.appendChild(styles.importNode(rp, true)); }
    styles.documentElement!.appendChild(style);
  }
  const doc = parseXml(strFromU8(fresh['word/document.xml'])), templateDoc = parseXml(strFromU8(original['word/document.xml']));
  const body = elements(doc, 'body')[0], originalBody = elements(templateDoc, 'body')[0];
  // Give source template relationship IDs their original namespace; generated IDs get a private prefix.
  const rels = parse(original, 'word/_rels/document.xml.rels', `<Relationships xmlns="${PR}"/>`);
  const relRoot = rels.documentElement!;
  const allowed = new Set(['styles', 'numbering', 'settings', 'theme', 'fontTable', 'header', 'footer']);
  for (const n of children(relRoot)) if (!allowed.has((n.getAttribute('Type') || '').split('/').at(-1)!)) relRoot.removeChild(n);
  let relPrefix = 'folio'; while (children(relRoot).some(n => n.getAttribute('Id')?.startsWith(relPrefix))) relPrefix += 'X';
  const freshRels = parseXml(strFromU8(fresh['word/_rels/document.xml.rels']));
  const files: Record<string, Uint8Array> = {};
  // Only retain the template's layout dependency graph. Do not leave its old body/footnotes in the output ZIP.
  const collect = (path: string) => {
    if (files[path]) return;
    if (!original[path]) throw new Error(`模板部件缺失：${path}。`);
    files[path] = original[path];
    const slash = path.lastIndexOf('/'), dir = path.slice(0, slash + 1), base = path.slice(slash + 1);
    const relPath = `${dir}_rels/${base}.rels`;
    if (!original[relPath]) return;
    const relationships = parseXml(strFromU8(original[relPath]));
    for (const n of children(relationships.documentElement!)) {
      if (n.getAttribute('TargetMode') === 'External') {
        if (!/\/hyperlink$/.test(n.getAttribute('Type') || '') || !/^(https?:|mailto:)/i.test(n.getAttribute('Target') || '')) throw new Error('模板含外部链接资源或活动对象，请先将资源嵌入普通 DOCX。');
      } else collect(resolvePart(path, n.getAttribute('Target') || ''));
    }
    files[relPath] = original[relPath];
  };
  for (const n of children(relRoot)) {
    if (n.getAttribute('TargetMode') === 'External') throw new Error('模板版式部件不能引用外部文件。');
    const path = resolvePart('word/document.xml', n.getAttribute('Target') || '');
    if (!original[path] && /\/(styles|numbering)$/.test(n.getAttribute('Type') || '')) { relRoot.removeChild(n); continue; }
    collect(path);
  }
  const targets=new Map<string,string>();
  const targetRoles=new Map<string,Set<TemplateRole>>();
  for(const role of ['title','heading1','heading2','heading3','heading4','heading5','heading6'] as TemplateRole[]) {
    for(const s of elements(styles,'style')) {
      const id=attr(s,'styleId'),name=attr(child(s,'name'));
      const selected=profile.candidates.find(c=>c.id===profile.mappings[role].candidateId);
      const level=role.startsWith('heading')?Number(role.slice(7)):0;
      const matches=attr(s,'type')==='paragraph' && (selected?.styleId===id || (level ? attr(child(child(s,'pPr'),'outlineLvl'))===String(level-1) || new RegExp(`^(heading\\s*${level}|标题\\s*${level})$`,'i').test(name) : /^(title|主标题|文档标题)$/i.test(name)));
      if(matches)for(const key of [name,id,...(level?[String(level)]:[])].filter(Boolean)) {const roles=targetRoles.get(key.toLocaleLowerCase())||new Set();roles.add(role);targetRoles.set(key.toLocaleLowerCase(),roles);}
    }
  }
  for(const [key,roles] of targetRoles)if(roles.size===1){const role=[...roles][0],style=elements(styles,'style').find(s=>attr(s,'styleId')===paragraphStyleIds[role]);targets.set(key,attr(child(style,'name')));}
  for(const path of Object.keys(files).filter(p=>/^word\/(header|footer)[^/]*\.xml$/.test(p))) {
    const running=parseXml(strFromU8(files[path]));
    if(rebindStyleRef(running,targets,fieldWarnings))files[path]=strToU8(serialize(running));
  }
  const retainedXml = Object.entries(files).filter(([path]) => path.endsWith('.xml')).map(([,bytes]) => parseXml(strFromU8(bytes)));
  const drawingIds = retainedXml.flatMap(dom => Array.from(dom.getElementsByTagName('*')).filter(n => n.localName === 'docPr').map(n => Number(n.getAttribute('id') || 0)));
  const drawingOffset = Math.max(0, ...drawingIds);
  for (const n of Array.from(doc.getElementsByTagName('*')).filter(n => n.localName === 'docPr')) n.setAttribute('id', String(Number(n.getAttribute('id') || 0) + drawingOffset));
  const bookmarkOffset = Math.max(0, ...retainedXml.flatMap(dom => elements(dom,'bookmarkStart').map(n=>Number(attr(n,'id'))))) + 1;
  const bookmarkNames = new Set(retainedXml.flatMap(dom => elements(dom,'bookmarkStart').map(n=>attr(n,'name'))));
  for (const n of [...elements(doc,'bookmarkStart'), ...elements(doc,'bookmarkEnd')]) n.setAttributeNS(W,'w:id',String(Number(attr(n,'id'))+bookmarkOffset));
  for (const n of elements(doc,'bookmarkStart')) {
    const oldName = attr(n,'name'); let name = oldName;
    while (bookmarkNames.has(name)) name += 'X';
    if (name !== oldName) { n.setAttributeNS(W,'w:name',name); for (const link of elements(doc,'hyperlink')) if (attr(link,'anchor') === oldName) link.setAttributeNS(W,'w:anchor',name); }
    bookmarkNames.add(name);
  }
  for (const n of children(freshRels.documentElement!)) {
    const type = (n.getAttribute('Type') || '').split('/').at(-1)!;
    if (!['image', 'hyperlink'].includes(type)) continue;
    const copy = rels.importNode(n, true) as Element;
    copy.setAttribute('Id', relPrefix + n.getAttribute('Id'));
    if (type === 'image') {
      const oldPath = `word/${n.getAttribute('Target')}`, newPath = `word/media/${relPrefix}-${oldPath.split('/').at(-1)}`;
      files[newPath] = fresh[oldPath]; copy.setAttribute('Target', newPath.slice(5));
    }
    relRoot.appendChild(copy);
  }
  for (const n of Array.from(doc.getElementsByTagName('*'))) for (const a of Array.from(n.attributes)) if (a.namespaceURI === R) n.setAttributeNS(R, a.name, relPrefix + a.value);
  // Merge numbering without colliding with template headings, lists or header numbering.
  const numbers = parse(original, 'word/numbering.xml', `<w:numbering xmlns:w="${W}"/>`);
  const newNumbers = parseXml(strFromU8(fresh['word/numbering.xml']));
  const numOffset = Math.max(0, ...elements(numbers, 'num').map(n => Number(attr(n, 'numId')))) + 1;
  const abstractOffset = Math.max(0, ...elements(numbers, 'abstractNum').map(n => Number(attr(n, 'abstractNumId')))) + 1;
  for (const n of elements(newNumbers, 'num')) n.setAttributeNS(W, 'w:numId', String(Number(attr(n, 'numId')) + numOffset));
  for (const n of elements(newNumbers, 'abstractNum')) n.setAttributeNS(W, 'w:abstractNumId', String(Number(attr(n, 'abstractNumId')) + abstractOffset));
  for (const n of elements(newNumbers, 'abstractNumId')) n.setAttributeNS(W, 'w:val', String(Number(attr(n)) + abstractOffset));
  for (const n of elements(doc, 'numId')) n.setAttributeNS(W, 'w:val', String(Number(attr(n)) + numOffset));
  // Reuse matching template level geometry/markers, while retaining Markdown starts and nesting.
  for (const abstract of elements(newNumbers, 'abstractNum')) {
    const fmt = attr(elements(abstract, 'numFmt')[0]);
    const sample = elements(numbers, 'abstractNum').find(n => attr(elements(n, 'numFmt')[0]) === fmt) || (fmt === 'decimal' ? elements(numbers, 'abstractNum').find(n => !['bullet','none'].includes(attr(elements(n,'numFmt')[0]))) : undefined);
    if (sample) for (const level of elements(abstract, 'lvl')) {
      const source = elements(sample, 'lvl').find(n => attr(n, 'ilvl') === attr(level, 'ilvl')) || elements(sample, 'lvl')[0];
      for (const key of ['numFmt', 'lvlText', 'lvlJc', 'pPr', 'rPr']) { const prop = child(source, key); if (prop) { remove(level, [key]); const copied = newNumbers.importNode(prop, true) as Element; if (key === 'lvlText' && attr(source,'ilvl') !== attr(level,'ilvl')) copied.setAttributeNS(W,'w:val',attr(copied).replace(/%\d+/g, `%${Number(attr(level,'ilvl')) + 1}`)); level.appendChild(copied); } }
    }
  }
  for (const n of children(newNumbers.documentElement!)) {
    if (n.localName === 'abstractNum') numbers.documentElement!.insertBefore(numbers.importNode(n, true), elements(numbers, 'num')[0] || null);
    else numbers.documentElement!.appendChild(numbers.importNode(n, true));
  }
  for (const paragraph of elements(doc, 'p')) {
    let pp = child(paragraph, 'pPr');
    if (!pp) { pp = make(doc, 'pPr'); paragraph.insertBefore(pp, paragraph.firstChild); }
    const oldStyle = attr(child(pp, 'pStyle'));
    const role = generatedRole[oldStyle] || (child(pp, 'numPr') ? 'list' : 'body');
    const equation = role === 'equation', table = role === 'tableText';
    const drawing = elements(paragraph, 'drawing').length > 0;
    const isRule = !elements(paragraph, 't').some(t => t.textContent) && child(pp, 'pBdr');
    for (const n of children(pp)) if (!(n.localName === 'numPr' || equation && ['tabs', 'jc'].includes(n.localName!) || table && n.localName === 'jc' || drawing && ['jc', 'keepNext', 'keepLines'].includes(n.localName!) || isRule && n.localName === 'pBdr')) pp.removeChild(n);
    pp.insertBefore(make(doc, 'pStyle', { val: paragraphStyleIds[role] }), pp.firstChild);
    if (drawing || equation || table) pp.appendChild(make(doc, 'ind', { firstLine: '0', firstLineChars: '0' }));
    // Explicit inline emphasis survives. Layout is inherited from the template role.
    for (const rp of elements(paragraph, 'rPr')) if (role !== 'code') remove(rp, ['sz', 'szCs']);
  }
  const sourceTable = elements(templateDoc, 'tbl')[0];
  if (sourceTable) for (const table of elements(doc, 'tbl')) {
    const pp = child(table, 'tblPr')!, sourcePr = child(sourceTable, 'tblPr');
    if (sourcePr) for (const n of children(sourcePr)) if (!['tblW', 'tblLayout', 'tblInd', 'tblpPr', 'tblPrChange'].includes(n.localName!)) { remove(pp, [n.localName!]); pp.appendChild(doc.importNode(n, true)); }
    const sourceRows = children(sourceTable).filter(n => n.localName === 'tr');
    for (const [i, row] of children(table).filter(n => n.localName === 'tr').entries()) {
      const sourceRow = sourceRows[Math.min(i === 0 ? 0 : 1, sourceRows.length - 1)];
      if (!sourceRow) continue;
      const sourceCells = children(sourceRow).filter(n => n.localName === 'tc');
      for (const [j, cell] of children(row).filter(n => n.localName === 'tc').entries()) {
        const sourceCell = sourceCells[Math.min(j, sourceCells.length - 1)], cp = child(cell, 'tcPr')!;
        remove(cp, ['tcBorders', 'shd']);
        const samplePr = child(sourceCell, 'tcPr');
        if (samplePr) for (const n of children(samplePr)) if (!['tcW', 'gridSpan', 'vMerge', 'hMerge', 'tcPrChange'].includes(n.localName!)) { remove(cp, [n.localName!]); cp.appendChild(doc.importNode(n, true)); }
      }
    }
  }
  // Final section inherits header/footer links when a previous section defines them.
  const section = elements(templateDoc, 'sectPr').at(-1)?.cloneNode(true) as Element | undefined;
  const finalSection = section || make(doc, 'sectPr');
  remove(finalSection, ['cols', 'sectPrChange', 'type']);
  for (const kind of ['headerReference', 'footerReference']) for (const type of ['default', 'first', 'even']) {
    if (children(finalSection).some(n => n.localName === kind && attr(n, 'type') === type)) continue;
    const inherited = elements(templateDoc, kind).filter(n => attr(n, 'type') === type).at(-1);
    if (inherited) finalSection.insertBefore(inherited.cloneNode(true), finalSection.firstChild);
  }
  if (!child(finalSection, 'pgSz')) finalSection.appendChild(make(doc, 'pgSz', { w: String(profile.page.width), h: String(profile.page.height) }));
  if (!child(finalSection, 'pgMar')) finalSection.appendChild(make(doc, 'pgMar', { top: String(profile.page.top), right: String(profile.page.right), bottom: String(profile.page.bottom), left: String(profile.page.left), header: '720', footer: '720', gutter: '0' }));
  remove(body, ['sectPr']); body.appendChild(doc.importNode(finalSection, true));
  for (const a of Array.from(doc.documentElement!.attributes)) if (!templateDoc.documentElement!.hasAttribute(a.name)) templateDoc.documentElement!.setAttributeNS(a.namespaceURI, a.name, a.value);
  templateDoc.documentElement!.replaceChild(templateDoc.importNode(body, true), originalBody);
  orderProperties(templateDoc); orderProperties(styles); orderProperties(numbers);
  files['word/document.xml'] = strToU8(serialize(templateDoc));
  files['word/styles.xml'] = strToU8(serialize(styles)); files['word/numbering.xml'] = strToU8(serialize(numbers));
  for (const [type, target] of [['styles', 'styles.xml'], ['numbering', 'numbering.xml']]) if (!children(relRoot).some(n => n.getAttribute('Type') === `${R}/${type}`)) {
    const rel = rels.createElementNS(PR, 'Relationship'); rel.setAttribute('Id', `${relPrefix}${type}`); rel.setAttribute('Type', `${R}/${type}`); rel.setAttribute('Target', target); relRoot.appendChild(rel);
  }
  files['word/_rels/document.xml.rels'] = strToU8(serialize(rels));
  // Remove protection and revision recording from exported editable documents.
  if (files['word/settings.xml']) {
    const settings = parseXml(strFromU8(files['word/settings.xml'])); remove(settings.documentElement!, ['documentProtection', 'writeProtection', 'trackRevisions']); files['word/settings.xml'] = strToU8(serialize(settings));
  }
  files['_rels/.rels'] = fresh['_rels/.rels'];
  const types = parseXml(`<Types xmlns="${CT}"/>`), root = types.documentElement!;
  const oldTypes = parseXml(strFromU8(original['[Content_Types].xml'])), newTypes = parseXml(strFromU8(fresh['[Content_Types].xml']));
  const keys = new Set<string>();
  for (const source of [oldTypes, newTypes]) for (const n of children(source.documentElement!)) {
    const part = n.getAttribute('PartName') || '', ext = n.getAttribute('Extension') || '', key = part || ext;
    if (keys.has(key) || part && !files[part.replace(/^\//, '')]) continue;
    const copy = types.importNode(n, true) as Element;
    if (part === '/word/document.xml') copy.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
    root.appendChild(copy); keys.add(key);
  }
  files['[Content_Types].xml'] = strToU8(serialize(types));
  return { ...generated, bytes: zipSync(files), diagnostics: [...new Set([...generated.diagnostics, ...profile.warnings,...fieldWarnings])] };
}

export { resolvePart } from './WordXml';
