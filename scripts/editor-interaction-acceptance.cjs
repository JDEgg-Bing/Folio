// Real Chromium pointer/keyboard regression checks against the current editor
// sources. The isolated harness exposes its EditorView only to this test.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'out/editor-interaction', `run-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const sourceImport = file => JSON.stringify(path.join(root, file).replaceAll('\\', '/'));
fs.writeFileSync(path.join(output, 'entry.ts'), `
import {createEditorController} from ${sourceImport('src/renderer/editor/EditorController')};
import {EditorView} from '@codemirror/view';
import {writingTokens} from ${sourceImport('src/renderer/appearance/writingTokens')};
import {DEFAULT_WRITING_APPEARANCE} from ${sourceImport('src/renderer/preferences/WritingAppearance')};
for(const [key,value] of Object.entries(writingTokens(DEFAULT_WRITING_APPEARANCE))) document.body.style.setProperty(key,String(value));
window.controller=createEditorController(document.querySelector('.editor-region'),()=>{});
window.editorView=EditorView.findFromDOM(document.querySelector('.cm-editor'));
`);
require('esbuild').buildSync({ entryPoints: [path.join(output, 'entry.ts')], bundle: true, platform: 'browser', outfile: path.join(output, 'editor.js') });
fs.writeFileSync(path.join(output, 'index.html'), `<html><head>${['variables', 'app', 'editor'].map(name => `<link rel="stylesheet" href="${path.join(root, `src/renderer/styles/${name}.css`).replaceAll('\\', '/')}">`).join('')}</head><body><div class="app-shell"><div class="editor-region"></div></div><script src="editor.js"></script></body></html>`);
fs.writeFileSync(path.join(output, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(output, 'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1100,height:900});w.loadFile(${JSON.stringify(path.join(output, 'index.html'))});});`);
let app, page;
const checks = [], errors = [];
async function selection() {
  return page.evaluate(() => { const state = window.editorView.state, range = state.selection.main; return { from: range.from, to: range.to, text: state.sliceDoc(range.from, range.to) }; });
}
async function load(source) {
  await page.evaluate(source => window.controller.loadDocument(source), source);
  await page.waitForTimeout(100);
}
async function points(positions) {
  return page.evaluate(positions => positions.map(position => { const rect = window.editorView.coordsAtPos(position); return { x: rect.left, y: (rect.top + rect.bottom) / 2 }; }), positions);
}
async function drag(source, from, to) {
  await load(source);
  const [start, end] = await points([from, to]);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 30 }); await page.mouse.up();
  assert.deepEqual(await selection(), { from: Math.min(from, to), to: Math.max(from, to), text: source.slice(Math.min(from, to), Math.max(from, to)) });
  await page.keyboard.press('Control+c');
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), source.slice(Math.min(from, to), Math.max(from, to)));
}
(async () => {
  try {
    app = await _electron.launch({ executablePath: process.env.MARKDOWN_ELECTRON_EXECUTABLE || require('electron'), args: [path.join(output, 'main.cjs')] });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.locator('.cm-content').waitFor();
    const inline = '# Heading\n\n**alpha bravo charlie delta echo**\n\nplain start\n\nplain end';
    for (let repeat = 0; repeat < 3; repeat++) {
      await drag(inline, 15, 34); await drag(inline, 34, 15);
    }
    checks.push('Repeated forward/reverse drag and Ctrl+C match exact Markdown ranges');
    const across = '# Heading\n\n**alpha bravo**\n\n$x^2$\n\n| a | b |\n| --- | --- |\n| c | d |\n\nplain end';
    await drag(across, 15, across.indexOf('end') + 3);
    await drag(across, across.indexOf('end') + 3, 15);
    assert.equal(await page.locator('.document-table').count(), 1);
    assert.equal(await page.locator('.document-math-inline').count(), 1);
    checks.push('Cross-paragraph selection across math/table widgets preserves geometry and source copy');
    await load(inline);
    const [word] = await points([inline.indexOf('bravo') + 2]);
    await page.mouse.dblclick(word.x, word.y);
    assert.equal((await selection()).text, 'bravo');
    await page.keyboard.press('Control+c');
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'bravo');
    checks.push('Native double-click word selection and copy');
    await page.keyboard.type('replaced');
    assert.equal(await page.evaluate(() => window.controller.getDocumentText()), inline.replace('bravo', 'replaced'));
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => window.controller.getDocumentText()), inline);
    checks.push('Typing over selected source and undo');
    const lists = '# Lists\n\n- [ ] todo\n- [x] done\n  - [X] nested\n  - child\n    - grandchild\n- ordinary\n\n3. ordered\n4. next';
    await load(lists);
    assert.equal(await page.locator('.cm-preview-task').count(), 3);
    assert.equal(await page.locator('.cm-preview-task:checked').count(), 2);
    assert.equal(await page.locator('.cm-preview-bullet').count(), 3);
    const box = page.locator('.cm-preview-task').first(); await box.click();
    assert.equal(await page.evaluate(() => window.controller.getDocumentText()), lists.replace('[ ]', '[x]'));
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => window.controller.getDocumentText()), lists);
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.evaluate(() => window.controller.getDocumentText()), lists.replace('[ ]', '[x]'));
    await page.locator('.cm-preview-task').nth(2).click();
    assert.ok((await page.evaluate(() => window.controller.getDocumentText())).includes('  - [ ] nested'));
    checks.push('Unchecked/lowercase/uppercase/nested task controls update one source character and undo/redo');
    await page.screenshot({ path: path.join(output, 'lists.png') });
    await drag(lists, lists.indexOf('todo'), lists.indexOf('todo') + 4);
    await drag(lists, lists.indexOf('grandchild') + 10, lists.indexOf('child'));
    checks.push('Task and multilevel bullet item text remain precisely selectable');
    await load('- parent\n\n  [ ] secondary\n\nend');
    assert.ok((await page.locator('.cm-content').innerText()).includes('parent'));
    assert.equal(await page.locator('.cm-preview-task').count(), 1);
    checks.push('A task in a later list paragraph keeps parent text and valid single-line decorations');
    await load(across);
    await page.locator('.document-table').click();
    assert.equal(await page.locator('.document-table').count(), 0);
    assert.equal(await page.evaluate(() => window.controller.getDocumentText()), across);
    checks.push('Table click still opens source without changing Markdown');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, output }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    if (app) await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
