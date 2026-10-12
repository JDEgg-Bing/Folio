// System clipboard + native keyboard/menu input, isolated app profile/documents.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {_electron} = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname,'..'), output = path.join(root,'out/image-paste',`run-${Date.now()}`), file = path.join(output,'paste.md');
fs.mkdirSync(output,{recursive:true}); fs.writeFileSync(file,'above\nreplace me\nbelow');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB0kAAAAASUVORK5CYII=','base64');
const first=path.join(output,'资源 图.png'), second=path.join(output,'second.svg');fs.writeFileSync(first,png);fs.writeFileSync(second,'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>');
let app,page; const checks=[],errors=[];
async function wait(fn,label){for(let i=0;i<250;i++){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error(`Timeout: ${label}`);}
const command=id=>app.evaluate(({BrowserWindow},id)=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).webContents.send('app:command',id),id);
async function save(){await command('save');await wait(async()=> (await page.locator('.status-document').innerText()).includes('已保存'),'saved');return fs.readFileSync(file,'utf8');}
async function pixels(bytes){const result=await app.evaluate(({clipboard,nativeImage},b64)=>{const image=b64?nativeImage.createFromBuffer(Buffer.from(b64,'base64')):nativeImage.createFromBitmap(Buffer.alloc(16*16*4,255),{width:16,height:16});clipboard.clear();clipboard.writeImage(image);return {empty:clipboard.readImage().isEmpty(),text:clipboard.readText()};},bytes?.toString('base64'));assert.equal(result.empty,false);assert.equal(result.text,'');}
async function fileClipboard(files){const json=path.join(output,'clipboard-files.json');fs.writeFileSync(json,JSON.stringify(files));const script=`$ProgressPreference = 'SilentlyContinue'; Add-Type -AssemblyName System.Windows.Forms; $paths = Get-Content -LiteralPath '${json.replaceAll("'","''")}' -Raw -Encoding UTF8 | ConvertFrom-Json; $list = New-Object System.Collections.Specialized.StringCollection; foreach ($item in $paths) { [void]$list.Add($item) }; [System.Windows.Forms.Clipboard]::SetFileDropList($list)`;execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});}
async function end(){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).focus());await page.locator('.cm-content').focus();await page.keyboard.press('Control+End');}
async function pasteAndSave(pattern,menu=false){if(menu){await page.getByRole('menuitem',{name:'编辑',exact:true}).click();await page.getByRole('menuitem',{name:'粘贴',exact:true}).click();}else await page.keyboard.press('Control+v');await wait(()=>page.locator('.document-figure img').count().then(n=>n>0),'paste image');let text;await wait(async()=>{text=await save();return pattern.test(text);},'paste source');return text;}
(async()=>{try{
 app=await _electron.launch({executablePath:process.env.FOLIO_ACCEPTANCE_EXECUTABLE||path.join(root,'out/Folio-win32-x64/Folio.exe'),args:[`--user-data-dir=${path.join(output,'profile')}`,file],timeout:30000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.locator('.cm-content').waitFor();
 await page.locator('.cm-content').click();await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.down('Shift');await page.keyboard.press('End');await page.keyboard.up('Shift');
 // Exact replacement below verifies the Shift selection. Ctrl+C is covered by
 // the interaction suite; input-method clipboard history may replay that text
 // later and overwrite the deliberately installed image fixture.
 const screenshot=await page.screenshot({path:path.join(output,'clipboard-screenshot.png')});await pixels(screenshot);
 let text=await pasteAndSave(/!\[image\]/);assert.match(text,/^above\n!\[image\]\(<assets\/.+\.png>\)\nbelow$/);
 checks.push('Real screenshot pixels pasted with Ctrl+V replace exactly the captured source selection');
 await page.keyboard.press('Control+z');assert.equal(await save(),'above\nreplace me\nbelow');await page.keyboard.press('Control+y');assert.equal(await save(),text);
 checks.push('One native undo/redo restores the selected text/image transaction');
 await end();await pixels();text=await pasteAndSave(/!\[image\][\s\S]*!\[image\]/,true);
 checks.push('Visible Edit > Paste inserts OS clipboard pixels through the same asset workflow');
 await end();await fileClipboard([first]);text=await pasteAndSave(/!\[资源 图\]/);
 checks.push('Windows Explorer-compatible CF_HDROP single file pastes using Ctrl+V');
 await end();await fileClipboard([first,second]);text=await pasteAndSave(/!\[second\]/,true);
 assert.equal((text.match(/!\[资源 图\]/g)||[]).length,2);assert.match(text,/!\[资源 图\]\([^\n]+\)\n!\[second\]/);
 checks.push('Explorer-compatible multiple image files paste in order through the menu without blank separators');
 // Deliberately omit DOM file data to exercise the STA reader, with a real OS file list.
 await end();await fileClipboard([second]);await page.locator('.cm-content').evaluate(el=>el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()})));
 await wait(async()=> (await save()).match(/!\[second\]/g)?.length===2,'STA fallback');text=fs.readFileSync(file,'utf8');
 checks.push('Empty browser file data falls back to the hidden Windows STA file-list reader');
 await end();const before=text;await app.evaluate(({clipboard})=>clipboard.writeText('**plain** https://example.com/image.png'));await page.keyboard.press('Control+v');text=await save();assert.equal(text,before+'**plain** https://example.com/image.png');
 checks.push('Plain Markdown and URLs remain normal text paste');
 await page.keyboard.press('Control+z');text=await save();
 await page.locator('.document-figure img').last().scrollIntoViewIfNeeded();const rect=await page.locator('.document-figure img').last().boundingBox();
 await app.evaluate(({clipboard,BrowserWindow},rect)=>{clipboard.clear();BrowserWindow.getAllWindows().find(w=>w.isVisible()).webContents.copyImageAt(Math.round(rect.x+rect.width/2),Math.round(rect.y+rect.height/2));},rect);
 await wait(()=>app.evaluate(({clipboard})=>!clipboard.readImage().isEmpty()),'browser copy image');await end();text=await pasteAndSave(/(?:!\[image\][\s\S]*){3}/);
 checks.push('Chromium Copy Image pixels from a displayed image paste back as a managed PNG');
 await end();fs.writeFileSync(path.join(output,'broken.png'),'invalid');await fileClipboard([path.join(output,'broken.png')]);await page.keyboard.press('Control+v');await page.locator('.error-banner').waitFor();assert.equal(await save(),text);
 checks.push('Invalid image import leaves source unchanged');
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await command('open');await wait(()=>page.locator('.document-figure img').evaluateAll(imgs=>imgs.length===7&&imgs.every(img=>img.complete&&img.naturalWidth>0)),'saved images reopen');
 checks.push('Saved source reopens with every pasted relative image loading successfully');
 await command('new');await wait(async()=>!(await page.locator('.cm-content').innerText()).trim(),'new document');await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});await page.locator('.cm-content').click();await pixels();await page.keyboard.press('Control+v');await page.waitForTimeout(400);assert.equal(await page.locator('.document-figure').count(),0);assert.equal((await page.locator('.cm-content').innerText()).trim(),'');
 checks.push('Canceling save for an unsaved paste leaves document and attachments unchanged');
 // Delay only the test process's existing handler; production IPC is unchanged.
 await app.evaluate(({ipcMain})=>{const key='asset:stage-bytes',handler=ipcMain._invokeHandlers.get(key);ipcMain.removeHandler(key);ipcMain.handle(key,async(...args)=>{await new Promise(resolve=>setTimeout(resolve,1200));return handler(...args);});});
 await page.locator('.cm-content').click();await pixels();await page.keyboard.press('Control+v');await command('open');await wait(()=>page.locator('.document-figure img').count().then(n=>n===7),'switch document');await page.waitForTimeout(1500);
 assert.equal(await save(),text);assert.equal(await page.locator('.document-figure').count(),7);
 checks.push('Switching document while image staging is pending never pastes into the new document');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,output},null,2));
 }catch(error){if(page&&!page.isClosed()){const clipboard=await app.evaluate(({clipboard})=>({formats:clipboard.availableFormats(),text:clipboard.readText(),size:clipboard.readImage().getSize()}));await page.screenshot({path:path.join(output,'failure.png')});fs.writeFileSync(path.join(output,'failure.txt'),error.stack+'\n'+JSON.stringify(clipboard)+'\n'+await page.locator('body').innerText());}throw error;}
 finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,errors},null,2));if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close();}}
})().catch(error=>{console.error(error);process.exitCode=1;});
