import { zipSync, strToU8 } from 'fflate';
import { W, R, PR, CT } from '../../src/document/templates/WordXml';
export const templatePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const fonts = (cn: string, en: string, size: number) => `<w:rPr><w:rFonts w:eastAsia="${cn}" w:ascii="${en}" w:hAnsi="${en}"/><w:sz w:val="${size * 2}"/></w:rPr>`;
const prose = '<w:pPr><w:spacing w:before="0" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="480"/><w:jc w:val="both"/></w:pPr>';
const style = (id: string, name: string, p = '', r = '', base = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"${id === 'Normal' ? ' w:default="1"' : ''}><w:name w:val="${name}"/>${id === 'Normal' ? '' : `<w:basedOn w:val="${base}"/>`}${p}${r}</w:style>`;
const paragraph = (id: string, value: string) => `<w:p><w:pPr><w:pStyle w:val="${id}"/></w:pPr><w:r><w:t>${value}</w:t></w:r></w:p>`;
export function wordTemplateFixture(kind: 'formal' | 'technical' | 'direct' = 'formal', overrides: Record<string, string | Uint8Array | null> = {}): Uint8Array {
  const technical = kind === 'technical', direct = kind === 'direct';
  const bodyRun = fonts(technical ? '仿宋' : '宋体', technical ? 'Times New Roman' : 'Arial', technical ? 12 : 11);
  const titleP = '<w:pPr><w:keepNext/><w:spacing w:before="120" w:after="360"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>';
  const titleR = '<w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="40"/></w:rPr>';
  const headingP = (n: number) => `<w:pPr><w:keepNext/><w:keepLines/>${technical && n === 0 ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="${n}"/></w:pPr>`;
  const headingR = (size: number) => `<w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="${size * 2}"/></w:rPr>`;
  const captionP = '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="80" w:after="80"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>';
  const directParagraph = (p: string, r: string, value: string) => `<w:p>${p}<w:r>${r}<w:t>${value}</w:t></w:r></w:p>`;
  let story = direct ? directParagraph(titleP, titleR, '非规范报告模板') + directParagraph(headingP(0).replace(/<w:outlineLvl[^>]+\/>/, ''), headingR(16), '一、研究背景') : paragraph('Title', technical ? '技术报告模板' : '正式报告模板') + paragraph('Heading1', '研究背景');
  const bodyText = '这是一段中文正文排版样本。Mixed language content demonstrates Latin typography and paragraph spacing. 模板中的正文应保持可编辑。';
  for (let i = 0; i < 5; i++) story += direct ? directParagraph(prose, bodyRun, bodyText) : paragraph('Normal', bodyText);
  story += direct ? directParagraph(headingP(1).replace(/<w:outlineLvl[^>]+\/>/, ''), headingR(14), '1.1 实验方案') : paragraph('Heading2', '实验方案');
  story += direct ? directParagraph(captionP, fonts('楷体', 'Arial', 10), '图 1 实验装置') : paragraph('FigureCaption', '图 1 实验装置');
  story += direct ? directParagraph(captionP, fonts('楷体', 'Arial', 10), '表 1 测量结果') : paragraph('TableCaption', '表 1 测量结果');
  const cell = (t: string, fill: boolean) => `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/>${fill ? '<w:shd w:fill="E8EDF2"/>' : ''}</w:tcPr>${paragraph(direct ? 'Normal' : 'TableText', t)}</w:tc>`;
  story += `<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"/><w:tblW w:w="8000" w:type="dxa"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(side => `<w:${side} w:val="single" w:sz="6" w:color="506070"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${cell('参数', true)}${cell('数值', true)}</w:tr><w:tr>${cell('响应', false)}${cell('210', false)}</w:tr></w:tbl>`;
  const section = `<w:sectPr><w:headerReference w:type="default" r:id="tplHeader"/><w:footerReference w:type="default" r:id="tplFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${technical ? 1417 : 1134}" w:right="1417" w:bottom="1417" w:left="1701" w:header="567" w:footer="567"/><w:pgNumType w:fmt="decimal"/></w:sectPr>`;
  const parts: Record<string, string | Uint8Array> = {
    'word/document.xml': `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${story}${section}</w:body></w:document>`,
    'word/styles.xml': `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault>${direct ? fonts('宋体', 'Calibri', 10) : bodyRun}</w:rPrDefault><w:pPrDefault>${direct ? '<w:pPr/>' : prose}</w:pPrDefault></w:docDefaults>${style('Normal','Normal', direct ? '' : prose, direct ? '' : bodyRun)}${direct ? '' : style('Title','Title',titleP,titleR) + Array.from({length:6},(_,i) => style(`Heading${i+1}`,`heading ${i+1}`,headingP(i),headingR(16 - Math.min(i,4)))).join('') + style('FigureCaption','图题',captionP,fonts('楷体','Arial',10)) + style('TableCaption','表题',captionP,fonts('楷体','Arial',10)) + style('TableText','表格文字','<w:pPr><w:spacing w:after="0"/><w:ind w:firstLine="0"/></w:pPr>',fonts('宋体','Arial',10)) + style('ListParagraph','List Paragraph','<w:pPr><w:ind w:left="500" w:hanging="240"/></w:pPr>') + style('Equation','公式',captionP, fonts('宋体','Cambria Math',12)) + style('Quote','引用','<w:pPr><w:ind w:left="600"/></w:pPr>')}${'<w:style w:type="table" w:styleId="ReportTable"><w:name w:val="Report Table"/><w:tblPr><w:shd w:fill="FFFFFF"/></w:tblPr></w:style>'}</w:styles>`,
    'word/header1.xml': `<w:hdr xmlns:w="${W}">${paragraph('Normal', technical ? '工程研究中心 · 技术报告' : '正式报告 · Folio')}</w:hdr>`,
    'word/footer1.xml': `<w:ftr xmlns:w="${W}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${PR}">${[['tplStyle','styles','styles.xml'],['tplHeader','header','header1.xml'],['tplFooter','footer','footer1.xml']].map(([id,type,target]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`).join('')}</Relationships>`,
    '_rels/.rels': `<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    '[Content_Types].xml': `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[['document','document.main'],['styles','styles'],['header1','header'],['footer1','footer']].map(([part,type]) => `<Override PartName="/word/${part}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`).join('')}</Types>`
  };
  for (const [path, value] of Object.entries(overrides)) { if (value === null) delete parts[path]; else parts[path] = value; }
  return zipSync(Object.fromEntries(Object.entries(parts).map(([path, value]) => [path, typeof value === 'string' ? strToU8(value) : value])));
}
