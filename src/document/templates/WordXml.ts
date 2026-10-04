import { DOMParser, XMLSerializer, type Element, type Document } from '@xmldom/xmldom';
export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
export function resolvePart(owner: string, target: string): string {
  const result: string[] = target.startsWith('/') ? [] : owner.split('/').slice(0, -1);
  for (const piece of target.replace(/^\//, '').split('/')) { if (piece === '..') { if (!result.length) throw new Error('模板部件路径越界。'); result.pop(); } else if (piece && piece !== '.') result.push(piece); }
  return result.join('/');
}
export function parseXml(value: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(value)) throw new Error('模板包含不支持的 XML 实体。');
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (_, message) => { errors.push(message); } }).parseFromString(value, 'application/xml');
  if (errors.length) throw new Error('模板 XML 已损坏，无法可靠读取。');
  return doc;
}
export const serialize = (node: Parameters<XMLSerializer['serializeToString']>[0]) => new XMLSerializer().serializeToString(node);
export const elements = (node: Element | Document, name: string): Element[] => Array.from(node.getElementsByTagNameNS(W, name));
export const children = (node: Element): Element[] => Array.from(node.childNodes).filter((n): n is Element => n.nodeType === 1);
export const child = (node: Element | undefined, name: string) => node && children(node).find(n => n.namespaceURI === W && n.localName === name);
export const attr = (node: Element | undefined, name = 'val') => node?.getAttributeNS(W, name) || '';
export const text = (node: Element) => elements(node, 't').map(n => n.textContent).join('');
export function make(doc: Document, name: string, attrs: Record<string, string> = {}): Element {
  const node = doc.createElementNS(W, `w:${name}`);
  for (const [key, value] of Object.entries(attrs)) node.setAttributeNS(W, `w:${key}`, value);
  return node;
}
export function remove(node: Element, names: string[]): void { for (const n of children(node)) if (names.includes(n.localName!)) node.removeChild(n); }
const propertyOrders: Record<string, string[]> = {
  pPr: ['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange'],
  rPr: ['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','strike','dStrike','outline','shadow','emboss','imprint','noProof','snapToGrid','vanish','webHidden','color','spacing','w','kern','position','sz','szCs','highlight','u','effect','bdr','shd','fitText','vertAlign','rtl','cs','em','lang','eastAsianLayout','specVanish','oMath','rPrChange'],
  tblPr: ['tblStyle','tblpPr','tblOverlap','bidiVisual','tblStyleRowBandSize','tblStyleColBandSize','tblW','jc','tblCellSpacing','tblInd','tblBorders','shd','tblLayout','tblCellMar','tblLook','tblCaption','tblDescription','tblPrChange'],
  tcPr: ['cnfStyle','tcW','gridSpan','hMerge','vMerge','tcBorders','shd','noWrap','tcMar','textDirection','tcFitText','vAlign','hideMark','headers','cellIns','cellDel','cellMerge','tcPrChange'],
  sectPr: ['headerReference','footerReference','footnotePr','endnotePr','type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid','printerSettings','sectPrChange'],
  lvl: ['start','numFmt','lvlRestart','pStyle','isLgl','suff','lvlText','lvlPicBulletId','legacy','lvlJc','pPr','rPr']
};
export function orderProperties(doc: Document): void {
  for (const [name, order] of Object.entries(propertyOrders)) for (const parent of elements(doc, name)) {
    const nodes = children(parent), rank = (n: Element) => { const i = order.indexOf(n.localName!); return i < 0 ? order.length : i; };
    for (const node of nodes.sort((a,b) => rank(a) - rank(b))) parent.appendChild(node);
  }
}
/** Merge attributes as well as elements (e.g. latin-only rFonts overrides). */
export function mergeProperties(name: string, fragments: (string | undefined)[]): string {
  const doc = parseXml(`<w:${name} xmlns:w="${W}"/>`), root = doc.documentElement!;
  for (const fragment of fragments.filter(Boolean)) {
    const incoming = parseXml(fragment!);
    for (const n of children(incoming.documentElement!)) {
      const existing = children(root).find(c => c.localName === n.localName && c.namespaceURI === n.namespaceURI);
      if (!existing) root.appendChild(doc.importNode(n, true));
      else if (children(n).length) { root.replaceChild(doc.importNode(n, true), existing); }
      else { for (const a of Array.from(n.attributes)) existing.setAttributeNS(a.namespaceURI, a.name, a.value); }
    }
  }
  return serialize(root);
}
