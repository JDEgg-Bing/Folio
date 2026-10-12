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
import {DEFAULT_DOCUMENT_FEATURES} from ${sourceImport('src/renderer/preferences/DocumentFeatures')};
for(const [key,value] of Object.entries(writingTokens(DEFAULT_WRITING_APPEARANCE))) document.body.style.setProperty(key,String(value));
window.controller=createEditorController(document.querySelector('.editor-region'),()=>{});
window.editorView=EditorView.findFromDOM(document.querySelector('.cm-editor'));
window.controller.configurePresentation(DEFAULT_DOCUMENT_FEATURES,{resolveImage:async(_handle,destination)=>{if(destination.includes('slow'))await new Promise(resolve=>setTimeout(resolve,1000));return {url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="green"/></svg>'),mime:'image/svg+xml'};}},null,()=>{});
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
    const adjacent = 'alpha bravo charlie\n![picture](assets/picture.svg)\ndelta echo foxtrot\n![second](assets/picture.svg)\ngolf hotel';
    await load(adjacent); await page.locator('.document-figure img').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.document-figure img')].every(img => img.complete && img.naturalWidth));
    for (const position of [adjacent.indexOf('bravo') + 2, adjacent.indexOf('echo') + 2]) {
      const [point] = await points([position]); await page.mouse.click(point.x, point.y);
      assert.equal((await selection()).from, position); await page.keyboard.type('Z');
      assert.equal(await page.evaluate(() => window.controller.getDocumentText()), adjacent.slice(0, position) + 'Z' + adjacent.slice(position));
      await page.keyboard.press('Control+z'); assert.equal(await page.evaluate(() => window.controller.getDocumentText()), adjacent);
    }
    checks.push('Single-newline images: text above and below accepts native clicks and exact typing');
    await drag(adjacent, 6, adjacent.indexOf('foxtrot') + 7);
    await drag(adjacent, adjacent.indexOf('foxtrot') + 7, 6);
    await load(adjacent); const [imageWord] = await points([adjacent.indexOf('echo') + 2]); await page.mouse.dblclick(imageWord.x, imageWord.y);
    assert.equal((await selection()).text, 'echo'); await page.keyboard.press('Control+c'); assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()), 'echo');
    checks.push('Forward/reverse selection across images and double-click/copy below image match Markdown');
    const layout = await page.locator('.document-figure').evaluateAll(figures => figures.map(figure => {
      const image = figure.querySelector('img').getBoundingClientRect(), button = figure.querySelector('button').getBoundingClientRect(), style = getComputedStyle(figure);
      return { margin: style.marginTop, contained: button.top >= image.top && button.bottom <= image.bottom };
    }));
    assert.ok(layout.every(item => item.margin === '0px' && item.contained));
    checks.push('Block margins are zero and crop controls stay inside image pixels');
    const loading='alpha bravo\n![slow](slow.svg)\ndelta echo';await load(loading);
    assert.equal(await page.locator('.document-figure img').count(),0);
    const [loadingPoint]=await points([loading.indexOf('echo')]);await page.mouse.click(loadingPoint.x,loadingPoint.y);assert.equal((await selection()).from,loading.indexOf('echo'));
    await page.locator('.document-figure img').waitFor();await page.waitForTimeout(80);
    const [loadedPoint]=await points([loading.indexOf('echo')]);await page.mouse.click(loadedPoint.x,loadedPoint.y);
    if((await selection()).from!==loading.indexOf('echo')) { console.log(await page.evaluate(point=>{const v=window.editorView,c=document.caretPositionFromPoint(point.x,point.y);return {point,hit:v.posAtCoords(point),dom:v.posAtDOM(c.offsetNode,c.offset),top:v.documentTop,height:v.contentHeight,block:v.lineBlockAt(36),lines:[...v.contentDOM.children].map(el=>({text:el.textContent,top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height})),element:document.elementFromPoint(point.x,point.y)?.outerHTML};},loadedPoint));await page.screenshot({path:path.join(output,'loading-hit.png')}); }
    assert.equal((await selection()).from,loading.indexOf('echo'));
    for(const zoom of [1.25,0.8]){
      await app.evaluate(({BrowserWindow},zoom)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),zoom);
      await load(('scroll line\n'.repeat(20))+adjacent);await page.keyboard.press('Control+End');await page.waitForTimeout(100);
      const position=('scroll line\n'.repeat(20)).length+adjacent.indexOf('echo')+2;
      const [point]=await points([position]);await page.mouse.click(point.x,point.y);assert.equal((await selection()).from,position);
    }
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    checks.push('Text hit testing stays precise before/after image loading, scrolling and 80%/125% zoom');
    const navigation = 'alpha bravo '+ 'long wrapped content '.repeat(12)+'\n\n**bold words**\n- item one\n- item two\n\n![picture](a.svg)\ndelta echo\n\n| a | b |\n| --- | --- |\n| c | d |\n\nlast line';
    await load(navigation); await page.waitForTimeout(150); await page.locator('.cm-content').click(); await page.keyboard.press('Control+Home');
    const beforeNavigation = await page.evaluate(() => ({height:window.editorView.contentHeight,images:document.querySelectorAll('.document-figure').length,tables:document.querySelectorAll('.document-table').length}));
    let last = 0;
    for (let i = 0; i < 35; i++) { await page.keyboard.press('ArrowDown'); const current = (await selection()).to; assert.ok(current >= last, `${current} < ${last}`); last = current; }
    assert.equal(last, navigation.length);
    for (let i = 0; i < 35; i++) { await page.keyboard.press('ArrowUp'); const current = (await selection()).from; assert.ok(current <= last, `${current} > ${last}`); last = current; }
    assert.equal(last, 0);
    assert.deepEqual(await page.evaluate(() => ({height:window.editorView.contentHeight,images:document.querySelectorAll('.document-figure').length,tables:document.querySelectorAll('.document-table').length})),beforeNavigation);
    await page.keyboard.down('Shift'); for(let i=0;i<35;i++) await page.keyboard.press('ArrowDown'); await page.keyboard.up('Shift');
    assert.deepEqual(await selection(),{from:0,to:navigation.length,text:navigation});
    await page.keyboard.press('Control+c'); assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),navigation);
    assert.equal(await page.locator('.document-figure').count(),beforeNavigation.images);
    checks.push('Repeated Up/Down and Shift expansion through wrapped text, lists, blanks, image and table retain layout and stop at document boundaries');
    await load(adjacent); await page.locator('.document-figure img').first().click();
    assert.equal(await page.locator('.document-figure').count(),1);
    assert.equal(await page.evaluate(() => window.controller.getDocumentText()),adjacent);
    checks.push('Only clicking the image explicitly opens its source');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, output }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    if (app) await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
