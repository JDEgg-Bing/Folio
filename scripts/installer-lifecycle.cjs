// Real test-identity installer lifecycle. Never uninstall an existing user installation.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { _electron } = require(process.env.MARKDOWN_PLAYWRIGHT_MODULE || 'playwright');
const { buildIdentity, sha256 } = require('./release-evidence.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'out/journey-design');
const application = path.join(root, 'out/Folio-win32-x64'), pkg = require('../package.json');
const build = buildIdentity(application), installed = path.join(output, 'installed'), profile = path.join(output, 'installed-profile');
const installer = path.join(output, 'installer', `Folio-${pkg.version}-Acceptance-Setup.exe`);
const production = path.join(root, 'out/make/folio.windows/x64', `Folio-${pkg.version} Setup.exe`);
const registry = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Folio.Journey.Acceptance_is1';
const report = { result: 'STARTED', build, checks: {}, upgrade: { result: 'NOT_RUN', reason: 'No previous application supplied; not evidence of legacy Squirrel migration.' }, scope: 'Isolated AppId/ProgID/install directory/profile. Test and production installers contain the same application; test identity differs.' };
const arg = name => { const at = process.argv.indexOf(name); if (at < 0) return null; if (!process.argv[at + 1] || process.argv[at + 1].startsWith('--')) throw new Error(`Missing ${name}`); return path.resolve(process.argv[at + 1]); };
const previous = arg('--previous-application');
function run(executable, args) { execFileSync(executable, args, { windowsHide: true, stdio: 'pipe', timeout: 120000 }); }
function install(executable, label) { run(executable, ['/FolioAcceptanceInstall=1', '/NORESTART', `/LOG=${path.join(output, label + '.log')}`]); }
function uninstall() {
  const executable = path.resolve(installed, 'unins000.exe');
  assert.ok(executable.startsWith(path.resolve(root, 'out') + path.sep));
  const entry = execFileSync('reg.exe', ['query', registry], { encoding: 'utf8', windowsHide: true });
  assert.ok(entry.includes(executable));
  run(executable, ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/LOG=${path.join(output, 'lifecycle-uninstall.log')}`]);
}
function verifyApplication(source) {
  const walk = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file); else assert.equal(sha256(fs.readFileSync(path.join(installed, path.relative(source, file)))), sha256(fs.readFileSync(file)));
    }
  };
  walk(source);
  assert.ok(execFileSync('reg.exe', ['query', registry], { encoding: 'utf8', windowsHide: true }).includes(installed));
  assert.ok(fs.existsSync(path.join(installed, '验收快捷方式/Folio · 轻页.lnk')));
}
function snapshot() {
  const entries = [];
  const walk = dir => { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) walk(file); else entries.push({ path: path.relative(output, file), sha256: sha256(fs.readFileSync(file)) }); } };
  for (const dir of ['Local Storage', 'word-templates', 'recovery']) walk(path.join(profile, dir));
  walk(path.join(output, '用户文稿.assets')); entries.push({ path: '用户文稿.md', sha256: sha256(fs.readFileSync(path.join(output, '用户文稿.md'))) });
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
async function launch() {
  const app = await _electron.launch({ executablePath: path.join(installed, 'Folio.exe'), args: [`--user-data-dir=${profile}`], timeout: 30000 });
  const page = await app.firstWindow(); await page.locator('.cm-content').waitFor();
  const info = await page.evaluate(() => window.desktopAPI.getAppInfo());
  assert.equal(path.resolve(info.dataPath), profile);
  if (await page.getByRole('button', { name: '开始写作', exact: true }).count()) await page.getByRole('button', { name: '开始写作', exact: true }).click();
  return { app, page, info };
}
let app;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    if (fs.existsSync(path.join(installed, 'Folio.exe'))) throw new Error('An isolated acceptance installation already exists. Use the scoped uninstall command before rerunning.');
    if (fs.existsSync(profile)) fs.renameSync(profile, path.join(output, `installed-profile-previous-${Date.now()}`));
    const testSidecar = JSON.parse(fs.readFileSync(installer + '.build.json'));
    assert.deepEqual(testSidecar.build, build); assert.equal(testSidecar.testMode, true);
    assert.equal(testSidecar.installerSha256, sha256(fs.readFileSync(installer)));
    const productionSidecar = JSON.parse(fs.readFileSync(production + '.build.json'));
    assert.deepEqual(productionSidecar.build, build); assert.equal(productionSidecar.testMode, false);
    report.installerSha256 = sha256(fs.readFileSync(installer));
    report.productionInstallerSha256 = sha256(fs.readFileSync(production));
    assert.equal(report.productionInstallerSha256, productionSidecar.installerSha256);
    let seedSource = application;
    if (previous) {
      const previousBuild = buildIdentity(previous);
      if (previousBuild.version === build.version) throw new Error('Previous version must differ from the current version.');
      const oldInstaller = path.join(output, 'installer', `Folio-${previousBuild.version}-Acceptance-Setup.exe`);
      const oldSidecar = JSON.parse(fs.readFileSync(oldInstaller + '.build.json'));
      assert.deepEqual(oldSidecar.build, previousBuild); assert.equal(oldSidecar.testMode, true);
      assert.equal(sha256(fs.readFileSync(oldInstaller)), oldSidecar.installerSha256);
      install(oldInstaller, 'lifecycle-previous'); verifyApplication(previous); seedSource = previous;
      report.upgrade = { result: 'STARTED', from: previousBuild.version, to: build.version, scope: 'Same isolated Inno identity; not legacy Squirrel migration.' };
    } else { install(installer, 'lifecycle-install'); verifyApplication(application); }
    report.checks.install = true;
    run(process.execPath, [path.join(root, 'scripts/seed-installed-preferences.cjs'), buildIdentity(seedSource).version]);
    const seeded = JSON.parse(fs.readFileSync(path.join(output, 'seeded-preferences.json')));
    const protectedFiles = snapshot(); report.protectedFiles = protectedFiles;
    if (previous) { install(installer, 'lifecycle-upgrade'); verifyApplication(application); assert.deepEqual(snapshot(), protectedFiles); report.upgrade.result = 'PASS'; }
    uninstall(); assert.ok(!fs.existsSync(path.join(installed, 'Folio.exe'))); assert.deepEqual(snapshot(), protectedFiles);
    for (const key of [registry, 'HKCU\\Software\\Classes\\Folio.Journey.Document']) {
      let exists = true; try { run('reg.exe', ['query', key]); } catch { exists = false; } assert.equal(exists, false);
    }
    report.checks.uninstall = true;
    install(installer, 'lifecycle-reinstall'); verifyApplication(application); assert.deepEqual(snapshot(), protectedFiles); report.checks.reinstall = true;
    const opened = await launch(); app = opened.app; const page = opened.page;
    assert.equal(opened.info.version, build.version);
    await page.getByRole('button', { name: '恢复文稿', exact: true }).click();
    await page.locator('.recovery-dialog').waitFor({ state: 'detached' });
    assert.ok((await page.locator('.cm-content').innerText()).includes('重装后恢复的文稿'));
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('markdown-editor.preferences.v1'))), seeded.preferences);
    const templates = await page.evaluate(() => window.desktopAPI.wordTemplates.list());
    assert.equal(templates.templates.length, 1); assert.equal(templates.defaultId, templates.templates[0].id);
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, path.join(output, 'restored-copy.md'));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.isVisible()).webContents.send('app:command', 'save-as'));
    await page.waitForFunction(() => document.querySelector('.status-document')?.textContent.includes('已保存'));
    await app.close(); app = null; report.checks.retainedDataRead = true;
    uninstall(); report.checks.isolatedInstallationRemoved = true;
    assert.deepEqual(buildIdentity(application), build);
    assert.equal(sha256(fs.readFileSync(production)), report.productionInstallerSha256);
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.failure = String(error); throw error; }
  finally {
    if (app) await app.close().catch(() => {});
    fs.writeFileSync(path.join(output, 'lifecycle-results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: report.result, checks: report.checks, upgrade: report.upgrade }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
