// Render only our standalone review artifact; no existing application is controlled.
const fs=require('node:fs'),path=require('node:path');
const {app,BrowserWindow}=require('electron');
const root=path.resolve(__dirname,'..'),output=path.join(root,'out/journey-design');
app.setPath('userData',path.join(output,'review-render-profile'));
app.whenReady().then(async()=>{
 let window;
 try{
  window=new BrowserWindow({show:false,width:1100,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await window.loadFile(path.join(output,'review.html'));
  const results=[];
  for(const [width,height] of [[1100,900],[390,844]]){
   window.setContentSize(width,height);
   const result=await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.images].length,broken:[...document.images].filter(image=>image.complete&&!image.naturalWidth).length}))))`);
   if(result.overflow||result.broken)throw new Error(JSON.stringify(result));
   const screenshot=await window.webContents.capturePage();fs.writeFileSync(path.join(output,`review-${width}.png`),screenshot.toPNG());results.push(result);
  }
  fs.writeFileSync(path.join(output,'review-results.json'),JSON.stringify({result:'PASS',results},null,2));console.log(JSON.stringify({result:'PASS',results}));window.destroy();app.exit();
 }catch(error){console.error(error);if(window)window.destroy();app.exit(1);}
});
