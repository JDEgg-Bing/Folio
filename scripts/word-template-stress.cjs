// Controlled stress probe. Expectations describe the authored template, not the analyzer output.
// This does not change recognition or auto-confirm real user templates.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const ts = require('typescript'), { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const { analyzeWordTemplate } = require('../src/document/templates/WordTemplateAnalyzer.ts');
const { wordTemplateFixture } = require('../tests/document/wordTemplateFixtures.ts');
const { W, parseXml, elements, child, attr } = require('../src/document/templates/WordXml.ts');

if (process.argv[2] === '--worker') {
  const before = performance.now();
  try {
    const profile = analyzeWordTemplate(fs.readFileSync(process.argv[3]), 'Stress probe', 'stress');
    process.stdout.write(JSON.stringify({ profile, ms: performance.now() - before, heapMB: process.memoryUsage().heapUsed / 1048576 }));
  } catch (error) { process.stdout.write(JSON.stringify({ error: error.message, ms: performance.now() - before })); }
}
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const font = (size, cn = '宋体', en = 'Arial', bold = false) => `<w:rPr><w:rFonts w:eastAsia="${cn}" w:ascii="${en}" w:hAnsi="${en}"/>${bold ? '<w:b/>' : ''}<w:sz w:val="${size * 2}"/></w:rPr>`;
const bodyP = '<w:pPr><w:spacing w:before="0" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="480"/><w:jc w:val="both"/></w:pPr>';
const headingP = (level, outline = false) => `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/><w:jc w:val="left"/>${outline ? `<w:outlineLvl w:val="${level - 1}"/>` : ''}</w:pPr>`;
const centerP = '<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>';
const direct = (text, p = bodyP, r = font(11)) => `<w:p>${p}<w:r>${r}<w:t>${esc(text)}</w:t></w:r></w:p>`;
const styled = (text, id) => `<w:p><w:pPr><w:pStyle w:val="${id}"/></w:pPr><w:r><w:t>${esc(text)}</w:t></w:r></w:p>`;
const style = (id, name, p, r, base = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${base}"/>${p}${r}</w:style>`;
const bodyText = i => `正文样本 ${i}。这里描述研究过程、方法和结果；Mixed language body demonstrates typography. 连续文字用于提供足够的正文识别证据。`;
function packageParts(kind = 'formal') { return Object.fromEntries(Object.entries(unzipSync(wordTemplateFixture(kind))).map(([name, value]) => [name, /\.xml$|\.rels$/.test(name) ? strFromU8(value) : value])); }
function bytes(parts) { return zipSync(Object.fromEntries(Object.entries(parts).map(([key,value]) => [key, typeof value === 'string' ? strToU8(value) : value]))); }
function story(parts, content) { parts['word/document.xml'] = parts['word/document.xml'].replace(/(<w:body>)[\s\S]*(<w:sectPr>[\s\S]*?<\/w:sectPr><\/w:body>)/, '$1' + content + '$2'); return parts; }
function addStyles(parts, definitions) { parts['word/styles.xml'] = parts['word/styles.xml'].replace('</w:styles>', definitions + '</w:styles>'); return parts; }
function directScene(h1 = '一、研究背景', h2 = '1.1 实验方案') {
  return story(packageParts('direct'), direct('视觉报告模板', centerP, font(20, '黑体', 'Arial', true)) + direct(h1, headingP(1), font(16, '黑体', 'Arial', true)) + Array.from({length:6}, (_,i) => direct(bodyText(i))).join('') + direct(h2, headingP(2), font(14, '黑体', 'Arial', true)) + direct('图 1 实验装置', centerP, font(10, '楷体')) + direct('表 1 实验结果', centerP, font(10, '楷体')));
}
const directExpected = () => ({body:{size:11,cn:'宋体'},title:{size:20,cn:'黑体'},heading1:{size:16,sample:'研究背景'},heading2:{size:14,sample:'实验方案'},figureCaption:{size:10},tableCaption:{size:10}});
const namedExpected = () => ({ body:{styleId:'Normal',size:11},title:{styleId:'Title',size:20}, ...Object.fromEntries(Array.from({length:6},(_,i) => [`heading${i+1}`,{styleId:`Heading${i+1}`,size:16-Math.min(i,4)}])),figureCaption:{styleId:'FigureCaption'},tableCaption:{styleId:'TableCaption'},quote:{styleId:'Quote'},list:{styleId:'ListParagraph'},equation:{styleId:'Equation'},tableText:{styleId:'TableText'} });
function measuredFormat(candidate) {
  if (!candidate) return {};
  const rp = parseXml(candidate.run).documentElement, pp = parseXml(candidate.paragraph).documentElement;
  return {size:Number(attr(child(rp,'sz')))/2,cn:attr(child(rp,'rFonts'),'eastAsia'),en:attr(child(rp,'rFonts'),'ascii'),outline:attr(child(pp,'outlineLvl')),styleId:candidate.styleId,sample:candidate.sample,jc:attr(child(pp,'jc')),firstLine:attr(child(pp,'ind'),'firstLine'),summary:candidate.summary};
}
function score(profile, expected) {
  return Object.entries(expected).map(([role, wanted]) => {
    const mapping = profile.mappings[role], c = profile.candidates.find(c => c.id === mapping.candidateId), actual = measuredFormat(c);
    if(mapping.example) actual.sample=mapping.example;
    const mismatches = wanted.absent ? (c ? ['expected no mapping, but inferred a heading'] : []) : Object.entries(wanted).filter(([key,value]) => key === 'sample' ? !actual.sample?.includes(value) : actual[key] !== value).map(([key,value]) => `${key}: expected ${value}, actual ${actual[key] ?? 'missing'}`);
    return {role, status:wanted.absent ? mismatches.length ? 'wrong' : 'correct' : !c ? 'missing' : mismatches.length ? 'wrong' : 'correct',confidence:mapping.confidence,needsConfirmation:!!mapping.needsConfirmation,candidate:mapping.candidateId,actual,mismatches};
  });
}
async function main() {
  const output = path.resolve(process.argv[2] || 'out/word-template-stress'); fs.mkdirSync(output,{recursive:true});
  const cases = [], add = (id,label,parts,expected={}, note='') => cases.push({id,label,parts,expected,note});
  add('01-standard','标准命名样式 / 六级标题',packageParts(),namedExpected());
  const rich = addStyles(packageParts('technical'),style('Code','代码','<w:pPr><w:ind w:firstLine="0"/></w:pPr>',font(10,'宋体','Consolas')));
  rich['word/styles.xml'] = rich['word/styles.xml'].replace('<w:keepLines/>','<w:keepLines/><w:widowControl/>');
  rich['word/document.xml'] = rich['word/document.xml'].replace('w:left="1701"','w:left="1701" w:gutter="240"');
  add('02-rich-rules','15 类角色 + 中英字体 + 分页 / 装订线',rich,{...namedExpected(),body:{size:12,cn:'仿宋',en:'Times New Roman'},code:{styleId:'Code',size:10}});
  const obscure = packageParts();
  for (let n=1;n<=6;n++) for (const key of ['word/styles.xml','word/document.xml']) obscure[key] = obscure[key].replaceAll(`Heading${n}`,`X_${n}`).replaceAll(`heading ${n}`,`自定格式_${n}`);
  add('03-outline-only','自定义名称但保留大纲级别',obscure,Object.fromEntries(Array.from({length:6},(_,i)=>[`heading${i+1}`,{styleId:`X_${i+1}`}])));
  add('04-direct-numbered','无标题样式 / 直接格式 + 标准编号',directScene(),directExpected());
  add('05-visual-only','视觉清晰 / 无编号、无大纲标题',directScene('研究背景','实验方案'),directExpected());
  add('06-space-numbering','视觉标题 / 1 空格、1.1 空格',directScene('1 研究背景','1.1 实验方案'),directExpected());
  add('07-chinese-parentheses','视觉标题 / （一）与（一）.1',directScene('（一）研究背景','（一）.1 实验方案'),directExpected());
  add('08-roman','视觉标题 / 罗马数字与字母编号',directScene('I. 研究背景','A. 实验方案'),directExpected());
  add('09-chapter-numbering','直接格式 / 第一章、1.1',directScene('第一章 研究背景','1.1 实验方案'),directExpected());
  add('10-long-heading','长编号标题（超过 80 字）',directScene('一、研究背景'+'与相关研究问题的深入讨论'.repeat(9)),directExpected());
  const hidden = directScene('研究背景','实验方案');
  addStyles(hidden,style('Heading1','heading 1',headingP(1,true),font(24,'黑体','Arial',true)));
  add('11-unused-heading','残留未使用 Heading1 / 实际视觉一级标题 16 pt',hidden,directExpected(),'检查未使用样式能否产生高置信错误。');
  const override = packageParts();
  // There are more unmodified Heading1 samples than directly formatted exceptions.
  story(override,styled('封面','Title') + Array.from({length:10},(_,i)=>styled('旧章样例 '+i,'Heading1')).join('') + direct('研究背景', '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>',font(18,'黑体','Arial',true)) + Array.from({length:6},(_,i)=>styled(bodyText(i),'Normal')).join(''));
  add('12-conflicting-heading','同一标题样式有多个直接格式版本',override,{heading1:{size:18}},'以当前真实标题 18 pt 为人工真值，旧样例仍占多数；要求识别歧义。');
  const onlyInstructions = story(packageParts('direct'),Array.from({length:6},(_,i)=>styled(['正文要求宋体小四，1.5 倍行距，首行缩进两个字符。','一级标题要求黑体三号，段前 12 磅。','二级标题要求黑体四号，另起段。','图题用楷体五号居中；表题置于表格上方。','页眉应显示当前章节，页脚居中连续编号。','中英文混排要求英文字体 Times New Roman。'][i],'Normal')).join(''));
  add('13-written-requirements','只描述排版要求，示例未应用这些格式',onlyInstructions,{body:{size:12,cn:'宋体',en:'Times New Roman'},heading1:{size:16,cn:'黑体'},heading2:{size:14,cn:'黑体'}},'人为真值来自文字要求；分析器是否理解自然语言。');
  const sparse = story(packageParts('direct'),direct('报告',centerP,font(20,'黑体','Arial',true))+Array.from({length:12},(_,i)=>direct(`${i+1}、研究背景`,headingP(1),font(16,'黑体','Arial',true))).join('')+direct(bodyText(0)));
  add('14-sparse-body','正文只有一段，标题有 12 段',sparse,{body:{size:11,cn:'宋体'},heading1:{size:16}});
  const grouping = directScene();
  grouping['word/document.xml'] = grouping['word/document.xml'].replace(direct('一、研究背景',headingP(1),font(16,'黑体','Arial',true)),direct('使用说明',headingP(1),font(16,'黑体','Arial',true))+direct('一、研究背景',headingP(1),font(16,'黑体','Arial',true)));
  add('15-first-sample','同格式先出现说明文字，再出现编号标题',grouping,directExpected());
  const same = directScene(); same['word/document.xml'] = same['word/document.xml'].replace(font(14,'黑体','Arial',true),font(16,'黑体','Arial',true));
  add('16-same-looking-levels','一二级标题字体段落完全一致，只有编号不同',same,{...directExpected(),heading2:{size:16,sample:'实验方案'}});
  const lateCaption = directScene();
  lateCaption['word/document.xml'] = lateCaption['word/document.xml'].replace(direct('图 1 实验装置',centerP,font(10,'楷体')),Array.from({length:9},(_,i)=>direct('注释样本 '+i,centerP,font(10,'楷体'))).join('')+direct('图 1 实验装置',centerP,font(10,'楷体')));
  add('17-late-caption','同格式前九段为注释，图表题在后面',lateCaption,directExpected());
  const tableHeavy = packageParts(); const table = tableHeavy['word/document.xml'].match(/<w:tbl>[\s\S]*?<\/w:tbl>/)[0];
  tableHeavy['word/document.xml'] = tableHeavy['word/document.xml'].replace(table,table.repeat(100));
  add('18-table-heavy','100 张表格 / 很少正文',tableHeavy,{body:{size:11,styleId:'Normal'},tableText:{styleId:'TableText'}});
  const missing = directScene(); delete missing['word/styles.xml'];
  add('19-no-styles','完全没有 styles.xml 的直接格式模板',missing,directExpected());
  const inherited = packageParts();
  addStyles(inherited, style('BaseChinese','基础中文','',font(12,'仿宋','Times New Roman'))+style('ReportBody','Body Text',bodyP,'','BaseChinese'));
  inherited['word/styles.xml'] = inherited['word/styles.xml'].replace(/<w:style w:type="paragraph" w:styleId="Normal"[\s\S]*?<\/w:style>/,'');
  inherited['word/document.xml'] = inherited['word/document.xml'].replaceAll('w:val="Normal"','w:val="ReportBody"');
  add('20-inherited-body','两层继承正文 / 明确命名 Body Text',inherited,{body:{styleId:'ReportBody',size:12,cn:'仿宋',en:'Times New Roman'}});
  const ambiguousBody = directScene();
  ambiguousBody['word/document.xml'] = ambiguousBody['word/document.xml'].replace(direct(bodyText(0)),Array.from({length:20},(_,i)=>direct('模板说明 '+i,bodyP,font(10,'楷体'))).join('')+direct(bodyText(0)));
  add('21-instructions-dominate','模板说明占多数 / 实际正文样本少',ambiguousBody,{body:{size:11,cn:'宋体'}},'正文真值是长正文样本；说明区不应被当作正文。');
  const sections = packageParts();
  sections['word/document.xml'] = sections['word/document.xml'].replace('<w:body>','<w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/><w:cols w:num="2"/></w:sectPr></w:pPr><w:r><w:t>横向双栏封面</w:t></w:r></w:p>');
  add('22-sections-columns','横向双栏封面 + 纵向单栏正文',sections,{},'应提示多节、多栏；只识别末节。');
  const tables = packageParts(); tables['word/document.xml'] = tables['word/document.xml'].replace('</w:tbl>', '</w:tbl>'+styled('第二种表格格式','Normal')+table.replaceAll('E8EDF2','FFE080').replaceAll('ReportTable','SecondTable'));
  add('23-multiple-tables','两套表格规则 / 第二套黄色表头',tables,{},'只使用首表规则；检查有无歧义警告。');
  const quote = directScene();
  quote['word/document.xml'] = quote['word/document.xml'].replace('<w:sectPr>',direct('这是引文段落','<w:pPr><w:ind w:left="900" w:right="900"/></w:pPr>',font(11,'楷体'))+direct('1. 这是列表项目','<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>',font(11))+'<w:sectPr>');
  add('24-visual-quote-list','只用缩进 / 字体表示引用与列表',quote,{quote:{cn:'楷体'},list:{size:11}},'没有 Quote/ListParagraph 命名样式。');
  const autoNumbered = directScene('研究背景','实验方案');
  autoNumbered['word/document.xml'] = autoNumbered['word/document.xml'].replaceAll('<w:keepNext/>','<w:keepNext/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
  autoNumbered['word/numbering.xml'] = `<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  autoNumbered['word/_rels/document.xml.rels'] = autoNumbered['word/_rels/document.xml.rels'].replace('</Relationships>','<Relationship Id="tplNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>');
  autoNumbered['[Content_Types].xml'] = autoNumbered['[Content_Types].xml'].replace('</Types>','<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>');
  add('25-auto-numbered','Word 自动编号 / 视觉标题无大纲',autoNumbered,directExpected(),'编号显示在 Word 中，但不在段落纯文本里。');
  const checklist = story(packageParts('direct'),direct('采购清单',centerP,font(20,'黑体','Arial',true))+Array.from({length:6},(_,i)=>direct('1. 采购事项 '+i,'<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>',font(11))).join('')+Array.from({length:10},(_,i)=>direct(bodyText(i))).join(''));
  add('26-list-as-heading','普通编号清单 / 不含任何正文标题',checklist,{heading1:{absent:true}},'检查把列表项误判成标题的反例。');
  const fontNoise = directScene();
  fontNoise['word/document.xml'] = fontNoise['word/document.xml'].replaceAll(font(11),font(11.5));
  fontNoise['word/document.xml'] = fontNoise['word/document.xml'].replace(direct('一、研究背景',headingP(1),font(16,'黑体','Arial',true)),direct('报告的重要说明',headingP(1),font(16,'黑体','Arial',true))+direct('一、研究背景',headingP(1),font(16,'黑体','Arial',true)));
  add('27-small-noise','正文字号略有波动 / 说明与一级标题同格式',fontNoise,{...directExpected(),body:{size:11.5,cn:'宋体'}},'字号可以读取，语义仍被首条样本遮蔽。');
  const cover = directScene();
  cover['word/document.xml'] = cover['word/document.xml'].replace('<w:body>','<w:body>'+direct('某大学课程报告',centerP,font(16,'黑体','Arial',true)));
  add('28-cover-prelude','封面先是学校名称 / 真正主标题在第二段',cover,{title:{size:20}},'两个居中大字段落；不能把前置校名当作文档主标题。');
  const sixLevels = story(packageParts('direct'),direct('六级直接格式模板',centerP,font(20,'黑体','Arial',true))+Array.from({length:6},(_,i)=>direct(bodyText(i))).join('')+Array.from({length:6},(_,i)=>direct('1'+'.1'.repeat(i)+'. 层级内容 '+(i+1),headingP(i+1),font(16-i,'黑体','Arial',true))).join(''));
  add('29-direct-six-levels','六级直接格式 / 手工输入标准十进制编号',sixLevels,{body:{size:11},title:{size:20},...Object.fromEntries(Array.from({length:6},(_,i)=>[`heading${i+1}`,{size:16-i,sample:'层级内容 '+(i+1)}]))});
  const renamed=directScene('测量系统设计','误差评估');
  renamed['word/document.xml']=renamed['word/document.xml'].replaceAll('研究背景','系统设计').replaceAll('实验方案','误差评估').replaceAll('黑体','微软雅黑').replaceAll('Arial','Georgia');
  add('30-independent-visual','不同文字与字体 / 纯视觉层级',renamed,{body:{size:11},heading1:{size:16,cn:'微软雅黑',sample:'测量系统'},heading2:{size:14,sample:'误差评估'}});
  const reordered=directScene('测量系统设计','误差评估');
  const reorderText=reordered['word/document.xml'];
  reordered['word/document.xml']=reorderText.replace(direct('误差评估',headingP(2),font(14,'黑体','Arial',true)),'').replace('<w:body>','<w:body>'+direct('误差评估',headingP(2),font(14,'黑体','Arial',true)));
  add('31-reordered-visual','二级标题先出现 / 不按出现顺序分级',reordered,{heading1:{size:16},heading2:{size:14}});
  const late=directScene();late['word/document.xml']=late['word/document.xml'].replace(direct('图 1 实验装置',centerP,font(10,'楷体')),Array.from({length:50},(_,i)=>direct('注：示例注释 '+i,centerP,font(10,'楷体'))).join('')+direct('Figure 7 Measurement',centerP,font(10,'楷体')));
  add('32-late-english-caption','50 条注释之后的英文图题',late,{figureCaption:{size:10,sample:'Figure 7'}});
  const cyclic=packageParts();addStyles(cyclic,style('LoopA','循环甲','','','LoopB')+style('LoopB','循环乙','','','LoopA'));
  story(cyclic,styled(bodyText(0),'LoopA'));
  add('33-cyclic-styles','循环继承 / 要求确认而非阻塞',cyclic,{body:{size:11}});
  const numericNoise=story(packageParts('direct'),Array.from({length:30},(_,i)=>direct(bodyText(i),bodyP.replace('w:after="120"',`w:after="${120+i%10}"`))).join('')+direct('独立字号正文。第二套字号不能合并。',bodyP,font(12)));
  add('34-font-size-boundary','细微段间距可合并 / 字号必须分开',numericNoise,{body:{size:11}});
  const styeref=directScene('研究背景','实验方案');addStyles(styeref,style('Heading1','heading 1',headingP(1,true),font(24,'黑体','Arial',true)));
  styeref['word/header1.xml']=`<w:hdr xmlns:w="${W}"><w:p><w:fldSimple w:instr='STYLEREF "heading 1" \\l'><w:r><w:t>旧章节缓存</w:t></w:r></w:fldSimple></w:p></w:hdr>`;
  add('35-dynamic-header','直接格式标题 / STYLEREF 动态页眉',styeref,{heading1:{size:16}});
  for(const count of [1499,1500]){
    const distinct=packageParts('direct');addStyles(distinct,Array.from({length:count},(_,i)=>style(`Distinct${i}`,`独立样式 ${i}`,'',`<w:rPr><w:color w:val="${i.toString(16).padStart(6,'0')}"/></w:rPr>`)).join(''));
    story(distinct,styled(bodyText(0),'Normal'));
    add(`limit-distinct-${count}`,`${count+1} 个真实独立候选`,distinct,{},'有意义的不同颜色不能模糊合并；1501 候选应拒绝。');
  }
  for (const count of [100,1000,5000,10000]) {
    const big = story(packageParts(),Array.from({length:count},(_,i)=>styled(bodyText(i),'Normal')).join(''));
    add(`scale-paragraph-${count}`,`${count} 段 / 相同规范正文格式`,big,{body:{styleId:'Normal',size:11}});
  }
  for (const count of [100,500,1000,1499,1500]) {
    const noise = story(packageParts('direct'),Array.from({length:count},(_,i)=>direct(bodyText(i),bodyP.replace('w:after="120"',`w:after="${120+i%10}"`).replace('w:before="0"',`w:before="${Math.floor(i/100)%10}"`).replace('w:line="360"',`w:line="${360+Math.floor(i/10)%10}"`).replace('w:firstLine="480"',`w:firstLine="${480+Math.floor(i/1000)}"`))).join(''));
    add(`scale-format-${count}`,`${count} 种近似视觉格式 / 四项属性微差`,noise,{body:{size:11}},'段前/后最大相差 0.45 pt、行距相差 0.0375 倍、缩进相差 0.05 pt。此规模检查仅确认正文角色/字号，不能证明每个细微段落差异的取舍正确。候选包含 Normal，因此 1500 种样本会超过 1500 个总候选。');
  }
  for (const count of [10,50,100,250,500,1000]) {
    const chain = packageParts(); addStyles(chain,Array.from({length:count},(_,i)=>style(`Chain${i}`,`继承层 ${i}`,'','',i ? `Chain${i-1}`:'Normal')).join(''));
    story(chain,styled(bodyText(0),`Chain${count-1}`));
    add(`scale-inheritance-${count}`,`${count} 层样式继承`,chain,{},'无缓存的继承展开，独立进程 15 秒超时。');
  }
  const filter = process.argv[3], resultPath = path.join(output,'results.json');
  const records = filter && fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath,'utf8')).records : [];
  for (const scenario of cases.filter(c=>!filter || c.id.startsWith(filter))) {
    const file = path.join(output,scenario.id+'.docx'), baseline=path.resolve(process.env.WORD_TEMPLATE_STRESS_BASELINE || 'out/word-template-stress-baseline-d428e88',scenario.id+'.docx');
    const frozen=fs.existsSync(baseline);fs.writeFileSync(file,frozen?fs.readFileSync(baseline):bytes(scenario.parts));
    const samples=[];let childResult;
    for(let repetition=0;repetition<(scenario.id.startsWith('scale-')?3:1);repetition++) {
      childResult = cp.spawnSync(process.execPath,['--max-old-space-size=768',__filename,'--worker',file],{encoding:'utf8',timeout:15000,maxBuffer:25*1048576});
      try{const measured=JSON.parse(childResult.stdout);if(measured.ms)samples.push(measured.ms);}catch{}
    }
    let result; try { result=JSON.parse(childResult.stdout); } catch { result={error:childResult.error?.code==='ETIMEDOUT'?'TIMEOUT 15s':childResult.error?.message || childResult.stderr || 'worker exited'}; }
    const {profile,...metrics}=result, checks=profile ? score(profile,scenario.expected) : [];
    if(samples.length){metrics.ms=samples.slice().sort((a,b)=>a-b)[Math.floor(samples.length/2)];metrics.samplesMS=samples;}
    if (profile) fs.writeFileSync(path.join(output,scenario.id+'.profile.json'),JSON.stringify(profile,null,2));
    const record={id:scenario.id,label:scenario.label,note:scenario.note,bytes:fs.statSync(file).size,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),frozenBaseline:frozen,...metrics,candidates:profile?.candidates.length,correct:checks.filter(c=>c.status==='correct').length,total:checks.length,missing:checks.filter(c=>c.status==='missing').length,wrong:checks.filter(c=>c.status==='wrong').length,highConfidenceWrong:checks.filter(c=>c.status==='wrong'&&c.confidence==='high'&&!c.needsConfirmation).length,checks,warnings:profile?.warnings,page:profile?.page.summary,tableSummary:profile?.tableSummary};
    const previous = records.findIndex(r=>r.id===record.id); if(previous>=0) records[previous]=record; else records.push(record);
    console.log(`${record.id}: ${record.error || `${record.correct}/${record.total} correct; ${record.wrong} wrong; ${record.missing} missing; ${record.ms.toFixed(0)} ms; ${record.candidates} candidates`}`);
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),node:process.version,timeoutMS:15000,records},null,2));
  }
  console.log('Evidence: '+output);
}
if (process.argv[2] !== '--worker') main().catch(error => { console.error(error); process.exitCode = 1; });
