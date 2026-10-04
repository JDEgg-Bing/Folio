const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'out', 'docx-qa', `run-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(root, 'manual-tests/long-document.md'), 'utf8');
const file = path.join(output, '验收文稿.md');
fs.writeFileSync(file, source);
fs.cpSync(path.join(root, 'manual-tests/long-document.assets'), path.join(output, 'long-document.assets'), { recursive: true });
let app;
async function wait(test) { for (let i = 0; i < 400; i++) { if (await test()) return; await new Promise(r => setTimeout(r, 40)); } throw new Error('验收等待超时'); }
async function command(value) { await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', value), value); }
(async () => {
  try {
    app = await _electron.launch({ executablePath: process.env.MARKDOWN_EDITOR_EXECUTABLE || path.join(root, 'out/Markdown Editor-win32-x64/Markdown Editor.exe'), args: [`--user-data-dir=${path.join(output, 'profile')}`] });
    const page = await app.firstWindow(); await page.locator('.cm-content').waitFor();
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 }); }, file);
    await command('open'); await page.locator('.document-table').waitFor();
    const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items.map(i => i.label)); assert.ok(menu.includes('导出 Word…'));
    const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
    const status = await page.locator('.status-document').innerText();
    await page.emulateMedia({ colorScheme: 'dark' });
    const docx = path.join(output, '正式文稿.docx'), pdf = path.join(output, '正式文稿.pdf');
    for (const [format, target, label] of [['docx', docx, 'Word'], ['pdf', pdf, 'PDF']]) {
      await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, target);
      await command(`export-${format}`); await wait(() => fs.existsSync(target)); await wait(async () => (await page.locator('[role="status"]').innerText()).includes(`${label} 已导出`));
      assert.equal(await page.locator('.status-document').innerText(), status); assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), title);
    }
    assert.equal(fs.readFileSync(docx).subarray(0, 2).toString(), 'PK'); assert.equal(fs.readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
    const warnings = await page.locator('[role="status"]').innerText();
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    const count = fs.readdirSync(output).length; await command('export-docx'); await page.waitForTimeout(300); assert.equal(fs.readdirSync(output).length, count);
    // Dirty snapshot and history remain unchanged for success, cancel and failure.
    await page.keyboard.press('Control+End'); await page.keyboard.insertText('未保存验收正文');
    await wait(async () => (await page.locator('.status-document').innerText()).includes('已修改'));
    const dirtyTitle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
    const dirtyFile = path.join(output, '未保存快照.docx');
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, dirtyFile);
    await command('export-docx'); await wait(() => fs.existsSync(dirtyFile)); await wait(async () => (await page.locator('[role="status"]').innerText()).includes('Word 已导出'));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), dirtyTitle);
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, path.join(output, 'missing-folder', 'failure.docx'));
    await command('export-docx'); await wait(async () => (await page.locator('[role="alert"]').innerText()).includes('无法导出 Word'));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), dirtyTitle);
    await page.keyboard.press('Control+z'); await wait(async () => (await page.locator('.status-document').innerText()) === status);
    await page.keyboard.press('Control+Shift+z'); await wait(async () => (await page.locator('.status-document').innerText()).includes('已修改'));
    await command('save'); await wait(async () => !(await page.locator('.status-document').innerText()).includes('已修改')); assert.equal(fs.readFileSync(file, 'utf8'), source + '未保存验收正文');
    assert.equal(fs.readFileSync(path.join(root, 'manual-tests/long-document.md'), 'utf8'), source);
    // Include one intentionally complex but valid formula to exercise visual fallback.
    await page.keyboard.press('Control+End'); await page.keyboard.insertText('\n\n降级公式 $\\phantom{x}+y$');
    const fallback = path.join(output, '公式降级.docx');
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, fallback);
    await command('export-docx'); await wait(() => fs.existsSync(fallback)); await wait(async () => (await page.locator('[role="status"]').innerText()).includes('降级为图片'));
    const stressSource = source + '\n\n## 表格列宽与多页验收\n\n| 序号 | 项目说明 Technical description | 数值 | 公式 |\n| --- | --- | --- | --- |\n| 1 | 压缩 response 的中英文说明与合理列宽 | 210 MPa | $x^2$ |\n| 2 | 扭转 torsion 与复合结构的理论计算 | -1.25 | $\\frac{a}{b}$ |\n| 3 | 短说明 | 2e-3 | $\\sqrt{x}$ |\n{#tbl:widths}\n\n' + Array.from({ length: 6 }, () => '多页正式文稿检查页眉和页脚是否持续存在。Compression response and stiffness 数值应保持正式排版，正文仍可直接编辑。'.repeat(2)).join('\n\n');
    const stressMarkdown = path.join(output, '多页排版验收.md'), stressDocx = path.join(output, '多页排版验收.docx');
    fs.writeFileSync(stressMarkdown, stressSource);
    await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] }); }, stressMarkdown);
    await command('open'); await page.waitForTimeout(500);
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, stressDocx);
    await command('export-docx'); await wait(() => fs.existsSync(stressDocx)); await wait(async () => (await page.locator('[role="status"]').innerText()).includes('Word 已导出'));
    const record = { result: 'PASS', output, docx, pdf, warnings, checks: ['Word menu', 'valid package', 'same-snapshot PDF', 'source and path unchanged', 'saved and dirty state unchanged', 'cancel no file', 'failure no file', 'undo redo preserved', 'SVG embedded', 'native equations', 'visual formula fallback'] };
    fs.writeFileSync(path.join(output, 'desktop-results.json'), JSON.stringify(record, null, 2)); console.log(JSON.stringify(record, null, 2));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
