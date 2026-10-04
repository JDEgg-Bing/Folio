// Real Electron acceptance, isolated preferences and scratch documents only.
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const productName = require('../package.json').productName;
const output = path.join(root, 'out/product-identity', `run-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, 'profile');
const launcher = path.join(output, 'launcher.cjs');
fs.writeFileSync(launcher, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root, `out/${productName}-win32-x64/resources/app.asar/.webpack/main/index.js`))});`);
const file = path.join(output, 'writing.md');
const source = '# 留一点时间给自己\n\n每天打开这份文稿，记录一些想法。Writing is a way to pay attention.\n\n## 日常的节奏\n\n让文字按自己的节奏生长，让界面退到文字身后。\n\n### 阅读与记录\n\n- 把值得记住的想法写下来\n- 在阅读中留意自己的问题\n\n> 慢一点，也是一种前进。\n\n## 下次继续\n\n给明天留一段尚未写完的文字。\n';
fs.writeFileSync(file, source);
const checks = [], observations = {}, errors = [];
let app, page;
async function wait(check) {
  for (let i = 0; i < 300; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error('Acceptance timed out');
}
async function capture(name) { await page.waitForTimeout(190); await page.screenshot({ path: path.join(output, `${name}.png`) }); }
async function menu(name) {
  if (await page.locator('.product-menu').count()) { await page.locator('.cm-content').click({ position: { x: 8, y: 8 } }); await page.locator('.product-menu').waitFor({ state: 'detached' }); }
  await page.getByRole('menubar').getByRole('menuitem', { name, exact: true }).click();
  await page.locator('.product-menu').waitFor();
}
async function choose(section, name) {
  await menu(section);
  await page.locator('.product-menu').getByRole('menuitem', { name, exact: true }).click();
  await page.locator('.product-menu').waitFor({ state: 'detached' });
}
async function theme(value) {
  await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, value);
  await page.emulateMedia({ colorScheme: value });
}
async function status() { return page.locator('.status-document').innerText(); }
(async () => {
  try {
    app = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [launcher], timeout: 30000 });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('.cm-content').waitFor();
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
    assert.equal(await app.evaluate(({ app }) => app.getName()), productName);
    assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
    assert.ok(await page.locator('.product-identity img').evaluate(image => image.complete && image.naturalWidth > 0));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()), false);
    await theme('light');
    await capture('01-empty-light');
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
    await choose('文件', '打开…');
    await wait(async () => (await status()).includes('留一点时间给自己'));
    assert.ok((await page.title()).includes(productName));
    await capture('02-writing-light');
    checks.push('Folio identity, loaded icon, document title and isolated profile');

    await menu('文件');
    observations.motion = await page.locator('.product-menu').evaluate(panel => {
      const rect = document.querySelector('.menu-trigger').getBoundingClientRect();
      const style = getComputedStyle(panel);
      return { animation: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction, origin: style.transformOrigin, triggerCenter: rect.left + rect.width / 2, panelLeft: parseFloat(panel.style.left) };
    });
    assert.equal(observations.motion.animation, 'menu-arrive');
    assert.equal(observations.motion.duration, '0.17s');
    assert.match(observations.motion.easing, /cubic-bezier/);
    assert.ok(Math.abs(parseFloat(observations.motion.origin) + observations.motion.panelLeft - observations.motion.triggerCenter) < 1);
    await capture('03-file-menu-light');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('.product-menu').evaluate(panel => panel.classList.contains('is-closing')));
    await page.locator('.product-menu').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '文件');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('.product-menu [role=menu]').first().getAttribute('aria-label'), '编辑');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '查找 / 替换');
    await page.keyboard.press('Escape');
    await page.locator('.product-menu').waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('F10');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '文件');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '数学公式');
    await capture('04-preview-submenu-light');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '文档预览');
    await page.locator('.cm-content').click({ position: { x: 8, y: 8 } });
    await page.locator('.product-menu').waitFor({ state: 'detached' });
    checks.push('Trigger origin, nonlinear opening and closing, F10, arrows, submenu, Escape and outside dismissal');

    const clean = await status();
    await page.locator('.cm-content').click({ position: { x: 8, y: 8 } }); await page.keyboard.press('Control+End'); await page.keyboard.insertText('菜单撤销验收');
    await wait(async () => (await status()).includes('已修改'));
    await choose('编辑', '撤销');
    await wait(async () => await status() === clean);
    await choose('编辑', '重做');
    await wait(async () => (await status()).includes('已修改'));
    await choose('编辑', '撤销');
    await wait(async () => await status() === clean);
    await menu('编辑'); await page.keyboard.press('Escape'); await page.locator('.product-menu').waitFor({ state: 'detached' });
    await choose('编辑', '全选');
    assert.ok(await page.evaluate(() => getSelection().toString().length > 10));
    await choose('编辑', '复制');
    assert.ok((await app.evaluate(({ clipboard }) => clipboard.readText())).includes('留一点时间给自己'));
    await choose('编辑', '剪切'); await wait(async () => (await status()).includes('已修改'));
    await choose('编辑', '撤销'); await wait(async () => await status() === clean);
    await page.keyboard.press('ArrowRight');
    await app.evaluate(({ clipboard }) => clipboard.writeText('粘贴焦点验收'));
    await choose('编辑', '粘贴');
    await wait(async () => (await status()).includes('已修改'));
    assert.ok((await page.locator('.cm-content').innerText()).includes('粘贴焦点验收'));
    await choose('编辑', '撤销'); await wait(async () => await status() === clean);
    await choose('编辑', '查找 / 替换'); await page.locator('.cm-search').waitFor(); await page.keyboard.press('Escape');
    await menu('视图'); await page.getByRole('menuitemcheckbox', { name: '文档目录' }).click();
    await page.locator('.product-menu').waitFor({ state: 'detached' });
    await page.locator('.document-outline').waitFor();
    await menu('视图');
    assert.equal(await page.getByRole('menuitemcheckbox', { name: '文档目录' }).getAttribute('aria-checked'), 'true');
    await capture('05-view-menu-light');
    await page.getByRole('menuitemcheckbox', { name: '文档目录' }).click();
    await page.locator('.product-menu').waitFor({ state: 'detached' });
    await page.locator('.document-outline').waitFor({ state: 'detached' });
    assert.equal(await status(), clean);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()), false);
    checks.push('Undo/redo, native selection and copy/paste with restored editor focus, search and feature checkmarks');

    await choose('视图', '外观 / 排版…'); await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true);
    await capture('06-settings-light'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(async () => { try { await window.desktopAPI.runMenuCommand('invalid-command'); return false; } catch { return true; } }), true);
    checks.push('Settings focus and rejection of unknown menu commands');

    for (const format of ['pdf', 'docx']) {
      const target = path.join(output, `export.${format}`);
      await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, target);
      await choose('文件', format === 'pdf' ? '导出 PDF…' : '导出 Word…');
      await wait(async () => (await page.locator('.export-notice').innerText()).includes('已导出'));
      assert.ok(fs.statSync(target).size > 100);
      assert.equal(await status(), clean);
      await page.getByRole('button', { name: '关闭导出提示' }).click();
    }
    assert.equal(fs.readFileSync(file, 'utf8'), source);
    checks.push('Actual PDF and Word exports via new menu, source and dirty state retained');

    await theme('dark'); await capture('07-writing-dark'); await menu('文件'); await capture('08-file-menu-dark');
    await menu('视图'); await page.getByRole('menuitem', { name: '文档预览', exact: true }).hover();
    await capture('09-view-submenu-dark');
    await page.locator('.cm-content').click({ position: { x: 8, y: 8 } }); await page.locator('.product-menu').waitFor({ state: 'detached' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(640, 420));
    await menu('视图'); await page.getByRole('menuitem', { name: '文档预览', exact: true }).hover();
    observations.small = await page.locator('.product-menu, .product-submenu').evaluateAll(panels => panels.map(panel => { const r = panel.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, fits: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }));
    assert.ok(observations.small.every(panel => panel.fits));
    await capture('10-small-submenu-dark');
    await page.locator('.cm-content').click({ position: { x: 8, y: 8 } }); await page.locator('.product-menu').waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await menu('文件');
    assert.equal(await page.locator('.product-menu').evaluate(panel => getComputedStyle(panel).animationName), 'none');
    await page.keyboard.press('Escape'); await page.locator('.product-menu').waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    checks.push('Light/dark menus, 640×420 panel placement, pointer submenu and reduced motion');

    await choose('视图', '放大'); assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel()), 0.5);
    await choose('视图', '实际大小'); assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel()), 0);

    await choose('视图', '全屏');
    await wait(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()));
    assert.ok(await page.getByRole('menubar').isVisible());
    assert.ok(await page.locator('.titlebar-document').evaluate(el => el.clientWidth > 100));
    await choose('视图', '全屏');
    await wait(async () => !await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()));
    checks.push('Fullscreen and zoom commands through custom menu');
    assert.equal(await page.locator('.error-banner').count(), 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'PASS', checks, observations, errors }, null, 2));
    console.log(JSON.stringify({ result: 'PASS', output, checks, observations }, null, 2));
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'FAIL', checks, observations, errors, failure: String(error) }, null, 2));
    console.error('Failed run:', output);
    throw error;
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
