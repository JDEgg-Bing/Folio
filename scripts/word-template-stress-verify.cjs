// Export and packaged desktop evidence for the controlled recognition probes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const { renderDocx } = require('../src/document/export/DocxRenderer.ts');
const { DEFAULT_WRITING_APPEARANCE } = require('../src/renderer/preferences/WritingAppearance.ts');
const { modelFor } = require('../tests/document/helpers.ts');
const { templatePng } = require('../tests/document/wordTemplateFixtures.ts');
const { elements, parseXml, child, attr } = require('../src/document/templates/WordXml.ts');
const { WordTemplateStore } = require('../src/main/export/WordTemplateStore.ts');
const root = path.resolve(__dirname,'..'), output = path.resolve(process.argv[2] || 'out/word-template-stress');
const source = '# 压力测试报告\n\n正文 BODY CHECK。Chinese and English，**加粗** *斜体*，参见 [@fig:f] [@eq:e] [@tbl:t]。\n\n# 研究背景 {#sec:s}\n\n## 实验方案\n\n### 过程细节\n\n1. 第一项\n2. 第二项\n\n> 引用段落\n\n![实验装置](image.png){#fig:f}\n\n表 1 数据说明\n\n| 参数 | 数值 |\n| --- | ---: |\n| 响应 | $x^2$ |\n{#tbl:t}\n\n$$\nE=mc^2\n$$\n{#eq:e}\n\n[外部链接](https://example.com)\n\nEND OF STRESS EXPORT。';
function size(c) { return Number(attr(child(parseXml(c.run).documentElement,'sz')))/2; }
async function exportExamples() {
  fs.writeFileSync(path.join(output,'source.md'),source);
  const records=[];
  const exportStore=new WordTemplateStore(path.join(output,'export-library'));
  for (const id of ['02-rich-rules','05-visual-only','11-unused-heading','21-instructions-dominate','22-sections-columns','23-multiple-tables','12-conflicting-heading','35-dynamic-header']) {
    const bytes = fs.readFileSync(path.join(output,id+'.docx')), original = JSON.parse(fs.readFileSync(path.join(output,id+'.profile.json'),'utf8'));
    for (const mode of ['auto',...(['05-visual-only','11-unused-heading','21-instructions-dominate','12-conflicting-heading'].includes(id)?['corrected']:[])]) {
      const imported=await exportStore.import(bytes,id),profileDraft=structuredClone(imported);
      if(mode==='corrected') for(const [role,point] of [['body',11],['heading1',16],['heading2',14]]) {
        const c=profileDraft.candidates.find(c=>c.source==='sample'&&size(c)===(id==='12-conflicting-heading'&&role==='heading1'?18:point)); if(c) profileDraft.mappings[role].candidateId=c.id;
      }
      const requiredRoles=Object.entries(imported.mappings).filter(([,m])=>m.needsConfirmation).map(([role])=>role);
      const profile=await exportStore.confirm({id:imported.id,name:imported.name,mappings:Object.fromEntries(Object.entries(profileDraft.mappings).map(([r,m])=>[r,m.candidateId])),confirmedRoles:requiredRoles,warningsAccepted:true,makeDefault:false});
      const model=modelFor(source), snapshot=JSON.stringify(model.root);
      const result=await renderDocx({model,appearance:DEFAULT_WRITING_APPEARANCE,template:{bytes,profile},signal:new AbortController().signal,resources:{read:async()=>({bytes:templatePng,mime:'image/png'})}},{image:async()=>templatePng,formula:async()=>templatePng});
      assert.equal(JSON.stringify(model.root),snapshot); assert.equal(fs.readFileSync(path.join(output,'source.md'),'utf8'),source);
      fs.writeFileSync(path.join(output,`${id}-${mode}.docx`),result.bytes);
      records.push({id,mode,confirmedConflictRoles:requiredRoles,bytes:result.bytes.length,sourceUnchanged:true,diagnostics:result.diagnostics});
    }
  }
  const storeFolder=path.join(output,'large-library'), store=new WordTemplateStore(storeFolder);
  const p=await store.import(fs.readFileSync(path.join(output,'limit-distinct-1499.docx')),'1500 候选压力模板');
  const confirmation={id:p.id,name:p.name,mappings:Object.fromEntries(Object.entries(p.mappings).map(([role,m])=>[role,m.candidateId])),warningsAccepted:true,makeDefault:true};
  const start=performance.now(); await store.confirm(confirmation); const savedMS=performance.now()-start;
  const reloadStart=performance.now(), reloaded=await new WordTemplateStore(storeFolder).get(p.id); const reloadMS=performance.now()-reloadStart;
  assert.equal(reloaded.profile.candidates.length,1500); assert.deepEqual(reloaded.profile.mappings.body.candidateId,p.mappings.body.candidateId); assert.deepEqual(reloaded.bytes,fs.readFileSync(path.join(output,'limit-distinct-1499.docx')));
  fs.writeFileSync(path.join(output,'export-results.json'),JSON.stringify({records,largeLibrary:{candidates:1500,savedMS,reloadMS,roundtrip:true}},null,2));
  console.log(JSON.stringify({records,largeLibrary:{savedMS,reloadMS}},null,2));
}
async function desktop() {
  const {_electron}=require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
  const profile=path.join(output,'desktop-profile-'+Date.now()), launcher=path.join(output,'desktop-launcher.cjs');
  fs.writeFileSync(launcher,`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root,`out/${require('../package.json').productName}-win32-x64/resources/app.asar/.webpack/main/index.js`))});`);
  const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[launcher]}), errors=[], records=[];
  let closed=false;app.on('close',()=>{closed=true;});
  try {
    const page=await app.firstWindow(); page.on('pageerror',error=>errors.push(error.message)); await page.locator('.cm-content').waitFor();
    for(const id of ['05-visual-only','11-unused-heading','scale-format-1499','limit-distinct-1499','limit-distinct-1500']) {
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app:command','word-templates'));
      await page.getByRole('button',{name:'导入 Word 模板…'}).waitFor();
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(output,id+'.docx'));
      const start=performance.now(); await page.getByRole('button',{name:'导入 Word 模板…'}).click();
      if(id==='limit-distinct-1500') {
        await page.getByRole('alert').waitFor(); records.push({id,ms:performance.now()-start,error:await page.getByRole('alert').innerText()});
      } else {
        await page.getByRole('textbox',{name:'模板名称'}).waitFor();
        const ms=performance.now()-start, mappings={};
        for(const role of ['正文','一级标题','二级标题']) { const select=page.getByRole('combobox',{name:role+'映射'}); mappings[role]={value:await select.inputValue(),options:await select.locator('option').count()}; }
        const text=await page.locator('.word-template-dialog').innerText();
        for(const mapping of Object.values(mappings))assert.ok(mapping.options<=8);
        if(id==='11-unused-heading')assert.ok(text.includes('需确认'));
        records.push({id,ms,mappings,domOptions:await page.locator('.word-template-dialog option').count(),text});
        await page.locator('.appearance-body').evaluate(el=>{el.scrollTop=0;}); await page.screenshot({path:path.join(output,id+'-desktop.png')});
        if(id==='11-unused-heading') {
          const rejected=await page.evaluate(async()=>{const api=window.desktopAPI.wordTemplates,id=document.querySelector('select[aria-label="选择模板"]').value;try{await api.confirm({id,name:'Conflict',mappings:Object.fromEntries(Object.entries({body:'正文',title:'文档主标题',heading1:'一级标题',heading2:'二级标题',heading3:'三级标题',heading4:'四级标题',heading5:'五级标题',heading6:'六级标题',figureCaption:'图题',tableCaption:'表题',quote:'引用',list:'列表',equation:'公式',tableText:'表格文字',code:'代码'}).map(([r,label])=>[r,document.querySelector(`select[aria-label="${label}映射"]`).value||null])),warningsAccepted:true,makeDefault:false});return '';}catch(e){return e.message;}});
          assert.ok(rejected.includes('单独确认'));
          await page.getByRole('checkbox',{name:'我已了解这些限制，使用识别出的版式导出'}).check();assert.ok(await page.getByRole('button',{name:'保存模板',exact:true}).isDisabled());
          await page.locator('#template-mapping-heading1').getByRole('button',{name:'使用此格式',exact:true}).click();assert.ok(await page.getByRole('button',{name:'保存模板',exact:true}).isEnabled());
        }
        if(id==='limit-distinct-1499') {
          await page.getByRole('combobox',{name:'正文映射'}).selectOption('__browse__');
          await page.getByRole('textbox',{name:'查找已有格式'}).waitFor();
          assert.ok(await page.locator('.template-chooser button').count()<=12);
          await page.getByRole('textbox',{name:'查找已有格式'}).fill('独立样式 1498');
          await page.locator('.template-chooser button').filter({hasText:'独立样式 1498'}).click();
          assert.equal(await page.getByRole('combobox',{name:'正文映射'}).inputValue(),'style:Distinct1498');
        }
      }
      await page.getByRole('button',{name:'关闭',exact:true}).click(); await page.locator('.word-template-dialog').waitFor({state:'detached'});
    }
    // Cancel a real packaged worker while checking independent IPC remains responsive.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app:command','word-templates'));
    await page.getByRole('button',{name:'导入 Word 模板…'}).waitFor();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(output,'scale-paragraph-10000.docx'));
    await page.getByRole('button',{name:'导入 Word 模板…'}).click();await page.getByRole('button',{name:'取消分析'}).waitFor();
    const responsiveStart=performance.now();await page.evaluate(()=>window.desktopAPI.wordTemplates.list());const responsiveMS=performance.now()-responsiveStart;assert.ok(responsiveMS<1000);
    const cancelStart=performance.now();await page.getByRole('button',{name:'取消分析'}).click();await page.getByRole('button',{name:'导入 Word 模板…'}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.word-template-dialog [role="status"]'));const cancelMS=performance.now()-cancelStart;assert.ok(cancelMS<1000);
    records.push({id:'worker-cancel',responsiveMS,cancelMS});await page.getByRole('button',{name:'关闭',exact:true}).click();
    // Saved confirmed choices remain intact during reanalysis, then retain identity after save.
    const saved=await page.evaluate(async()=>{const api=window.desktopAPI.wordTemplates,p=await api.import(crypto.randomUUID());return api.confirm({id:p.id,name:'复用压力模板',mappings:Object.fromEntries(Object.entries(p.mappings).map(([r,m])=>[r,m.candidateId])),warningsAccepted:true,makeDefault:true,confirmedRoles:Object.keys(p.mappings)});});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app:command','word-templates'));await page.getByRole('button',{name:'重新识别',exact:true}).waitFor();
    await page.getByRole('button',{name:'重新识别',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.template-help')?.textContent.includes('已保留'));
    const during=await page.evaluate(()=>window.desktopAPI.wordTemplates.list());assert.equal(during.defaultId,saved.id);assert.deepEqual(during.templates[0].mappings,saved.mappings);
    const warning=page.getByRole('checkbox',{name:'我已了解这些限制，使用识别出的版式导出'});if(await warning.count())await warning.check();
    await page.getByRole('button',{name:'保存模板',exact:true}).click();await page.getByRole('button',{name:'重新识别',exact:true}).waitFor();
    const after=await page.evaluate(()=>window.desktopAPI.wordTemplates.list());assert.equal(after.defaultId,saved.id);assert.equal(after.templates.length,1);records.push({id:'reanalyze-reuse',sameIdentity:true});await page.getByRole('button',{name:'关闭',exact:true}).click();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app:command','word-templates'));await page.getByRole('button',{name:'导入 Word 模板…'}).waitFor();
    await page.getByRole('button',{name:'导入 Word 模板…'}).click();await page.getByRole('button',{name:'取消分析'}).waitFor();
    const closing=app.waitForEvent('close',{timeout:5000}),closeStart=performance.now();
    try{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());}catch(e){if(!/closed/i.test(e.message))throw e;}
    await closing;records.push({id:'worker-window-close',ms:performance.now()-closeStart,closed:true});
    assert.deepEqual(errors,[]); fs.writeFileSync(path.join(output,'desktop-results.json'),JSON.stringify({records,errors},null,2));
    console.log(JSON.stringify(records.map(({text,...record})=>record),null,2));
  } finally { if(!closed)await app.close(); }
}
(process.argv.includes('--desktop')?desktop():exportExamples()).catch(error=>{console.error(error);process.exitCode=1;});
