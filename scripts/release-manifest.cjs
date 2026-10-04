// Publishable artifacts and private acceptance diagnostics are deliberately separate.
const fs = require('node:fs'), path = require('node:path');
const { sha256, buildIdentity, validateEvidence } = require('./release-evidence.cjs');
const root = path.resolve(__dirname, '..'), pkg = require('../package.json');
function argument(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  if (!process.argv[at + 1] || process.argv[at + 1].startsWith('--')) throw new Error(`Missing value: ${name}`);
  return path.resolve(process.argv[at + 1]);
}
const application = argument('--application-dir', path.join(root, 'out/Folio-win32-x64'));
const build = buildIdentity(application);
if (build.version !== pkg.version) throw new Error('Packaged application version differs from source.');
function acceptance(folder, file, explicit) {
  if (explicit) return { file: explicit, report: validateEvidence(JSON.parse(fs.readFileSync(explicit, 'utf8')), build, folder) };
  const base = path.join(root, folder);
  const candidates = fs.existsSync(base) ? fs.readdirSync(base).filter(name => name.startsWith('run-')).sort().reverse() : [];
  for (const candidate of candidates) {
    const source = path.join(base, candidate, file);
    try { return { file: source, report: validateEvidence(JSON.parse(fs.readFileSync(source, 'utf8')), build, folder) }; } catch {}
  }
  throw new Error(`Missing passing acceptance for this exact application: ${folder}. Run the documented desktop checks.`);
}
const desktop = acceptance('out/release-acceptance', 'results.json', argument('--desktop-results'));
const word = acceptance('out/word-templates', 'desktop-results.json', argument('--word-results'));
const lifecycleFile = argument('--lifecycle-results', path.join(root, 'out/journey-design/lifecycle-results.json'));
const lifecycle = validateEvidence(JSON.parse(fs.readFileSync(lifecycleFile, 'utf8')), build, 'installer lifecycle');
if (!['install', 'uninstall', 'reinstall', 'retainedDataRead'].every(key => lifecycle.checks?.[key] === true)) throw new Error('Incomplete installer lifecycle acceptance.');
const installerName = `Folio-${pkg.version} Setup.exe`;
const installer = path.join(root, 'out/make/folio.windows/x64', installerName);
const installerBytes = fs.readFileSync(installer);
const sidecar = JSON.parse(fs.readFileSync(installer + '.build.json', 'utf8'));
for (const key of ['version', 'asarSha256', 'applicationSha256']) if (sidecar.build[key] !== build[key]) throw new Error('Installer does not match the tested application.');
const installerSha256 = sha256(installerBytes);
if (sidecar.installerSha256 !== installerSha256) throw new Error('Installer changed after compilation.');
if (lifecycle.productionInstallerSha256 !== installerSha256) throw new Error('Installer lifecycle is bound to a different production installer.');
const base = path.join(root, `out/releases/Folio-${pkg.version}-win32-x64`);
const output = path.join(base, 'public'), diagnostics = path.join(base, 'private-diagnostics', `run-${Date.now()}`);
// All gating happens above. Never export raw profiles, local paths or screenshots as release attachments.
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(diagnostics, { recursive: true });
fs.copyFileSync(installer, path.join(output, installerName));
for (const [name, source] of [['desktop-results.json', desktop.file], ['word-template-results.json', word.file], ['lifecycle-results.json', lifecycleFile]]) fs.copyFileSync(source, path.join(diagnostics, name));
const resources = path.join(application, 'resources/release-resources');
const zipped = {};
function collect(dir, prefix = '') {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = prefix + item.name, source = path.join(dir, item.name);
    if (item.isDirectory()) collect(source, name + '/'); else zipped[name] = fs.readFileSync(source);
  }
}
collect(resources); collect(path.join(application, 'resources/mathml2omml'), 'mathml2omml/');
const materialName = `Folio-${pkg.version}-notices.zip`, materialBytes = require('fflate').zipSync(zipped);
fs.writeFileSync(path.join(output, materialName), materialBytes);
fs.copyFileSync(path.join(resources, 'LICENSE'), path.join(output, 'LICENSE'));
fs.copyFileSync(path.join(resources, 'RELEASE_NOTES.md'), path.join(output, 'RELEASE_NOTES.md'));
const artifacts = [{ name: installerName, bytes: installerBytes.length, sha256: installerSha256 }, { name: materialName, bytes: materialBytes.length, sha256: sha256(materialBytes) }];
for (const name of ['LICENSE', 'RELEASE_NOTES.md']) { const bytes = fs.readFileSync(path.join(output, name)); artifacts.push({ name, bytes: bytes.length, sha256: sha256(bytes) }); }
fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), artifacts.map(item => `${item.sha256}  ${item.name}`).join('\n') + '\n');
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ product: 'Folio · 轻页', version: pkg.version, status: 'release-candidate', platform: 'win32-x64', signature: 'NotSigned', build, artifacts, acceptance: { desktop: 'PASS', word: 'PASS', installerLifecycle: 'PASS', installerLifecycleScope: lifecycle.scope, upgrade: lifecycle.upgrade, desktopLimits: desktop.report.limits } }, null, 2));
console.log(`Public release materials: ${output}\nPrivate diagnostics: ${diagnostics}`);
