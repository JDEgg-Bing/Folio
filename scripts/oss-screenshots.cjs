// Capture the actual packaged application, with a clean shared public example.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const root = path.resolve(__dirname, '..'), output = path.join(root, 'docs/images');
const working = path.join(root, 'out/oss-screenshots', `run-${Date.now()}`), profile = path.join(working, 'profile');
const executablePath = process.env.FOLIO_ACCEPTANCE_EXECUTABLE || path.join(root, 'out/Folio-win32-x64/Folio.exe');
const file = path.join(root, 'docs/examples/quiet-writing.md'), template = path.join(working, '清晰文稿.docx');
const expected = fs.readFileSync(file, 'utf8');
fs.mkdirSync(working, { recursive: true }); fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(template, require('../tests/document/wordTemplateFixtures.ts').wordTemplateFixture('formal'));
let app;
(async () => {
  try {
    app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`] });
    const page = await app.firstWindow(); await page.locator('.cm-content').waitFor();
    const info = await page.evaluate(() => window.desktopAPI.getAppInfo()); assert.equal(info.version, require('../package.json').version); assert.equal(info.packaged, true);
    await page.getByRole('button', { name: '开始写作', exact: true }).click();
    const command = id => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(w => w.isVisible()).webContents.send('app:command', id), id);
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(w => w.isVisible()); window.setContentSize(1120, 940); window.webContents.setZoomFactor(1); });
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
    await command('open'); await page.locator('.document-table').waitFor();
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+Home'); await page.locator('.titlebar-document').click();
    for (const theme of ['light', 'dark']) {
      await app.evaluate(({ nativeTheme }, theme) => { nativeTheme.themeSource = theme; }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(output, `writing-${theme}.png`) });
    }
    await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light'; }); await page.emulateMedia({ colorScheme: 'light' });
    await command('word-templates'); await page.getByRole('button', { name: '导入 Word 模板…' }).waitFor();
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, template);
    await page.getByRole('button', { name: '导入 Word 模板…' }).click(); await page.getByRole('textbox', { name: '模板名称' }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.word-template-dialog [role="status"]'));
    await page.getByRole('textbox', { name: '模板名称' }).fill('清晰文稿');
    await page.locator('.word-template-dialog .appearance-body').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, 'word-template.png') });
    await page.keyboard.press('Escape'); await app.close(); app = null;
    assert.equal(fs.readFileSync(file, 'utf8'), expected);
    fs.writeFileSync(path.join(working, 'results.json'), JSON.stringify({ result: 'PASS', version: info.version, source: 'docs/examples/quiet-writing.md', method: 'Actual packaged Folio executable, isolated profile; no DOM or image edits', images: ['writing-light.png', 'writing-dark.png', 'word-template.png'] }, null, 2));
    console.log('PASS: three real application screenshots captured.');
  } finally { if (app) await app.close().catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
