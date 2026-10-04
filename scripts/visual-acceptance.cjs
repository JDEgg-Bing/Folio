// Run against the packaged desktop app with an isolated profile and scratch files.
// MARKDOWN_PLAYWRIGHT_MODULE can point to a preinstalled Playwright package.
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const productName = require('../package.json').productName;
const output = path.join(root, 'out/visual-refresh', `run-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, 'profile');
const launcher = path.join(output, 'launcher.cjs');
fs.writeFileSync(launcher, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root, `out/${productName}-win32-x64/resources/app.asar/.webpack/main/index.js`))});`);
const source = '# 留一点时间给自己\n\n每天打开这份文稿，记录一些想法。不必急于完成，让文字按自己的节奏生长。Writing is a way to pay attention.\n\n## 日常的节奏\n\n' +
  '窗外的光慢慢移过桌面，今天想把时间留给阅读与书写。让界面退到文字身后，让思绪有一个安静的落点。'.repeat(5) +
  '\n\n### 阅读与记录\n\n- 把值得记住的想法写下来\n- 在阅读中留意自己的问题\n\n> 慢一点，也是一种前进。\n\n### 写作与整理\n\n**重要的念头**，可以从一个很小的句子开始。\n\n## 下次继续\n\n给明天留一段尚未写完的文字。\n\n#### 一个小注脚\n\n平常的一天，也值得记录。\n';
