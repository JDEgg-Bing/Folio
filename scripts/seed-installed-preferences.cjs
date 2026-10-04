// Generate reproducible preferences and a Word template through the actual isolated app.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'out/journey-design'), profile = path.join(output, 'installed-profile');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
(async () => {
  let app;
  try {
    const template = path.join(output, '保留的写作模板.docx');
    fs.writeFileSync(template, require('../tests/document/wordTemplateFixtures.ts').wordTemplateFixture('formal'));
    app = await _electron.launch({ executablePath: path.join(output, 'installed/Folio.exe'), args: [`--user-data-dir=${profile}`] });
    const page = await app.firstWindow(); await page.locator('.cm-content').waitFor();
    const info = await page.evaluate(() => window.desktopAPI.getAppInfo()); assert.equal(info.version, process.argv[2] || require('../package.json').version); assert.equal(path.resolve(info.dataPath), profile);
    if (await page.getByRole('button', { name: '开始写作', exact: true }).count()) await page.getByRole('button', { name: '开始写作', exact: true }).click();
    const command = id => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(w => w.isVisible()).webContents.send('app:command', id), id);
    await command('appearance'); await page.getByLabel('中文字体', { exact: true }).fill('Microsoft YaHei'); await page.getByLabel('正文字号（px）', { exact: true }).fill('19');
    const preferences = await page.evaluate(() => localStorage.getItem('markdown-editor.preferences.v1'));
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, path.join(output, 'seed-preserved.md'));
    await command('save'); await page.waitForFunction(() => document.querySelector('.status-document')?.textContent.includes('已保存'));
    await command('word-templates'); await page.getByRole('button', { name: '导入 Word 模板…' }).waitFor();
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, template);
    await page.getByRole('button', { name: '导入 Word 模板…' }).click(); await page.getByRole('textbox', { name: '模板名称' }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.word-template-dialog [role="status"]'));
    const warnings = page.getByRole('checkbox', { name: '我已了解这些限制，使用识别出的版式导出' }); if (await warnings.count()) await warnings.check();
    await page.getByRole('checkbox', { name: '下次优先使用此模板' }).check();
    await page.getByRole('button', { name: '保存模板', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.template-notice') || !document.querySelector('.word-template-dialog [role="status"]'));
    await page.keyboard.press('Escape');
    const library = await page.evaluate(() => window.desktopAPI.wordTemplates.list()); assert.equal(library.templates.length, 1); assert.equal(library.defaultId, library.templates[0].id);
    await app.close(); app = null;
    fs.mkdirSync(path.join(profile, 'recovery'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'recovery/draft.json'), JSON.stringify({ version: 1, text: '# 重装后恢复的文稿\n\n安装卸载验收内容。', fileHandleId: null, filePath: null, baseline: null, displayName: '恢复验收', options: { eol: 'LF', hadBom: false }, updatedAt: new Date().toISOString() }));
    fs.writeFileSync(path.join(output, '用户文稿.md'), '# 安装卸载保留的文稿\n'); fs.mkdirSync(path.join(output, '用户文稿.assets'), { recursive: true });
    fs.copyFileSync(path.join(root, 'manual-tests/long-document.assets/example.svg'), path.join(output, '用户文稿.assets/example.svg'));
    fs.writeFileSync(path.join(output, 'seeded-preferences.json'), JSON.stringify({ result: 'PASS', version: info.version, preferences: JSON.parse(preferences), templates: library.templates.length, method: 'Real application appearance/template dialogs; normal exit. Recovery fixture explicitly generated.' }, null, 2));
    console.log('PASS: preferences and template created through the real application.');
  } finally { if (app) await app.close().catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
