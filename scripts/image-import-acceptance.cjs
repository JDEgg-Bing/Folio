// Packaged application checks with isolated files/profile. Native file picker
// results are controlled; file drag events carry actual filesystem paths.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const { unzipSync, strFromU8 } = require('fflate');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'out/image-import', `run-${Date.now()}`);
const profile = path.join(output, 'profile'), file = path.join(output, '文稿.md');
fs.mkdirSync(path.join(output, 'old.assets'), { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB0kAAAAASUVORK5CYII=', 'base64');
const dropped = path.join(output, '拖入 图片.png'), chosen = path.join(output, '菜单 图片.svg'), other = path.join(output, 'ignore.txt');
fs.writeFileSync(dropped, png); fs.writeFileSync(path.join(output, 'old.assets', 'legacy.png'), png);
fs.writeFileSync(chosen, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="green"/></svg>');
fs.writeFileSync(other, 'not an image');
const initial = '# 图片验收\n\n**alpha bravo charlie delta**\n\n- [ ] todo\n- [x] done\n  - [X] nested\n  - child\n- ordinary\n\n1. numbered\n\n![legacy](old.assets/legacy.png)\n\nend\n';
fs.writeFileSync(file, initial);
let app, page;
const checks = [], errors = [];
const command = id => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(window => window.isVisible()).webContents.send('app:command', id), id);
async function wait(test, label) {
  for (let count = 0; count < 200; count++) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 40)); }
  throw new Error(`Timed out: ${label}`);
}
async function picker(filePaths, canceled = false) {
  await app.evaluate(({ dialog }, [filePaths, canceled]) => { dialog.showOpenDialog = async () => ({ canceled, filePaths }); }, [filePaths, canceled]);
}
async function savePicker(filePath, canceled = false) {
  await app.evaluate(({ dialog }, [filePath, canceled]) => { dialog.showSaveDialog = async () => ({ canceled, filePath }); }, [filePath, canceled]);
}
async function imagesLoaded(count) {
  await wait(async () => page.locator('.document-figure img').evaluateAll((images, count) => images.length === count && images.every(image => image.complete && image.naturalWidth > 0), count), `${count} images loaded`);
}
async function exportFile(format, text) {
  const target = path.join(output, `export.${format}`); await savePicker(target);
  await picker([file]);
  const opened = await page.evaluate(() => window.desktopAPI.openDocument());
  const pending = page.evaluate(async ({ format, text, fileHandleId }) => {
    const request = { text, fileHandleId, appearance: {}, suggestedName: 'export.md' };
    return format === 'pdf' ? window.desktopAPI.exportPdf(request) : window.desktopAPI.exportDocx(request);
  }, { format, text, fileHandleId: opened.fileHandleId });
  await page.locator('.decision-dialog').waitFor();
  await page.getByRole('button', { name: '选择保存位置', exact: true }).click();
  const result = await pending; assert.deepEqual(result.diagnostics, []);
  const bytes = fs.readFileSync(target);
  if (format === 'pdf') { assert.equal(bytes.subarray(0, 4).toString(), '%PDF'); assert.ok(bytes.length > 1000); }
  else {
    const zip = unzipSync(bytes), xml = strFromU8(zip['word/document.xml']);
    assert.ok(xml.includes('☐') && xml.includes('☑'));
    assert.equal(Object.keys(zip).filter(name => name.startsWith('word/media/')).length, 3);
    assert.ok(!xml.includes('图片不可用'));
  }
}
(async () => {
  try {
    app = await _electron.launch({ executablePath: process.env.FOLIO_ACCEPTANCE_EXECUTABLE || path.join(root, 'out/Folio-win32-x64/Folio.exe'), args: [`--user-data-dir=${profile}`, file], timeout: 30000 });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.locator('.cm-content').waitFor(); await imagesLoaded(1);
    await wait(async () => (await page.locator('.status-document').innerText()).includes('已保存'), 'open saved document');
    assert.equal(await page.locator('.cm-preview-task').count(), 3);
    checks.push('Packaged GFM task/list preview and existing relative .assets image');
    const textPoints = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.querySelector('.cm-content'), NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, text = node.textContent;
        if (!text.includes('bravo charlie')) continue;
        return [text.indexOf('bravo'), text.indexOf('charlie') + 7].map(offset => {
          const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset);
          const rect = range.getBoundingClientRect(); return { x: rect.left, y: (rect.top + rect.bottom) / 2 };
        });
      }
      throw new Error('Missing rendered test text');
    });
    await page.mouse.move(textPoints[0].x, textPoints[0].y); await page.mouse.down();
    await page.mouse.move(textPoints[1].x, textPoints[1].y, { steps: 20 }); await page.mouse.up();
    await page.keyboard.press('Control+c');
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'bravo charlie');
    await page.mouse.dblclick(textPoints[0].x + 10, textPoints[0].y); await page.keyboard.press('Control+c');
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'bravo');
    checks.push('Packaged canvas drag, native double-click and Ctrl+C preserve exact text');
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End');
    await picker([chosen]);
    await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
    await page.getByRole('menuitem', { name: '插入图片…', exact: true }).click();
    await imagesLoaded(2); await command('save');
    await wait(() => fs.readFileSync(file, 'utf8').includes('![菜单 图片]'), 'menu image saved');
    let saved = fs.readFileSync(file, 'utf8');
    assert.match(saved, /!\[菜单 图片\]\(<assets\/[a-f0-9]+\.svg>\)/);
    assert.ok(saved.includes('![legacy](old.assets/legacy.png)'));
    checks.push('Visible Insert Image menu copies to assets and inserts a relative link');
    await picker([], true); await command('insert-image'); await new Promise(resolve => setTimeout(resolve, 200));
    assert.ok((await page.locator('.status-document').innerText()).includes('已保存'));
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
    checks.push('Canceled image picker leaves source and attachments unchanged');
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End');
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('.cm-line').last().boundingBox();
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: box.x + 10, y: box.y + box.height / 2, data: { items: [], files: [dropped, other], dragOperationsMask: 1 } });
    await imagesLoaded(3); await command('save');
    await wait(() => fs.readFileSync(file, 'utf8').includes('![拖入 图片]'), 'dropped image saved');
    saved = fs.readFileSync(file, 'utf8');
    assert.match(saved, /!\[拖入 图片\]\(<assets\/[a-f0-9]+\.png>\)/);
    assert.ok(!saved.includes('ignore.txt'));
    assert.equal(fs.readdirSync(path.join(output, 'assets')).filter(name => !name.startsWith('.')).length, 2);
    checks.push('Native-backed mixed file drag imports images only into assets');
    await picker([file]); await command('open'); await imagesLoaded(3);
    await page.screenshot({ path: path.join(output, 'images-reopened.png') });
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
    checks.push('Saved document reopens with new and legacy images loaded');
    await app.close(); app = null;
    app = await _electron.launch({ executablePath: process.env.FOLIO_ACCEPTANCE_EXECUTABLE || path.join(root, 'out/Folio-win32-x64/Folio.exe'), args: [`--user-data-dir=${profile}`, file], timeout: 30000 });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.locator('.cm-content').waitFor(); await imagesLoaded(3);
    checks.push('Application restart reloads all managed and legacy image links');
    await exportFile('pdf', saved); await exportFile('docx', saved);
    checks.push('Actual PDF and DOCX export with all three local images and task states');
    await command('new'); await wait(async () => !(await page.locator('.cm-content').innerText()).trim(), 'new document');
    const attachmentsBeforeCancel = fs.readdirSync(path.join(output, 'assets')).sort();
    await picker([chosen]); await savePicker(path.join(output, 'canceled.md'), true);
    await command('insert-image'); await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await page.locator('.document-figure').count(), 0);
    assert.ok(!fs.existsSync(path.join(output, 'canceled.md')));
    assert.deepEqual(fs.readdirSync(path.join(output, 'assets')).sort(), attachmentsBeforeCancel);
    checks.push('Unsaved document save cancellation does not insert/copy an image');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, output }, null, 2));
  } catch (error) {
    console.error(error);
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
      fs.writeFileSync(path.join(output, 'failure.txt'), `${error.stack}\n${await page.locator('body').innerText().catch(() => '')}`);
    }
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
