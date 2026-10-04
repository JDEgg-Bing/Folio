const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'out', 'typography-qa', `run-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
let app;
const observed = {}, errors = [];
async function command(value) { await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', value), value); }
async function settle(page) { await page.waitForTimeout(350); }
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
    }, path.join(root, 'manual-tests/long-document.md'));
    const source = fs.readFileSync(path.join(root, 'manual-tests/long-document.md'), 'utf8');
    await command('open');
    await page.locator('.document-table').waitFor();
    await command('toggle:outlineVisible');
    await page.locator('.document-outline').waitFor();
    await settle(page);
    observed.prose = await page.locator('.cm-writing-paragraph').first().evaluate(el => ({ indent: getComputedStyle(el).textIndent, size: getComputedStyle(el).fontSize }));
    assert.equal(parseFloat(observed.prose.indent), parseFloat(observed.prose.size) * 2);
    assert.equal(await page.locator('.cm-writing-paragraph.cm-writing-list,.cm-writing-paragraph.cm-writing-quote,.cm-writing-paragraph[class*="cm-preview-h"]').count(), 0);
    observed.table = await page.locator('.document-table').evaluate(table => ({
      top: getComputedStyle(table).borderTopWidth, bottom: getComputedStyle(table).borderBottomWidth,
      header: getComputedStyle(table.querySelector('th')).borderBottomWidth,
      row: getComputedStyle(table.querySelector('td')).borderBottomWidth,
      vertical: getComputedStyle(table.querySelector('td')).borderRightWidth
    }));
    assert.equal(observed.table.row, '0px'); assert.equal(observed.table.vertical, '0px');
    assert.ok(parseFloat(observed.table.top) > parseFloat(observed.table.header));
    assert.ok(parseFloat(observed.table.bottom) > parseFloat(observed.table.header));
    for (const preset of ['scientific-serif', 'scientific-sans']) {
      await command('appearance');
      await page.getByLabel('排版预设').selectOption(preset);
      await page.getByRole('button', { name: '完成', exact: true }).click();
      const fonts = await page.evaluate(() => [document.querySelector('.cm-scroller'), document.querySelector('.outline-item')].map(el => getComputedStyle(el).fontFamily));
      assert.equal(fonts[0], fonts[1]);
      observed[preset] = await page.locator('.app-shell').evaluate(el => getComputedStyle(el).getPropertyValue('--writing-chinese-font-family'));
      await page.screenshot({ path: path.join(output, `${preset}.png`) });
    }
    const headings = page.locator('.outline-item');
    const lastH1 = await page.locator('.outline-item').evaluateAll(items => items.filter(item => parseFloat(item.style.paddingLeft) === 12).at(-1).textContent);
    await page.getByRole('listitem', { name: lastH1, exact: true }).click();
    await settle(page);
    observed.lastH1Top = await page.locator('.cm-preview-h1').filter({ hasText: lastH1 }).evaluate(el => el.getBoundingClientRect().top - document.querySelector('.cm-scroller').getBoundingClientRect().top);
    assert.ok(observed.lastH1Top >= 0 && observed.lastH1Top < 50);
    // Also exercise the very last heading, which has the least trailing content.
    await headings.last().click(); await settle(page);
    observed.lastHeadingTop = await page.locator('.cm-line[class*="cm-preview-h"]').last().evaluate(el => el.getBoundingClientRect().top - document.querySelector('.cm-scroller').getBoundingClientRect().top);
    assert.ok(observed.lastHeadingTop >= 0 && observed.lastHeadingTop < 50);
    assert.equal(await headings.last().getAttribute('aria-current'), 'location');
    await page.screenshot({ path: path.join(output, 'last-heading.png') });
    await page.keyboard.press('Control+Home'); await settle(page);
    observed.normalBottomPadding = await page.locator('.cm-content').evaluate(el => getComputedStyle(el).paddingBottom);
    assert.equal(observed.normalBottomPadding, '16px');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: path.join(output, 'dark.png') });
    assert.equal(fs.readFileSync(path.join(root, 'manual-tests/long-document.md'), 'utf8'), source);
    assert.ok(!(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())).includes(' •'));
    // The existing fixture has only one H1 at its start. Check a copy with a
    // final H1 and no following prose, leaving the original Markdown untouched.
    const tailFixture = path.join(output, 'long-document.md');
    fs.writeFileSync(tailFixture, source + '\n\n# 文末一级标题');
    fs.cpSync(path.join(root, 'manual-tests/long-document.assets'), path.join(output, 'long-document.assets'), { recursive: true });
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, tailFixture);
    await command('open');
    await page.getByRole('listitem', { name: '文末一级标题', exact: true }).waitFor();
    await page.getByRole('listitem', { name: '文末一级标题', exact: true }).click(); await settle(page);
    observed.finalH1Top = await page.locator('.cm-preview-h1').filter({ hasText: '文末一级标题' }).evaluate(el => el.getBoundingClientRect().top - document.querySelector('.cm-scroller').getBoundingClientRect().top);
    assert.ok(observed.finalH1Top >= 0 && observed.finalH1Top < 50);
    assert.equal(await page.getByRole('listitem', { name: '文末一级标题', exact: true }).getAttribute('aria-current'), 'location');
    await page.screenshot({ path: path.join(output, 'final-h1-dark.png') });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({ path: path.join(output, 'final-h1-light.png') });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'PASS', observed }, null, 2));
    console.log(JSON.stringify({ result: 'PASS', observed, artifacts: output }, null, 2));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
