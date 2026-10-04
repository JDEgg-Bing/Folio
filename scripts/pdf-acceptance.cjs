const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'out', 'pdf-qa', `run-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const file = path.join(output, '验收文稿.md');
const original = fs.readFileSync(path.join(root, 'manual-tests/long-document.md'), 'utf8');
const title = '压缩–扭转耦合超材料的时空刚度调控';
const paragraph = '压缩与扭转耦合结构中的刚度响应需要同时比较理论与实验结果。The compression response depends on geometry and boundary conditions. 中英文混排保留正式文稿的密度、首行缩进与两端对齐。';
const source = original.replace(/^# [^\r\n]+/, `# ${title} {#sec:report}`) + '\n\n## 5.2 长段落排版测试\n\n' + Array.from({ length: 16 }, () => paragraph.repeat(2)).join('\n\n') + '\n\n## 6. 最终结论\n\n结论段落确认章节跳转与正式导出顺序。';
fs.writeFileSync(file, source);
fs.cpSync(path.join(root, 'manual-tests/long-document.assets'), path.join(output, 'long-document.assets'), { recursive: true });
let app;
const errors = [], observed = {};
async function command(value) { await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', value), value); }
async function wait(test) { for (let i = 0; i < 300; i++) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 30)); } throw new Error('Runtime assertion timeout'); }
async function active(page) { return page.locator('.outline-item.active').innerText(); }
(async () => {
  try {
    app = await _electron.launch({ executablePath: path.join(root, 'out/Markdown Editor-win32-x64/Markdown Editor.exe'), args: [`--user-data-dir=${path.join(output, 'profile')}`] });
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.locator('.cm-content').waitFor();
    await app.evaluate(({ BrowserWindow, dialog }, file) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 900);
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      dialog.showMessageBox = async () => ({ response: 1 });
    }, file);
    await command('open'); await page.locator('.document-table').waitFor();
    await command('toggle:outlineVisible'); await page.locator('.document-outline').waitFor();
    observed.windowTitle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
    observed.statusTitle = await page.locator('.status-document').innerText();
    assert.equal(observed.windowTitle, `${title} — Markdown Editor`);
    assert.equal(observed.statusTitle, `${title} · 已保存`);
    observed.prose = await page.locator('.cm-writing-paragraph').first().evaluate(el => ({ indent: getComputedStyle(el).textIndent, align: getComputedStyle(el).textAlign }));
    assert.deepEqual(observed.prose, { indent: '32px', align: 'justify' });
    await page.keyboard.press('Control+f');
    await page.getByPlaceholder('查找', { exact: true }).fill('引用说明');
    await page.getByRole('button', { name: '下一个', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(output, 'quote-active.png') });
    assert.ok((await page.locator('.cm-writing-quote-active').innerText()).includes('>'));
    await page.keyboard.press('Control+Home');
    observed.quote = await page.locator('.cm-writing-quote:not(.cm-writing-quote-active)').first().evaluate(el => ({ text: el.textContent, border: getComputedStyle(el).borderLeftWidth, color: getComputedStyle(el).color, align: getComputedStyle(el).textAlign }));
    assert.ok(!observed.quote.text.includes('>')); assert.equal(observed.quote.border, '1px'); assert.notEqual(observed.quote.align, 'justify');
    await page.screenshot({ path: path.join(output, 'editor-light.png') });
    await page.getByRole('listitem', { name: '6. 最终结论', exact: true }).click();
    await wait(async () => await active(page) === '6. 最终结论'); await page.waitForTimeout(600);
    assert.equal(await active(page), '6. 最终结论');
    observed.finalHeadingTop = await page.locator('.cm-preview-h2').filter({ hasText: '6. 最终结论' }).evaluate(el => el.getBoundingClientRect().top - document.querySelector('.cm-scroller').getBoundingClientRect().top);
    assert.ok(observed.finalHeadingTop >= 0 && observed.finalHeadingTop < 60);
    await page.screenshot({ path: path.join(output, 'outline-final.png') });
    await page.mouse.move(400, 300); await page.mouse.wheel(0, -450);
    await wait(async () => await active(page) === '5.2 长段落排版测试');
    observed.manualScrollHeading = await active(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    const pdf = path.join(output, '正式文稿.pdf');
    await app.evaluate(({ dialog }, pdf) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: pdf }); }, pdf);
    const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items.map(item => item.label));
    assert.ok(menu.includes('导出 PDF…'));
    await command('export-pdf');
    await wait(async () => fs.existsSync(pdf));
    await wait(async () => (await page.locator('[role="status"]').innerText()).includes('PDF 已导出'));
    assert.equal(fs.readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
    assert.equal(fs.readFileSync(file, 'utf8'), source);
    observed.pdfBytes = fs.statSync(pdf).size;
    observed.exportNotice = await page.locator('[role="status"]').innerText();
    assert.ok(!observed.statusTitle.includes('已修改'));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.isVisible()).length), 1);
    await page.getByRole('button', { name: '关闭导出提示' }).click();
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    await command('export-pdf'); await page.waitForTimeout(300);
    assert.equal(await page.locator('[role="status"]').count(), 0);
    // Unsaved H1 must also produce the same document identity in both places.
    await command('new'); await page.keyboard.insertText('# 未保存论文标题\n\n正文');
    await wait(async () => (await page.locator('.status-document').innerText()) === '未保存论文标题 · 已修改');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), '未保存论文标题 • — Markdown Editor');
    await page.keyboard.press('Control+a'); await page.keyboard.insertText('普通正文');
    await wait(async () => (await page.locator('.status-document').innerText()) === '未命名文档 · 已修改');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'PASS', observed, pdf }, null, 2));
    console.log(JSON.stringify({ result: 'PASS', observed, pdf, artifacts: output }, null, 2));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
