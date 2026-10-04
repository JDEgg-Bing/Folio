// Packaged-app export acceptance. All documents and preferences are isolated.
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), product = require('../package.json').productName;
const output = path.join(root, 'out/export-layout', `run-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const original = fs.readFileSync(path.join(root, 'manual-tests/export-layout.md'), 'utf8');
const paragraph = '长文本分页验证需要关注标题与后续正文的联系，避免孤立标题和不必要的空白。材料在压缩与扭转载荷下的响应取决于几何结构、加载速度与边界条件。The response depends on geometry, loading rate, and boundary conditions. 每一页的正文、页眉与页码应具有统一的节奏。';
const source = original + '\n\n## 连续测量记录\n\n| 记录编号 | 测量说明 | 数值 |\n| --- | --- | --- |\n' + Array.from({ length: 56 }, (_, i) => `| ${i + 1} | 连续测量记录 ${i + 1} · compression response | ${(i * 0.37).toFixed(2)} MPa |`).join('\n') + '\n{#tbl:long}\n\n## 长代码换行\n\n```ts\n' + Array.from({ length: 40 }, (_, i) => `const observation${i + 1} = ${i}; // 可编辑计算记录`).join('\n') + '\nconst longIdentifier = "' + 'long_token_'.repeat(35) + '";\n```\n\n## 长文本阅读\n\n' + Array.from({ length: 8 }, () => paragraph.repeat(2)).join('\n\n') + '\n\n## 最终结论\n\n末尾内容应完整保留。END OF MANUSCRIPT。\n';
const file = path.join(output, '排版验证.md'); fs.writeFileSync(file, source);
fs.cpSync(path.join(root, 'manual-tests/long-document.assets'), path.join(output, 'long-document.assets'), { recursive: true });
const profile = path.join(output, 'profile'), launcher = path.join(output, 'launcher.cjs');
fs.writeFileSync(launcher, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root, `out/${product}-win32-x64/resources/app.asar/.webpack/main/index.js`))});`);
let app, page; const errors = [], records = [];
async function wait(check) { for (let i = 0; i < 600; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('Acceptance timed out'); }
async function command(id) { await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', id), id); }
(async () => {
  try {
    app = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [launcher] });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.locator('.cm-content').waitFor();
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 }); }, file);
    await command('open'); await page.locator('.document-table').waitFor();
    const status = await page.locator('.status-document').innerText(), title = await page.title();
    // Dark editor appearance must not tint the exported page.
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const [choice, preset] of ['manuscript', 'academic', 'reading'].entries()) {
      await app.evaluate(({ dialog }, response) => { dialog.showMessageBox = async (_window, options) => { if (options.message === '选择导出版式') return { response }; return { response: 1 }; }; }, choice);
      for (const format of ['pdf', 'docx']) {
        const target = path.join(output, `${preset}.${format}`);
        await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, target);
        await command(`export-${format}`); await wait(() => fs.existsSync(target));
        await wait(async () => (await page.locator('[role="status"]').innerText()).includes('已导出'));
        assert.ok(!(await page.locator('[role="status"]').innerText()).includes('不可用'));
        assert.equal(fs.readFileSync(file, 'utf8'), source); assert.equal(await page.locator('.status-document').innerText(), status); assert.equal(await page.title(), title);
        records.push({ preset, format, bytes: fs.statSync(target).size });
      }
    }
    await page.getByRole('button', { name: '关闭导出提示' }).click();
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 3 }); dialog.showSaveDialog = async () => { throw new Error('Preset cancellation must skip the save dialog'); }; });
    await command('export-pdf'); await page.waitForTimeout(300); assert.equal(await page.locator('[role="status"]').count(), 0);
    // Export a dirty snapshot and prove that it leaves undo/redo intact.
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('未保存快照验收');
    await wait(async () => (await page.locator('.status-document').innerText()).includes('已修改'));
    const dirtyTitle = await page.title(), target = path.join(output, 'dirty.docx');
    await app.evaluate(({ dialog }, target) => { dialog.showMessageBox = async () => ({ response: 0 }); dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, target);
    await command('export-docx'); await wait(() => fs.existsSync(target)); assert.equal(await page.title(), dirtyTitle); assert.equal(fs.readFileSync(file, 'utf8'), source);
    await page.keyboard.press('Control+z'); await wait(async () => (await page.locator('.status-document').innerText()) === status);
    await page.keyboard.press('Control+Shift+z'); await wait(async () => (await page.locator('.status-document').innerText()).includes('已修改'));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.isVisible()).length), 1); assert.deepEqual(errors, []);
    assert.equal(fs.readFileSync(path.join(root, 'manual-tests/export-layout.md'), 'utf8'), original);
    fs.writeFileSync(path.join(output, 'desktop-results.json'), JSON.stringify({ result: 'PASS', records, checks: ['three presets', 'saved and dirty snapshots', 'source unchanged', 'undo redo', 'preset cancellation', 'sandbox windows closed'], errors }, null, 2));
    console.log(JSON.stringify({ result: 'PASS', output, records }, null, 2));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
