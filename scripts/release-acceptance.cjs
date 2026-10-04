// Exercise the final executable using temporary documents and an isolated profile.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { once } = require('node:events');
const { execFile, spawn } = require('node:child_process');
const run = require('node:util').promisify(execFile);
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const { unzipSync, strFromU8 } = require('fflate');
const root = path.resolve(__dirname, '..'), pkg = require('../package.json');
const output = path.join(root, 'out/release-acceptance', `run-${Date.now()}`), profile = path.join(output, 'profile');
const executablePath = process.env.FOLIO_ACCEPTANCE_EXECUTABLE || path.join(root, 'out/Folio-win32-x64/Folio.exe');
const build = require('./release-evidence.cjs').buildIdentity(path.dirname(executablePath));
fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [], observations = [];
const file = path.join(output, '中文 带空格.md'), second = path.join(output, 'second.markdown');
const fixture = '# 发布验收文稿\n\n中英文内容 Mixed writing。**粗体**与 $a^2+b^2=c^2$。\n\n## 内容与层级\n\n| 参数 | 值 |\n| --- | --- |\n| Alpha | 42 |\n\n$$\nE=mc^2\n$$\n{#eq:energy}\n\n公式 [@eq:energy]。\n\n![示意图](illustration.svg)\n';
fs.writeFileSync(file, fixture); fs.writeFileSync(second, '# 第二份文稿\n\n系统文件打开验收。\n');
fs.copyFileSync(path.join(root, 'manual-tests/long-document.assets/example.svg'), path.join(output, 'illustration.svg'));
let app, page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test, label) {
  for (let i = 0; i < 300; i++) { if (await test()) return; await pause(40); }
  throw new Error(`Timed out: ${label}`);
}
async function decisionResponse(response) {
  await page.evaluate(response => {
    window.__folioDecisionResponse = response;
    if (!window.__folioDecisionListener) window.__folioDecisionListener = window.desktopAPI.onDecisionRequest(request => {
      const value = window.__folioDecisionResponse;
      if (value === null) return;
      const answer = request.selection ? ['manuscript', 'academic', 'reading', 'cancel'][value] : request.choices.some(c=>c.id==='overwrite') ? ['cancel','overwrite'][value] : ['save','discard','cancel'][value];
      const act = () => {
        const dialog = document.querySelector('[aria-labelledby="decision-' + request.id + '"]');
        if (!dialog) { setTimeout(act, 50); return; }
        if (request.selection) {
          const choice = request.choices.find(c=>c.id===answer);
          const card = [...dialog.querySelectorAll('.decision-option')].find(c=>c.querySelector('strong')?.textContent===choice?.label);
          if (card) { card.querySelector('input').click(); dialog.querySelector('.primary').click(); }
          else dialog.querySelector('button').click();
        } else {
          const label=request.choices.find(c=>c.id===answer)?.label;
          [...dialog.querySelectorAll('button')].find(b=>b.textContent===label)?.click();
        }
      }; setTimeout(act, 50);
    });
  }, response);
}
async function launch(args = []) {
  app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, ...args], timeout: 30000 });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.locator('.cm-content').waitFor();
  await decisionResponse(0);
  return page;
}
const command = id => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(w => w.isVisible()).webContents.send('app:command', id), id);
const status = () => page.locator('.status-document').innerText();
const screenshot = name => page.screenshot({ path: path.join(output, `${name}.png`) });
async function saveDialog(target, canceled = false) { await app.evaluate(({ dialog }, [target, canceled]) => { dialog.showSaveDialog = async () => ({ canceled, filePath: target }); }, [target, canceled]); }
async function openDocument(target) {
  await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] }); }, target);
  await command('open');
}
async function close() {
  if (!app) return;
  await decisionResponse(1);
  await app.close(); app = null;
}
(async () => {
  try {
    await launch(); await page.getByRole('button', { name: '开始写作', exact: true }).waitFor();
    const info = await page.evaluate(() => window.desktopAPI.getAppInfo());
    assert.equal(info.version, pkg.version); assert.equal(info.packaged, true); assert.equal(path.resolve(info.dataPath), profile);
    await screenshot('01-welcome'); await page.getByRole('button', { name: '开始写作', exact: true }).click();
    await wait(async () => !await page.locator('dialog[open]').count(), 'welcome close');
    await command('sample'); await wait(async () => (await status()).includes('已修改'), 'sample dirty');
    assert.ok((await page.locator('.cm-content').innerText()).includes('欢迎使用轻页'));
    await page.keyboard.press('Control+r'); await page.keyboard.press('F5');
    assert.ok((await page.locator('.cm-content').innerText()).includes('欢迎使用轻页'));
    assert.equal(await page.evaluate(async () => { try { await window.desktopAPI.runMenuCommand('role:reload'); return false; } catch { return true; } }), true);
    await decisionResponse(null); await command('new'); await page.locator('.decision-dialog').waitFor();
    await screenshot('09-unsaved-confirmation');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '保存');
    await page.keyboard.press('Escape'); await page.locator('.decision-dialog').waitFor({state:'detached'});
    assert.ok((await status()).includes('已修改')); await decisionResponse(0);
    const sample = path.join(output, 'sample.md'); await saveDialog(sample); await command('save');
    await wait(async () => (await status()).includes('已保存'), 'sample saved');
    assert.ok(fs.readFileSync(sample, 'utf8').includes('`行内代码`'));
    checks.push('Packaged identity/version, isolated profile, welcome, editable sample, refresh protection');

    await openDocument(file); await wait(async () => (await status()).includes('发布验收文稿'), 'open mixed document');
    await page.locator('.document-figure img').waitFor(); await screenshot('02-mixed-light');
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('\n未保存中文草稿');
    const recoveryPath = path.join(profile, 'recovery/draft.json');
    await wait(() => fs.existsSync(recoveryPath) && JSON.parse(fs.readFileSync(recoveryPath)).text.includes('未保存中文草稿'), 'persist recovery');
    // Choosing Discard before an Open dialog is not permission to delete the
    // draft if the file picker is subsequently canceled or the file read fails.
    await decisionResponse(1); await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await command('open'); await pause(150);
    assert.ok(JSON.parse(fs.readFileSync(recoveryPath)).text.includes('未保存中文草稿'));
    await openDocument(path.join(output, 'does-not-exist.md'));
    await page.locator('.error-banner').waitFor();
    assert.ok(JSON.parse(fs.readFileSync(recoveryPath)).text.includes('未保存中文草稿'));
    assert.ok((await status()).includes('已修改'));
    await decisionResponse(0);
    fs.writeFileSync(file, '# 外部版本\n\n外部编辑内容。\n');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await wait(async () => (await page.locator('.error-banner').innerText()).includes('磁盘文件'), 'focus conflict');
    await decisionResponse(null); await command('save'); await page.locator('.decision-dialog').waitFor();
    await screenshot('10-external-change-confirmation');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '取消');
    await page.keyboard.press('Escape');
    await wait(async () => (await page.locator('.error-banner').innerText()).includes('已取消保存'), 'cancel conflict');
    assert.equal(fs.readFileSync(file, 'utf8'), '# 外部版本\n\n外部编辑内容。\n'); assert.ok((await status()).includes('已修改'));
    await decisionResponse(1);
    await command('save'); await wait(async () => (await status()).includes('已保存'), 'explicit overwrite');
    assert.ok(fs.readFileSync(file, 'utf8').includes('未保存中文草稿'));
    checks.push('Recovery while typing, canceled/failed Open retains draft, external edit detection, default cancel, explicit overwrite');

    await decisionResponse(0);
    await command('export-docx'); await page.locator('.word-template-dialog').waitFor();
    await wait(async () => await page.getByRole('button', { name: '导出 Word', exact: true }).isEnabled(), 'template ready');
    await decisionResponse(null); await page.getByRole('button', {name:'导出 Word',exact:true}).click();
    await page.locator('.decision-dialog').waitFor(); await screenshot('11-export-preset-cards');
    assert.equal(await page.getByRole('radio').count(),3);
    await page.keyboard.press('ArrowDown'); assert.equal(await page.getByRole('radio',{name:/学术报告/}).isChecked(),true);
    await page.keyboard.press('Escape'); await page.locator('.decision-dialog').waitFor({state:'detached'});
    assert.equal(await page.locator('.word-template-dialog').count(),1); await decisionResponse(0);
    await saveDialog(path.join(output, 'cancel.docx'), true); await page.getByRole('button', { name: '导出 Word', exact: true }).click();
    await wait(async () => await page.getByRole('button', { name: '导出 Word', exact: true }).isEnabled(), 'export canceled');
    assert.equal(await page.locator('.word-template-dialog').count(), 1); assert.ok(!fs.existsSync(path.join(output, 'cancel.docx')));
    await saveDialog(path.join(output, 'missing-parent', 'fail.docx')); await page.getByRole('button', { name: '导出 Word', exact: true }).click();
    await page.locator('.word-template-dialog .template-error').waitFor();
    assert.equal(await page.getByRole('combobox', { name: '选择模板' }).inputValue(), '');
    await screenshot('03-word-failure-keeps-dialog');
    const docx = path.join(output, 'verified.docx'); await saveDialog(docx); await page.getByRole('button', { name: '导出 Word', exact: true }).click();
    await page.locator('.word-template-dialog').waitFor({ state: 'detached' });
    await wait(() => fs.existsSync(docx), 'actual docx');
    const xml = strFromU8(unzipSync(fs.readFileSync(docx))['word/document.xml']);
    for (const text of ['发布验收文稿', '内容与层级', 'Alpha', '未保存中文草稿']) assert.ok(xml.includes(text));
    assert.ok(xml.includes('<w:tbl>')); assert.ok(xml.includes('<m:oMath')); assert.ok(xml.includes('<w:drawing>'));
    const saved = fs.readFileSync(file, 'utf8'); assert.ok((await status()).includes('已保存'));
    await saveDialog(path.join(output, 'verified.pdf')); await command('export-pdf');
    await wait(() => fs.existsSync(path.join(output, 'verified.pdf')), 'actual pdf');
    assert.equal(fs.readFileSync(path.join(output, 'verified.pdf')).subarray(0, 4).toString(), '%PDF');
    assert.equal(fs.readFileSync(file, 'utf8'), saved); await screenshot('04-export-success');
    checks.push('Word cancel/failure keeps selection, retry succeeds, PDF and native DOCX content/objects, source unchanged');

    await command('appearance'); await page.getByLabel('中文字体', { exact: true }).fill('Folio Missing Font 123456');
    await wait(async () => (await page.locator('.appearance-dialog').innerText()).includes('当前回退为'), 'font fallback');
    await screenshot('05-font-fallback'); await page.getByRole('button', { name: '完成', exact: true }).click();
    for (const theme of ['light', 'dark']) {
      await app.evaluate(({ nativeTheme }, theme) => { nativeTheme.themeSource = theme; }, theme); await page.emulateMedia({ colorScheme: theme });
      await command('help'); await page.getByRole('dialog').waitFor();
      for (const factor of [1, 1.25, 1.5, 2]) {
        await app.evaluate(({ BrowserWindow }, factor) => { const w = BrowserWindow.getAllWindows().find(w => w.isVisible()); w.setContentSize(1100, 760); w.webContents.setZoomFactor(factor); }, factor);
        await pause(150);
        const bounds = await page.getByRole('dialog').evaluate(el => { const r = el.getBoundingClientRect(); return { fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, width: innerWidth, height: innerHeight }; });
        assert.ok(bounds.fits, `${theme} ${factor} zoom dialog`); observations.push({ theme, zoom: factor, ...bounds });
      }
      await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.isVisible()); w.webContents.setZoomFactor(1); w.setContentSize(640, 420); });
      await screenshot(`06-help-small-${theme}`);
      await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => !!document.activeElement.closest('dialog')));
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.ok(await page.evaluate(() => !!document.activeElement.closest('.cm-editor')));
      for (const id of ['appearance','word-templates']) {
        await command(id); await page.locator('dialog[open]').waitFor();
        for (const factor of [1,1.25,1.5,2]) {
          await app.evaluate(({BrowserWindow},factor)=>{const w=BrowserWindow.getAllWindows().find(w=>w.isVisible());w.setContentSize(1100,760);w.webContents.setZoomFactor(factor);},factor);
          await pause(80);
          const fit=await page.locator('dialog[open]').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1;});
          assert.ok(fit,`${id} ${theme} ${factor}`);
          await screenshot(`12-${id}-${theme}-${factor}`);
        }
        await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.isVisible());w.webContents.setZoomFactor(1);w.setContentSize(640,420);});
        await screenshot(`13-${id}-small-${theme}`);
        await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({state:'detached'});
        assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.cm-editor')));
      }
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.isVisible()).setContentSize(1100, 760));
    await command('about'); await wait(async () => (await page.getByRole('dialog').innerText()).includes(pkg.version), 'about version'); await page.keyboard.press('Escape');
    await command('feedback'); await page.getByRole('button', { name: '复制问题记录模板' }).click();
    await wait(() => app.evaluate(({ clipboard }) => clipboard.readText().includes('操作步骤：')), 'feedback clipboard'); await page.keyboard.press('Escape');
    checks.push('Missing-font fallback, light/dark help at 100/125/150/200% app zoom, 640×420, focus/Escape, version and feedback copy');

    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('\n异常退出后必须恢复的尾文');
    await wait(() => fs.existsSync(recoveryPath) && JSON.parse(fs.readFileSync(recoveryPath)).text.includes('异常退出后必须恢复的尾文'), 'crash snapshot');
    const process = app.process(), exited = once(process, 'exit');
    // On Windows Chromium children can retain the singleton lock handle after
    // killing only the parent. Terminate only this tracked test process tree.
    if (global.process.platform === 'win32') await run('taskkill.exe', ['/PID', String(process.pid), '/T', '/F'], { windowsHide: true });
    else process.kill('SIGKILL');
    await exited; app = null;
    await launch([second]); await page.getByRole('button', { name: '恢复文稿', exact: true }).waitFor(); await screenshot('07-recovery');
    await decisionResponse(2);
    // Pending OS file must not replace an unresolved recovered document.
    await page.getByRole('button', { name: '恢复文稿', exact: true }).click();
    await wait(async () => (await status()).includes('已修改'), 'restored dirty');
    assert.ok((await page.locator('.cm-content').innerText()).includes('异常退出后必须恢复的尾文'));
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
    await screenshot('08-recovered-dirty');
    await saveDialog(path.join(output, 'recovered-copy.md')); await command('save-as'); await wait(async () => (await status()).includes('已保存'), 'recovered save-as');
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('丢弃这段');
    await wait(() => fs.existsSync(recoveryPath), 'draft before discard');
    await close(); assert.ok(!fs.existsSync(recoveryPath));
    await launch([second]); await wait(async () => (await status()).includes('第二份文稿'), 'startup path with spaces');
    assert.equal(await page.locator('.recovery-dialog').count(), 0);
    const secondLaunch = async target => {
      const child = spawn(executablePath, [`--user-data-dir=${profile}`, target], { windowsHide: true, stdio: 'ignore' });
      await once(child, 'exit');
    };
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('保留第二份的未保存输入');
    await decisionResponse(2);
    await secondLaunch(file); await pause(300);
    assert.ok((await page.locator('.cm-content').innerText()).includes('保留第二份的未保存输入'));
    await decisionResponse(1);
    await secondLaunch(file); await wait(async () => (await status()).includes('发布验收文稿'), 'second instance forwards path');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.isVisible()).length), 1);
    checks.push('Forced-exit recovery, original disk retained, pending OS open guarded, recovered save-as, explicit discard removes draft, next-launch file opens');
    checks.push('Second launch forwards a Chinese/spaced filename to the single existing window, Cancel preserves edits, Discard opens requested file');
    assert.deepEqual(errors, []);
    assert.deepEqual(require('./release-evidence.cjs').buildIdentity(path.dirname(executablePath)), build);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'PASS', build, version: pkg.version, executablePath, checks, observations, errors,
      limits: ['Native file dialogs are controlled test substitutes', 'App zoom does not prove physical Windows DPI', 'Real IME, mouse dragging, installer upgrade, second PC and week-long use require manual acceptance'] }, null, 2));
    console.log(JSON.stringify({ result: 'PASS', output, checks }, null, 2));
  } catch (error) {
    if (page) await screenshot('failure').catch(() => {});
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ result: 'FAIL', version: pkg.version, checks, observations, errors, failure: String(error) }, null, 2));
    console.error(output); throw error;
  } finally { await close().catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
