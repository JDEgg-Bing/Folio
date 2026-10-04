// Packaged desktop acceptance with real DOCX fixtures and an isolated user profile.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { wordTemplateFixture } = require('../tests/document/wordTemplateFixtures.ts');
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), product = require('../package.json').productName;
const pkg = require('../package.json');
const executablePath = process.env.FOLIO_ACCEPTANCE_EXECUTABLE || path.join(root, `out/${product}-win32-x64/Folio.exe`);
const build = require('./release-evidence.cjs').buildIdentity(path.dirname(executablePath));
const output = path.join(root, 'out/word-templates', `run-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
for (const kind of ['formal', 'technical', 'direct']) fs.writeFileSync(path.join(output, `${kind}-template.docx`), wordTemplateFixture(kind));
const original = fs.readFileSync(path.join(root, 'manual-tests/export-layout.md'), 'utf8');
const source = original + '\n\n# 验收正文一级标题\n\n表 3 补充数据\n\n| 参数 | 数据 |\n| --- | ---: |\n| Editable | 210 |\n\n## 末尾检查\n\nEND OF TEMPLATE EXPORT。\n';
const file = path.join(output, 'template-source.md'); fs.writeFileSync(file, source);
fs.cpSync(path.join(root, 'manual-tests/long-document.assets'), path.join(output, 'long-document.assets'), { recursive: true });
const profile = path.join(output, 'profile');
let app, page, openedOnce = false; const errors = [], records = [];
async function command(id) { await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', id), id); }
async function open() {
  app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`] });
  page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await page.locator('.cm-content').waitFor();
  await page.evaluate(()=>window.desktopAPI.onDecisionRequest(request=>{const answer=request.selection?'manuscript':request.choices.some(c=>c.id==='discard')?'discard':request.cancelChoice;const act = () => {
        const dialog = document.querySelector('[aria-labelledby="decision-' + request.id + '"]');
        if (!dialog) { setTimeout(act, 50); return; }
        if (request.selection) {
          const choice = request.choices.find(c=>c.id===answer);
          const card = [...dialog.querySelectorAll('.decision-option')].find(c=>c.querySelector('strong')?.textContent===choice?.label);
          if (card) { card.querySelector('input').click(); dialog.querySelector('.primary').click(); }
          else dialog.querySelector('button').click();
        } else {
          const label=request.choices.find(c=>c.id===answer)?.label;
          [...dialog.querySelectorAll('button')].find(b=>b.textContent===label)?.click();
        }
      }; setTimeout(act, 50);}));
  if (!openedOnce) { await page.getByRole('button', { name: '开始写作', exact: true }).waitFor(); await page.getByRole('button', { name: '开始写作', exact: true }).click(); openedOnce = true; }
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 }); }, file);
  await command('open'); await page.locator('.document-table').waitFor();
}
(async () => {
  try {
    await open(); const status = await page.locator('.status-document').innerText(), title = await page.title();
    for (const kind of ['formal','technical','direct']) {
      await command('word-templates'); await page.getByRole('button', { name: '导入 Word 模板…' }).waitFor();
      const template = path.join(output, `${kind}-template.docx`), target = path.join(output, `${kind}.docx`);
      await app.evaluate(({ dialog }, [template, target]) => { dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[template] }); dialog.showSaveDialog = async () => ({ canceled:false, filePath:target }); }, [template,target]);
      await page.getByRole('button', { name:'导入 Word 模板…' }).click();
      await page.getByRole('textbox', { name:'模板名称' }).waitFor();
      await page.waitForFunction(name=>document.querySelector('input[aria-label="模板名称"]')?.value===name && !document.querySelector('.word-template-dialog [role="status"]'),`${kind}-template`);
      assert.ok(await page.getByRole('combobox', { name:'正文映射' }).inputValue());
      assert.ok(await page.getByRole('combobox', { name:'一级标题映射' }).inputValue());
      if (kind === 'direct') assert.ok((await page.locator('.word-template-dialog').innerText()).includes('建议核对'));
      const warnings = page.getByRole('checkbox', { name:'我已了解这些限制，使用识别出的版式导出' }); if (await warnings.count()) await warnings.check();
      await page.getByRole('checkbox', { name:'下次优先使用此模板' }).check();
      await page.locator('.word-template-dialog .appearance-body').evaluate(element=>{element.scrollTop=0;});
      await page.screenshot({ path:path.join(output,`${kind}-recognition.png`) });
      await page.getByRole('button', { name:'按此模板导出 Word' }).click();
      await page.locator('.word-template-dialog').waitFor({ state:'detached' });
      await page.waitForFunction(() => document.querySelector('.export-notice')?.textContent.includes('已导出'));
      assert.ok(fs.existsSync(target)); assert.equal(fs.readFileSync(file,'utf8'),source); assert.equal(await page.locator('.status-document').innerText(),status); assert.equal(await page.title(),title);
      records.push({ kind, bytes:fs.statSync(target).size, recognized:true, sourceUnchanged:true });
    }
    // Reopen the desktop app: default, names and mappings must survive without reanalysis.
    await app.close(); app=null; await open(); await command('export-docx');
    await page.getByRole('textbox', { name:'模板名称' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name:'模板名称' }).inputValue(),'direct-template');
    assert.equal(await page.getByRole('combobox', { name:'选择模板' }).locator('option').count(),4);
    const reused=path.join(output,'reused.docx'); await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},reused);
    await page.getByRole('button',{name:'按此模板导出 Word'}).click(); await page.locator('.word-template-dialog').waitFor({state:'detached'}); assert.ok(fs.existsSync(reused));
    // Dirty snapshot and Undo/Redo stay in the Markdown editor.
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('未保存模板快照');
    await command('export-docx'); await page.getByRole('button',{name:'按此模板导出 Word'}).waitFor();
    const dirty=path.join(output,'dirty.docx'); await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},dirty);
    await page.getByRole('button',{name:'按此模板导出 Word'}).click(); await page.locator('.word-template-dialog').waitFor({state:'detached'});
    assert.ok((await page.locator('.status-document').innerText()).includes('已修改')); assert.equal(fs.readFileSync(file,'utf8'),source);
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+z'); assert.equal(await page.locator('.status-document').innerText(),status);
    await page.keyboard.press('Control+Shift+z'); assert.ok((await page.locator('.status-document').innerText()).includes('已修改'));
    // Cancel an import, then use the built-in ordinary Word export.
    await command('word-templates'); await page.getByRole('button',{name:'导入 Word 模板…'}).waitFor();
    await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});
    await page.getByRole('button',{name:'导入 Word 模板…'}).click();
    await page.getByRole('combobox',{name:'选择模板'}).selectOption('');
    const plain=path.join(output,'ordinary.docx'); await app.evaluate(({dialog},target)=>{dialog.showMessageBox=async()=>({response:0});dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},plain);
    await page.getByRole('button',{name:'导出 Word',exact:true}).click(); await page.locator('.word-template-dialog').waitFor({state:'detached'}); assert.ok(fs.existsSync(plain));
    assert.deepEqual(errors,[]); assert.equal(fs.readFileSync(file,'utf8'),source);
    assert.deepEqual(require('./release-evidence.cjs').buildIdentity(path.dirname(executablePath)), build);
    fs.writeFileSync(path.join(output,'desktop-results.json'),JSON.stringify({result:'PASS',version:pkg.version,build,records,restartReuse:true,ordinaryExport:true,dirtyUndoRedo:true,errors},null,2));
    console.log(JSON.stringify({result:'PASS',output,records},null,2));
  } finally { if(app) { await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}); await app.close(); } }
})().catch(e=>{console.error(e);process.exitCode=1;});
