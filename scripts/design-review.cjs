// Self-contained review of actual screenshots, without modifying the images.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'out/journey-design');
const recent=(folder,file)=>fs.readdirSync(path.join(root,folder)).filter(name=>name.startsWith('run-')).sort().reverse().map(name=>path.join(root,folder,name)).find(dir=>{
 try{return JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')).result==='PASS';}catch{return false;}
});
const desktop=recent('out/release-acceptance','results.json'),templates=recent('out/word-templates','desktop-results.json');
if(!desktop||!templates||JSON.parse(fs.readFileSync(path.join(output,'installed-app-results.json'),'utf8')).result!=='PASS')throw new Error('Complete actual acceptance before generating the review');
const shots=[
 ['01 安装欢迎','正式交付包欢迎页；位置、快捷方式、执行前汇总和取消均已实际查看。',path.join(output,'native/11-production-welcome-0.png')],
 ['安装位置与资料','正式包默认程序目录与个人资料分开；当前用户安装。',path.join(output,'native/13-production-location-0.png')],
 ['旧版整理选项','正式包实际发现旧版，清理选项默认不选；真实旧版迁移仍未执行。',path.join(output,'native/12-production-legacy-choice-0.png')],
 ['执行前汇总','执行安装前说明目标；“安装轻页”是唯一继续动作。',path.join(output,'native/10-installer-ready-0.png')],
 ['02 升级与重装','实际 1.1.0→1.2.0；卸载后重装。版本、注册、入口和资料逐项核对。',path.join(output,'native/08-reinstall-finished-0.png')],
 ['03 首次启动','三个短步骤，主动作直接可见；完整指南留在 F1。',path.join(desktop,'01-welcome.png')],
 ['04 写作与阅读','延续现有写作画布；混合文稿含图片、公式、表格和引用。',path.join(desktop,'02-mixed-light.png')],
 ['05 设置与小窗口','明暗、100/125/150/200% 应用缩放和 640×420；滚动内容，操作保持可见。',path.join(desktop,'13-appearance-small-dark.png')],
 ['Word 模板小窗口','模板选择、说明、映射和操作使用共享规范。',path.join(desktop,'13-word-templates-small-dark.png')],
 ['06 保存与冲突','未保存默认保存；外部覆盖默认取消，Esc 保留编辑与磁盘原稿。',path.join(desktop,'09-unsaved-confirmation.png')],
 ['外部覆盖','危险动作使用明确动词和危险色，不作为默认动作。',path.join(desktop,'10-external-change-confirmation.png')],
 ['07 导出','单选版式卡片与“选择保存位置”；实际 PDF/DOCX 导出与失败重试通过。',path.join(desktop,'11-export-preset-cards.png')],
 ['模板删除','默认取消；Esc 只关闭确认并恢复按钮焦点；明确删除仅移除测试副本。',path.join(output,'12-template-delete-confirm.png')],
 ['08 重装后恢复','重装的软件实际读取保存的草稿；恢复仍标为已修改。',path.join(output,'09-reinstalled-recovery.png')],
 ['丢弃恢复草稿','先显示确认说明，第二次明确点击才丢弃；Esc 保留。',path.join(output,'10-recovery-discard-confirm.png')],
 ['09 偏好与退出','旧版正常保存的字体与字号在重装后读取；保存、退出与焦点验证通过。',path.join(output,'11-reinstalled-preferences.png')],
 ['10 卸载','明确程序移除与资料保留；Windows 原生确认控件保持系统行为。',path.join(output,'native/07-uninstall-confirmation-0.png')]
];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=file=>'data:image/png;base64,'+fs.readFileSync(file).toString('base64');
const before=[['原欢迎页：完整指南占据首屏','before/01-welcome-0.png'],['原导出版式：系统消息框中的直接动作','before/04-export-1.png']];
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>轻页 1.2.0 · 全流程设计验收</title><style>
*{box-sizing:border-box}body{margin:0;background:#faf9f6;color:#30332f;font:15px/1.8 'Segoe UI','Microsoft YaHei UI',sans-serif}main{max-width:1180px;margin:auto;padding:40px 24px}h1{font-size:32px;line-height:1.3}h2{font-size:23px;margin-top:48px}p{max-width:900px}.tag{display:inline-block;background:#edf4ee;color:#346451;padding:4px 12px;border:1px solid #cfdfd3;border-radius:6px;margin-right:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,450px),1fr));gap:24px}figure{margin:0;padding:20px;background:#fffefa;border:1px solid #e2e4dc;border-radius:12px}figure img{display:block;width:100%;height:auto;margin-top:16px;border:1px solid #e2e4dc}figcaption strong{display:block;font-size:18px}figcaption span{display:block;color:#626860;font-size:13px}details{padding:16px;background:#f2f2ee;margin-top:24px}code{overflow-wrap:anywhere;font-size:12px}a{color:#466e60}li{margin:6px 0}@media print{figure{break-inside:avoid}main{padding:0}.grid{display:block}figure{margin-bottom:20px}}
</style><main><p>FOLIO · 轻页 / 2026-10-03</p><h1>从安装到卸载，使用同一套规则</h1><p>统一纸页标志、纸色与墨色、中文界面字体、间距、控件、按钮层级、危险操作、键盘焦点与反馈。以下均为本次真实运行截图，不是效果图。</p><p><span class="tag">404 / 404 自动测试</span><span class="tag">实际桌面回归通过</span><span class="tag">隔离安装生命周期通过</span></p><p>保留原有写作画布与个人排版。Windows 文件选择、安装框架确认和崩溃应急窗口继续使用系统控件；字体、名称、说明与流程约定统一，不声称逐像素相同。</p><h2>改造前的观察</h2><div class="grid">${before.map(([title,file])=>`<figure><figcaption><strong>${escape(title)}</strong></figcaption><img alt="${escape(title)}" src="${image(path.join(output,file))}"></figure>`).join('')}</div><h2>沿完整流程验收</h2><div class="grid">${shots.map(([title,note,file])=>`<figure><figcaption><strong>${escape(title)}</strong><span>${escape(note)}</span></figcaption><img alt="${escape(title)}" src="${image(file)}" loading="lazy"></figure>`).join('')}</div><h2>实际验证范围</h2><ul><li>隔离 AppId、安装目录、快捷方式和资料目录，实际安装旧 1.1.0 代码、在应用中修改设置并正常退出，升级到 1.2.0，卸载和重装；13 份资料文件校验不变。</li><li>重装的程序实际读取自定义字体与 19px 字号、三份模板、默认模板及恢复草稿；之后的删除、恢复和保存仅操作验收资料。</li><li>修复补查中发现的嵌套确认 Esc 同时关闭父窗口问题；重包后复测当前确认、父窗口和焦点。</li><li>类型检查、404 项自动测试、目录版桌面回归、Word 模板回归和重装后应用检查。</li></ul><h2>仍需跨环境验证</h2><p>实体中文输入法、物理系统 DPI／多显示器、第二台电脑、真实旧 Squirrel 1.0.0 迁移及长期试用尚未验证。应用缩放、旧代码在新向导中的安装和本机隔离测试不能替代这些项目。安装包尚未签名；当前版本仍是发布候选。</p><details><summary>证据目录与复现</summary><p><code>${escape(desktop)}</code></p><p><code>${escape(templates)}</code></p><p><code>${escape(output)}</code></p><p>完整规则：docs/DESIGN_SYSTEM.md；逐项记录：docs/JOURNEY_DESIGN_ACCEPTANCE.md。构建与验收脚本位于 scripts。</p></details></main></html>`;
fs.writeFileSync(path.join(output,'review.html'),html);
console.log(JSON.stringify({review:path.join(output,'review.html'),desktop,templates,screenshots:shots.length+before.length}));
