// Actual isolated installer lifecycle, launched through the CLI. GUI capture uses Computer Use.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'out/journey-design'),install=path.join(folder,'installed');
const key='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Folio.Journey.Acceptance_is1';
const stage=process.argv[2],version=process.argv[3]||require('../package.json').version;
const option=name=>{const at=process.argv.indexOf(name);if(at<0)return null;if(!process.argv[at+1]||process.argv[at+1].startsWith('--'))throw new Error(`Missing ${name}`);return path.resolve(process.argv[at+1]);};
fs.mkdirSync(folder,{recursive:true});
const resultPath=path.join(folder,'installer-results.json');
const record=fs.existsSync(resultPath)?JSON.parse(fs.readFileSync(resultPath,'utf8')):{stages:[],scope:'Real Inno installer, isolated AppId/ProgID/directory/profile; no existing user installation changed'};
const save=entry=>{record.stages.push({at:new Date().toISOString(),...entry});fs.writeFileSync(resultPath,JSON.stringify(record,null,2));console.log(JSON.stringify(entry));};
const query=id=>execFileSync('reg.exe',['query',id],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(stage==='extract-previous'){
 const previous=option('--previous-package');
 if(!previous){save({stage,result:'NOT_RUN',reason:'Provide --previous-package; no historical archive is assumed.'});return;}
 const bytes=fs.readFileSync(previous);
 const archive=require('fflate').unzipSync(bytes),output=path.join(folder,'previous-application');
 for(const [name,content] of Object.entries(archive)){
  if(!name.startsWith('lib/net45/')||name.endsWith('/'))continue;
  const target=path.resolve(output,name.slice('lib/net45/'.length));
  assert.ok(target.startsWith(output+path.sep));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);
 }
 const built=JSON.parse(require('@electron/asar').extractFile(path.join(output,'resources/app.asar'),'package.json').toString());
 assert.ok(built.version);save({stage,result:'PASS',version:built.version,directory:output});
}else if(stage==='install'||stage==='upgrade'||stage==='reinstall'||stage==='preview-install'||stage==='preview-production'){
 const executable=stage==='preview-production'?path.join(root,'out/make/folio.windows/x64',`Folio-${version} Setup.exe`):path.join(folder,'installer',`Folio-${version}-Acceptance-Setup.exe`);
 assert.ok(fs.existsSync(executable));
 const child=spawn(executable,[...(stage.startsWith('preview-')?[]:['/FolioAcceptanceInstall=1']),`/LOG=${path.join(folder,`${stage}-${version}.log`)}`],{cwd:folder,windowsHide:false,stdio:'ignore'});
 save({stage,result:'STARTED',version,pid:child.pid,executable});
 child.on('exit',code=>save({stage:stage+'-exit',result:code===0?'PASS':code===2?'CANCELED':'FAIL',code}));
}else if(stage==='verify-install'){
 const built=JSON.parse(require('@electron/asar').extractFile(path.join(install,'resources/app.asar'),'package.json').toString());
 assert.equal(built.version,version);const registration=query(key);assert.ok(registration.includes(version));assert.ok(registration.includes(install));
 const association=query('HKCU\\Software\\Classes\\Folio.Journey.Document\\shell\\open\\command');assert.ok(association.includes(path.join(install,'Folio.exe')));
 assert.ok(fs.existsSync(path.join(install,'验收快捷方式/Folio · 轻页.lnk')));
 if(record.protectedFiles)for(const file of record.protectedFiles)assert.equal(hash(file.path),file.sha256);
 save({stage,result:'PASS',version,registry:true,shortcut:true,association:true,protectedDataUnchanged:!!record.protectedFiles});
}else if(stage==='protect-data'||stage==='resnapshot-data'){
 const profiles=path.join(folder,'installed-profile');
 if(stage==='protect-data'){
 const sourceProfile=option('--source-profile');
 if(!sourceProfile)throw new Error('Provide --source-profile or use npm run release:lifecycle to generate real preferences/templates.');
 if(path.resolve(sourceProfile)===path.resolve(profiles))throw new Error('Source profile must differ from the installed profile.');
 fs.cpSync(sourceProfile,profiles,{recursive:true});
 fs.mkdirSync(path.join(profiles,'recovery'),{recursive:true});
 fs.writeFileSync(path.join(profiles,'recovery/draft.json'),JSON.stringify({version:1,text:'# 重装后恢复的文稿\n\n安装卸载验收内容。',fileHandleId:null,filePath:null,baseline:null,displayName:'恢复验收',options:{eol:'LF',hadBom:false},updatedAt:new Date().toISOString()}));
 fs.writeFileSync(path.join(folder,'用户文稿.md'),'# 安装卸载不应改动的文稿\n');fs.mkdirSync(path.join(folder,'用户文稿.assets'),{recursive:true});
 fs.copyFileSync(path.join(root,'manual-tests/long-document.assets/example.svg'),path.join(folder,'用户文稿.assets/example.svg'));
 }
 const list=[];const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else list.push(file);}};
 walk(path.join(profiles,'Local Storage'));walk(path.join(profiles,'word-templates'));walk(path.join(profiles,'recovery'));list.push(path.join(folder,'用户文稿.md'),path.join(folder,'用户文稿.assets/example.svg'));
 if(record.protectedFiles)(record.dataSnapshots??=[]).push({at:new Date().toISOString(),files:record.protectedFiles});
 record.protectedFiles=list.map(file=>({path:file,sha256:hash(file)}));save({stage,result:'PASS',files:record.protectedFiles.length});
}else if(stage==='uninstall'||stage==='preview-uninstall'){
 const executable=path.resolve(install,'unins000.exe');assert.ok(executable.startsWith(folder+path.sep));
 const registration=query(key);assert.ok(registration.includes(executable));
 const preview=stage==='preview-uninstall';
 const child=spawn(executable,preview?[]:['/SILENT','/SUPPRESSMSGBOXES','/NORESTART',`/LOG=${path.join(folder,'uninstall.log')}`],{windowsHide:!preview,stdio:'ignore'});save({stage,result:'STARTED',pid:child.pid});
 child.on('exit',code=>save({stage:stage+'-exit',result:code===0?'PASS':preview?'CANCELED':'FAIL',code}));
}else if(stage==='verify-uninstall'){
 assert.ok(!fs.existsSync(path.join(install,'Folio.exe')));
 for(const id of [key,'HKCU\\Software\\Classes\\Folio.Journey.Document']){
  let exists=true;try{query(id);}catch{exists=false;}assert.equal(exists,false,id);
 }
 for(const file of record.protectedFiles||[])assert.equal(hash(file.path),file.sha256);
 save({stage,result:'PASS',programRemoved:true,registryRemoved:true,protectedDataUnchanged:true});
}else throw new Error('Unknown acceptance stage');