const file = path.join(output, 'writing.md');
fs.writeFileSync(file, source);
const checks = [], errors = [], observations = {};
let app, page;
async function command(value) {
  await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', value), value);
}
async function wait(check) {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Desktop visual acceptance timed out');
}
async function capture(name) {
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}
async function theme(themeSource) {
  await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, themeSource);
  // Playwright's context also emulates media, so set it to the same native theme.
  await page.emulateMedia({ colorScheme: themeSource });
  await wait(() => page.evaluate(value => matchMedia('(prefers-color-scheme: dark)').matches === (value === 'dark'), themeSource));
}
async function size(width, height) {
  await app.evaluate(({ BrowserWindow }, { width, height }) => BrowserWindow.getAllWindows()[0].setContentSize(width, height), { width, height });
}
async function open(filename) {
  await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, filename);
  await command('open');
}
async function status() { return page.locator('.status-document').innerText(); }
async function dialogFits() {
  return page.locator('.appearance-dialog').evaluate(dialog => {
    const box = dialog.getBoundingClientRect();
    const button = dialog.querySelector('.appearance-actions button').getBoundingClientRect();
    const body = dialog.querySelector('.appearance-body');
    return { inViewport: box.top >= 0 && box.bottom <= innerHeight, actionVisible: button.top >= box.top && button.bottom <= box.bottom, scrollable: body.scrollHeight > body.clientHeight, horizontalOverflow: body.scrollWidth > body.clientWidth };
  });
}
(async () => {
  try {
    app = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [launcher], timeout: 30000 });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('.cm-content').waitFor();
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
    await size(1100, 740);
    await theme('light');
    await capture('01-empty-light');
    await command('toggle:outlineVisible');
    await page.locator('.outline-empty').waitFor();
    await capture('02-empty-outline');
    await open(file);
    await wait(async () => (await status()).includes('留一点时间给自己'));
    assert.equal(await page.locator('.outline-item').count(), 6);
    const clean = await status();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('正常编辑验收');
    await wait(async () => (await status()).includes('已修改'));
    await page.keyboard.press('Control+z');
    await wait(async () => await status() === clean);
    await page.keyboard.press('Control+Shift+z');
    await wait(async () => (await status()).includes('已修改'));
    await page.keyboard.press('Control+z');
    await wait(async () => await status() === clean);
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await capture('03-writing-light');
    checks.push('Normal editing, undo/redo and dirty state unchanged');

    for (const mode of ['light', 'dark']) {
      await theme(mode);
      await capture(`04-writing-${mode}`);
      await page.locator('.outline-item').last().click();
      await wait(async () => await page.locator('.outline-item').last().getAttribute('aria-current') === 'location');
      await capture(`05-outline-active-${mode}`);
      await page.keyboard.press('Control+Home');
      await command('appearance');
      await page.getByRole('dialog').waitFor();
      observations[`settings-${mode}`] = await dialogFits();
      await capture(`06-settings-initial-${mode}`);
      assert.ok(observations[`settings-${mode}`].inViewport);
      assert.ok(observations[`settings-${mode}`].actionVisible);
      assert.ok(!observations[`settings-${mode}`].horizontalOverflow);
      await page.getByLabel('页面布局').selectOption('centered');
      await page.getByLabel('正文宽度（px）').fill('760');
      await page.getByLabel('中文字体').fill('Microsoft YaHei');
      await page.getByLabel('英文字体').fill('Segoe UI');
      await page.getByLabel('正文字号（px）').fill('18');
      await page.getByLabel('行距（倍）').fill('1.7');
      await capture(`06-settings-${mode}`);
      await page.locator('.appearance-details summary').click();
      await page.locator('.appearance-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await capture(`07-settings-details-${mode}`);
      await page.keyboard.press('Escape');
      await wait(async () => await page.getByRole('dialog').count() === 0);
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cm-content')), true);
      assert.equal(await status(), clean);
      await capture(`08-centered-${mode}`);
      await page.keyboard.press('Control+f');
      await page.getByPlaceholder('查找', { exact: true }).fill('文字');
      await page.getByRole('button', { name: '下一个', exact: true }).click();
      assert.ok(await page.locator('.cm-searchMatch').count() > 0);
      observations[`search-${mode}`] = await page.locator('.cm-button').first().evaluate(el => ({ background: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color }));
      assert.notEqual(observations[`search-${mode}`].background, observations[`search-${mode}`].text);
      await capture(`09-search-${mode}`);
      await page.keyboard.press('Escape');
    }
    checks.push('Light/dark writing, outline navigation, settings, details, live personalization, restored editor focus and search');

    await size(640, 420);
    await capture('10-small-outline-dark');
    assert.equal(await page.locator('.document-outline').evaluate(el => getComputedStyle(el).position), 'absolute');
    await page.getByRole('button', { name: '关闭目录' }).click();
    await command('appearance');
    await page.getByRole('dialog').waitFor();
    observations.smallSettings = await dialogFits();
    assert.ok(observations.smallSettings.inViewport && observations.smallSettings.actionVisible && observations.smallSettings.scrollable);
    await page.locator('.appearance-details summary').click();
    await page.locator('.appearance-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await capture('11-small-settings-dark');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.keyboard.press('Control+f');
    await capture('12-small-search-dark');
    assert.equal(await page.locator('.app-shell').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.keyboard.press('Escape');
    checks.push('640×420 outline overlay, reachable settings footer and wrapping search panel');

    await size(1100, 740);
    const exportSource = path.join(root, 'manual-tests/long-document.md');
    const original = fs.readFileSync(exportSource, 'utf8');
    await open(exportSource);
    await page.locator('.document-table').waitFor();
    const cleanExport = await status();
    for (const format of ['pdf', 'docx']) {
      const target = path.join(output, `export.${format}`);
      await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, target);
      await command(`export-${format}`);
      await wait(async () => (await page.locator('.export-notice').innerText()).includes('已导出'));
      assert.ok(fs.existsSync(target));
      assert.equal(await status(), cleanExport);
      await capture(`13-export-${format}-dark`);
      await page.getByRole('button', { name: '关闭导出提示' }).click();
    }
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    await command('export-pdf');
    await wait(async () => await page.locator('.export-notice').count() === 0);
    assert.equal(await status(), cleanExport);
    assert.equal(fs.readFileSync(exportSource, 'utf8'), original);
    checks.push('Actual PDF/Word export, diagnostics, cancel, unchanged original document and dirty state');

    await open(path.join(output, 'missing.md'));
    await page.locator('.error-banner').waitFor();
    await capture('14-error-dark');
    await theme('light');
    await capture('15-error-light');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    checks.push('Readable errors in both themes and dismiss feedback');

    const long = path.join(output, 'long.md');
    fs.writeFileSync(long, Array.from({ length: 1000 }, (_, i) => `## 章节 ${i + 1}\n\n${'长文档正文 English text。\n'.repeat(18)}\n`).join(''));
    await open(long);
    await command('toggle:outlineVisible');
    await wait(async () => await page.locator('.outline-scroll > div').evaluate(el => parseFloat(el.style.height)) === 28000);
    assert.ok(await page.locator('.outline-item').count() < 80);
    await page.locator('.outline-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.getByRole('listitem', { name: '章节 1000', exact: true }).click();
    await capture('16-long-document-light');
    assert.equal(await page.getByRole('listitem', { name: '章节 1000', exact: true }).getAttribute('aria-current'), 'location');
    checks.push('Large document, 1000-heading virtual outline and final chapter navigation');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'PASS', checks, observations, errors }, null, 2));
    console.log(JSON.stringify({ result: 'PASS', output, checks, observations }, null, 2));
  } finally {
    if (app) await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
