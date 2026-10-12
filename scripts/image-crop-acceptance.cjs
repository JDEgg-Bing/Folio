// Real packaged window, isolated document/profile, and real image/exports.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const { imageSize } = require('image-size');
const { unzipSync, strFromU8 } = require('fflate');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'out/image-crop', `run-${Date.now()}`);
const profile = path.join(output, 'profile'), file = path.join(output, '我的文档.md');
const folder = path.join(output, '旧图片 (保留)'), original = path.join(folder, '图 1.svg');
fs.mkdirSync(folder, { recursive: true });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="200" height="240" fill="#d04040"/><rect x="200" width="200" height="240" fill="#00aa00"/></svg>';
fs.writeFileSync(original, svg);
const initial = `# 图片裁剪验收\n\nbefore\n\n![**原图**](<旧图片 (保留)/图 1.svg> "原始标题")\n\n![ref][shared]\n\n![other][shared]\n\n![absolute](<${original}>)\n\n[shared]: <旧图片 (保留)/图 1.svg>\n\nend\n`;
fs.writeFileSync(file, initial);
let app, page;
const checks = [], errors = [];
async function wait(test, label) { for (let i = 0; i < 200; i++) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 40)); } throw new Error(`Timed out: ${label}`); }
const command = id => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(window => window.isVisible()).webContents.send('app:command', id), id);
async function loaded(count = 4) { await wait(() => page.locator('.document-figure img').evaluateAll((images, count) => images.length === count && images.every(image => image.complete && image.naturalWidth > 0), count), 'images loaded'); }
async function save() { await command('save'); await wait(async () => (await page.locator('.status-document').innerText()).includes('已保存'), 'document saved'); }
async function setField(label, value) { await page.getByRole('spinbutton', { name: label, exact: true }).fill(String(value)); }
async function picker(filePath) { await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, filePath); }
async function start() {
  app = await _electron.launch({ executablePath: process.env.FOLIO_ACCEPTANCE_EXECUTABLE || path.join(root, 'out/Folio-win32-x64/Folio.exe'), args: [`--user-data-dir=${profile}`, file], timeout: 30000 });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message)); await page.locator('.cm-content').waitFor(); await loaded();
}
async function exportFile(format, source) {
  const target = path.join(output, `cropped.${format}`); await picker(target);
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
  const opened = await page.evaluate(() => window.desktopAPI.openDocument());
  const pending = page.evaluate(async ({ format, source, handle }) => {
    const input = { text: source, fileHandleId: handle, appearance: {}, suggestedName: 'cropped.md' };
    return format === 'pdf' ? window.desktopAPI.exportPdf(input) : window.desktopAPI.exportDocx(input);
  }, { format, source, handle: opened.fileHandleId });
  await page.locator('.decision-dialog').waitFor(); await page.getByRole('button', { name: '选择保存位置', exact: true }).click();
  const result = await pending; assert.deepEqual(result.diagnostics, []);
  const bytes = fs.readFileSync(target);
  if (format === 'pdf') assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  else {
    const zip = unzipSync(bytes); assert.ok(!strFromU8(zip['word/document.xml']).includes('图片不可用'));
    const dimensions = Object.entries(zip).filter(([name]) => name.startsWith('word/media/')).map(([, data]) => imageSize(data));
    assert.ok(dimensions.some(size => size.width === 200 && size.height === 240));
    assert.ok(dimensions.some(size => size.width === 100 && size.height === 120));
  }
}
(async () => {
  try {
    await start(); assert.equal(await page.getByRole('button', { name: '裁剪图片', exact: true }).count(), 4);
    checks.push('Opened existing Markdown: relative, reference, and Windows absolute local images expose crop buttons');
    await page.getByRole('button', { name: '裁剪图片', exact: true }).first().click();
    await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).waitFor();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(fs.readFileSync(file, 'utf8'), initial); assert.ok(!fs.existsSync(path.join(output, 'assets')));
    checks.push('Cancel leaves Markdown, original image and assets unchanged');
    await page.getByRole('button', { name: '裁剪图片', exact: true }).first().click();
    await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).waitFor();
    const bounds = await page.getByRole('img', { name: '待裁剪图片', exact: true }).boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .125, bounds.y + bounds.height / 6); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .625, bounds.y + bounds.height * 7 / 12, { steps: 15 }); await page.mouse.up();
    assert.equal(await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).inputValue(), '200');
    assert.equal(await page.getByRole('spinbutton', { name: '裁剪高度', exact: true }).inputValue(), '100');
    checks.push('Real pointer drag maps display coordinates to exact source image pixels');
    await setField('左侧像素', 200); await setField('顶部像素', 0); await setField('裁剪宽度', 200); await setField('裁剪高度', 240);
    await page.screenshot({ path: path.join(output, 'crop-dialog.png') });
    await page.getByRole('button', { name: '应用裁剪', exact: true }).click(); await page.locator('.image-crop-dialog').waitFor({ state: 'hidden' });
    await save(); let source = fs.readFileSync(file, 'utf8');
    const destination = source.match(/!\[\*\*原图\*\*\]\(<(assets\/[^>]+)> "原始标题"\)/)?.[1]; assert.ok(destination);
    assert.equal(fs.readFileSync(original, 'utf8'), svg); assert.ok(source.includes('![other][shared]')); assert.ok(source.includes('[shared]: <旧图片 (保留)/图 1.svg>'));
    const bytes = fs.readFileSync(path.join(output, destination)); assert.deepEqual({ width: imageSize(bytes).width, height: imageSize(bytes).height }, { width: 200, height: 240 });
    const pixel = await app.evaluate(({ nativeImage }, base64) => [...nativeImage.createFromBuffer(Buffer.from(base64, 'base64')).toBitmap().subarray(0, 4)], bytes.toString('base64'));
    assert.deepEqual(pixel, [0, 170, 0, 255]);
    checks.push('Pixel-accurate green region saved as managed PNG; alt/title, original and shared references preserved');
    await page.keyboard.press('Control+z'); await wait(async () => (await page.locator('.status-document').innerText()).includes('已修改'), 'undo changes source'); await save(); await wait(() => fs.readFileSync(file, 'utf8') === initial, 'undo saved');
    await page.keyboard.press('Control+y'); await wait(async () => (await page.locator('.status-document').innerText()).includes('已修改'), 'redo changes source'); await save(); await wait(() => fs.readFileSync(file, 'utf8') === source, 'redo saved');
    checks.push('Native undo/redo restores the complete original/cropped Markdown in one step');
    await command('toggle:imagePreview');
    const referenceLine = page.locator('.cm-line').filter({ hasText: '![ref][shared]' }).first(); await referenceLine.waitFor();
    const referenceBounds = await referenceLine.boundingBox(); await page.mouse.click(referenceBounds.x + 30, referenceBounds.y + referenceBounds.height / 2);
    await page.getByRole('menuitem', { name: '编辑', exact: true }).click(); await page.getByRole('menuitem', { name: '裁剪图片…', exact: true }).click();
    await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).waitFor(); await setField('裁剪宽度', 100); await setField('裁剪高度', 120);
    await page.getByRole('button', { name: '应用裁剪', exact: true }).click(); await page.locator('.image-crop-dialog').waitFor({ state: 'hidden' });
    await save(); source = fs.readFileSync(file, 'utf8'); assert.match(source, /!\[ref\]\(<assets\/[a-f0-9]+\.png>\)/); assert.ok(source.includes('![other][shared]'));
    checks.push('Edit menu works with image preview disabled; only the selected reference occurrence changes');
    await command('toggle:imagePreview'); await page.locator('.cm-content').click(); await page.keyboard.press('Control+Home'); await loaded();
    await page.getByRole('button', { name: '裁剪图片', exact: true }).last().click(); await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).waitFor();
    assert.equal(await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).inputValue(), '400'); await page.keyboard.press('Escape');
    checks.push('Windows absolute path with spaces and parentheses opens in crop dialog; Escape cancels');
    await app.close(); app = null; await start(); await page.screenshot({ path: path.join(output, 'cropped-reopened.png') });
    const dimensions = await page.locator('.document-figure img').evaluateAll(images => images.map(image => [image.naturalWidth, image.naturalHeight]));
    assert.deepEqual(dimensions.slice(0, 2), [[200, 240], [100, 120]]); assert.equal(fs.readFileSync(file, 'utf8'), source);
    checks.push('Restart opens saved document with both crop results at their new pixel dimensions');
    await page.getByRole('button', { name: '裁剪图片', exact: true }).first().click(); await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).waitFor();
    assert.equal(await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).inputValue(), '200'); await page.keyboard.press('Escape');
    checks.push('Previously cropped PNG can be reopened for another crop');
    await exportFile('pdf', source); await exportFile('docx', source); checks.push('Actual PDF and DOCX export embed cropped images');
    const copyFolder = path.join(output, '另存为'); fs.mkdirSync(copyFolder); await picker(path.join(copyFolder, 'copy.md')); await command('save-as');
    await wait(() => fs.existsSync(path.join(copyFolder, 'copy.md')), 'save as');
    const copiedSource = fs.readFileSync(path.join(copyFolder, 'copy.md'), 'utf8'); assert.equal(copiedSource, source);
    for (const link of source.matchAll(/<(?<path>assets\/[a-f0-9]+\.png)>/g)) assert.deepEqual(fs.readFileSync(path.join(copyFolder, link.groups.path)), fs.readFileSync(path.join(output, link.groups.path)));
    checks.push('Save As migrates referenced managed crop assets without changing Markdown links');
    const jpeg = path.join(output, '原始 JPEG.jpg'), jpegDocument = path.join(output, '照片.md');
    const jpegBytes = Buffer.from(await app.evaluate(({ nativeImage }, base64) => nativeImage.createFromBuffer(Buffer.from(base64, 'base64')).toJPEG(90).toString('base64'), bytes.toString('base64')), 'base64');
    fs.writeFileSync(jpeg, jpegBytes); fs.writeFileSync(jpegDocument, `# JPEG\n\n![照片](<${jpeg}>)\n\nend\n`);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, jpegDocument);
    await command('open'); await loaded(1); await page.getByRole('button', { name: '裁剪图片', exact: true }).click();
    await page.getByRole('spinbutton', { name: '裁剪宽度', exact: true }).waitFor(); await setField('裁剪宽度', 80); await setField('裁剪高度', 90);
    await page.getByRole('button', { name: '应用裁剪', exact: true }).click(); await page.locator('.image-crop-dialog').waitFor({ state: 'hidden' }); await save();
    const jpegDestination = fs.readFileSync(jpegDocument, 'utf8').match(/<(?<path>assets\/[a-f0-9]+\.png)>/).groups.path;
    const jpegCrop = imageSize(fs.readFileSync(path.join(output, jpegDestination)));
    assert.equal(jpegCrop.width, 80); assert.equal(jpegCrop.height, 90); assert.deepEqual(fs.readFileSync(jpeg), jpegBytes);
    checks.push('Existing JPEG crops into PNG at exact dimensions while preserving original JPEG bytes');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2)); console.log(JSON.stringify({ output, checks }, null, 2));
  } catch (error) { if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); console.error(error); process.exitCode = 1; }
  finally { if (app) await app.close(); }
})();
