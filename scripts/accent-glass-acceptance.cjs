// Packaged Electron acceptance with an isolated profile and scratch documents.
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { unzipSync, strFromU8 } = require('fflate');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'out/accent-glass', `acceptance-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const launcher = path.join(output, 'launcher.cjs');
fs.writeFileSync(launcher, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(output, 'profile'))});require(${JSON.stringify(path.join(root, 'out/accent-glass/Folio-win32-x64/resources/app.asar/.webpack/main/index.js'))});`);
const source = '# 安静地写作\n\n中文与 English 正文。\n\n' + Array.from({ length: 12 }, (_, i) => `## 章节 ${i + 1}\n\n让文字按自己的节奏生长，留一些时间给阅读与书写。${'正文内容。'.repeat(40)}\n\n[参考链接](https://example.com)\n`).join('\n');
const file = path.join(output, 'writing.md');
fs.writeFileSync(file, source);
const palette = [
  ['苔绿', 'green', '#466e60', '#a5c7b5'], ['雾蓝', 'blue', '#476d8c', '#a4bfd5'],
  ['靛蓝', 'indigo', '#5b648f', '#b2b9dd'], ['柔紫', 'purple', '#78618c', '#c7b3d9'],
  ['灰紫', 'mauve', '#786a79', '#c6bac8'], ['琥珀', 'amber', '#806331', '#d7bf91'],
  ['石墨', 'graphite', '#626b70', '#b9c2c7']
];
const checks = [], observations = [], errors = [];
let app, page;
async function command(value) { await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', value), value); }
async function wait(check) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error('Acceptance timed out');
}
async function launch() {
  app = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [launcher] });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.locator('.cm-content').waitFor();
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
}
async function theme(value) {
  await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, value);
  await page.emulateMedia({ colorScheme: value });
}
async function capture(name) { await page.waitForTimeout(170); await page.screenshot({ path: path.join(output, `${name}.png`) }); }
async function exportFile(format, name) {
  const target = path.join(output, `${name}.${format}`);
  await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, target);
  await command(`export-${format}`);
  await wait(async () => (await page.locator('.export-notice').innerText()).includes('已导出'));
  assert.ok(fs.statSync(target).size > 100);
  await page.getByRole('button', { name: '关闭导出提示' }).click();
  return target;
}
(async () => {
  try {
    await launch(); await theme('light');
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
    await command('open'); await wait(async () => (await page.locator('.cm-content').innerText()).includes('安静地写作'));
    await command('toggle:outlineVisible'); await page.locator('.outline-item').first().waitFor();
    const clean = await page.locator('.status-document').innerText();
    const before = await page.evaluate(() => ({ appearance: JSON.parse(localStorage.getItem('markdown-editor.preferences.v1')).writingAppearance, text: document.querySelector('.cm-content').innerText }));
    const initialDocx = await exportFile('docx', 'default-accent');
    await capture('01-green-light');
    for (const mode of ['light', 'dark']) {
      await theme(mode); await command('appearance'); await page.locator('dialog[open]').waitFor();
      assert.equal(await page.locator('.accent-option').count(), 7);
      assert.equal(await page.locator('input[type=color]').count(), 0);
      const neutrals = await page.evaluate(() => ['--bg', '--text', '--text-secondary', '--text-muted', '--surface', '--border'].map(key => getComputedStyle(document.documentElement).getPropertyValue(key)));
      for (const [label, id, light, dark] of palette) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await page.waitForTimeout(170); // Let the existing short color transitions settle.
        assert.equal(await page.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
        const expected = mode === 'light' ? light : dark;
        const actual = await page.evaluate(expected => {
          const rootStyle = getComputedStyle(document.documentElement);
          const probe = document.createElement('span'); probe.style.color = expected; document.body.append(probe);
          const rgb = getComputedStyle(probe).color; probe.remove();
          const header = document.querySelector('.product-titlebar'), style = getComputedStyle(header);
          return { accent: rootStyle.getPropertyValue('--accent').trim(), expectedRgb: rgb,
            brand: getComputedStyle(document.querySelector('.product-mark rect')).fill,
            caret: getComputedStyle(document.querySelector('.cm-content')).caretColor,
            chapter: getComputedStyle(document.querySelector('.outline-item.active')).color,
            swatch: getComputedStyle(document.querySelector('.accent-option[aria-pressed=true] .accent-swatch')).backgroundColor,
            action: getComputedStyle(document.querySelector('.appearance-actions button')).backgroundColor,
            blur: style.backdropFilter, fixed: style.position, headerBackground: style.backgroundColor,
            neutrals: ['--bg', '--text', '--text-secondary', '--text-muted', '--surface', '--border'].map(key => rootStyle.getPropertyValue(key)),
            saved: JSON.parse(localStorage.getItem('markdown-editor.preferences.v1')) };
        }, expected);
        assert.equal(actual.accent, expected);
        for (const key of ['brand', 'caret', 'chapter', 'swatch', 'action']) assert.equal(actual[key], actual.expectedRgb, `${mode}/${id}/${key}`);
        assert.match(actual.blur, /blur\(18px\)/); assert.equal(actual.fixed, 'fixed');
        assert.deepEqual(actual.neutrals, neutrals);
        assert.equal(actual.saved.accentColor, id); assert.deepEqual(actual.saved.writingAppearance, before.appearance);
        assert.equal(await page.locator('.status-document').innerText(), clean);
        observations.push({ mode, id, accent: actual.accent, glass: actual.headerBackground, blur: actual.blur });
        await capture(`settings-${mode}-${id}`);
      }
      await page.getByRole('button', { name: '柔紫', exact: true }).click();
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await page.getByRole('menubar').getByRole('menuitem', { name: '视图', exact: true }).click();
      await page.locator('.menu-surface').waitFor();
      const portal = await page.locator('.menu-surface').evaluate(el => ({ accent: getComputedStyle(el).getPropertyValue('--accent').trim(), focus: getComputedStyle(el.querySelector(':focus')).outlineColor }));
      assert.equal(portal.accent, mode === 'light' ? '#78618c' : '#c7b3d9');
      await capture(`menu-${mode}-purple`); await page.keyboard.press('Escape'); await page.locator('.product-menu').waitFor({ state: 'detached' });
      await page.locator('.outline-item').filter({ hasText: '章节 12' }).click();
      await wait(() => page.evaluate(() => [...document.querySelectorAll('.cm-line')].some(el => el.textContent.includes('章节 12') && el.getBoundingClientRect().top >= 44 && el.getBoundingClientRect().top < 90)));
      await capture(`writing-${mode}-purple`);
      await page.locator('.cm-scroller').evaluate(el => { el.scrollTop += 90; });
      await wait(() => page.evaluate(() => [...document.querySelectorAll('.cm-line')].some(el => { const r = el.getBoundingClientRect(); return r.top < 44 && r.bottom > 0; })));
      await capture(`glass-scrolled-${mode}`);
      const top = await page.locator('.product-titlebar').evaluate(el => el.getBoundingClientRect().top);
      assert.equal(top, 0);
      await page.mouse.click(120, 150);
      assert.equal(await page.locator('.cm-content').evaluate(el => el === document.activeElement), true);
    }
    checks.push('All 7 colors in light/dark: brand, cursor, chapter, swatches, actions, neutral colors, real fixed blur');
    checks.push('Portaled menus inherit accent; chapter 12 lands below glass; document scroll and click work');
    const coloredDocx = await exportFile('docx', 'purple-accent');
    const parts = target => { const zip = unzipSync(fs.readFileSync(target)); return ['word/document.xml', 'word/styles.xml'].map(key => strFromU8(zip[key])); };
    assert.deepEqual(parts(coloredDocx), parts(initialDocx));
    await exportFile('pdf', 'purple-accent');
    assert.equal(fs.readFileSync(file, 'utf8'), source); assert.equal(await page.locator('.status-document').innerText(), clean);
    checks.push('Actual Word/PDF export works; Word content and formal style identical before/after accent; source and dirty state unchanged');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(640, 420));
    await command('appearance'); await page.locator('dialog[open]').waitFor();
    const small = await page.locator('.appearance-dialog').evaluate(el => { const r = el.getBoundingClientRect(), b = el.querySelector('.appearance-actions button').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && b.bottom <= r.bottom && el.querySelector('.appearance-body').scrollWidth <= el.querySelector('.appearance-body').clientWidth; });
    assert.equal(small, true); await capture('small-settings-dark');
    await page.getByRole('button', { name: '琥珀', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await app.close(); app = null;
    await launch(); await theme('light'); await command('appearance'); await page.locator('dialog[open]').waitFor();
    assert.equal(await page.getByRole('button', { name: '琥珀', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#806331');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.match(await page.locator('.product-titlebar').evaluate(el => getComputedStyle(el).backdropFilter), /blur/);
    checks.push('640×420 settings fit; full application restart restores accent; reduced motion retains static glass');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'PASS', checks, observations, errors }, null, 2));
    console.log(JSON.stringify({ result: 'PASS', output, checks }, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'FAIL', checks, observations, errors, failure: String(error) }, null, 2));
    console.error(output); throw error;
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
