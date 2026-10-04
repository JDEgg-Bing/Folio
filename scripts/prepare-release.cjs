// Collect actual locked dependencies and their original licenses; no network at packaging time.
const fs = require('node:fs'), path = require('node:path');
const { sha256 } = require('./release-evidence.cjs');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
const output = fs.mkdtempSync(path.join(root, 'out/release-resources-next-'));
const lock = require('../package-lock.json'), pkg = require('../package.json');
if (pkg.license !== 'MIT' || lock.packages[''].license !== 'MIT') throw new Error('MIT metadata is inconsistent.');
const entries = [];
for (const [relative, entry] of Object.entries(lock.packages)) {
  if (!relative || entry.dev || entry.devOptional) continue;
  const folder = path.join(root, relative), metadataPath = path.join(folder, 'package.json');
  if (!fs.existsSync(metadataPath)) throw new Error(`Missing production dependency: ${relative}`);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (metadata.version !== entry.version) throw new Error(`Dependency version differs from lockfile: ${metadata.name}`);
  const files = fs.readdirSync(folder).filter(name => /^(licen[sc]e|copying|notice)(\.|-|$)/i.test(name) && fs.statSync(path.join(folder, name)).isFile());
  if (!files.length) throw new Error(`Missing original license: ${metadata.name}`);
  const destination = path.join(output, 'third-party-licenses', metadata.name.replace(/[/@]/g, '_'));
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(folder, file), path.join(destination, file));
  entries.push({ name: metadata.name, version: metadata.version, license: typeof metadata.license === 'string' ? metadata.license : JSON.stringify(metadata.license ?? 'See package'), repository: typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url ?? '', files });
}
const electron = require('../node_modules/electron/package.json');
fs.mkdirSync(path.join(output, 'third-party-licenses/electron'), { recursive: true });
for (const file of ['LICENSE', 'LICENSES.chromium.html']) fs.copyFileSync(path.join(root, 'node_modules/electron/dist', file), path.join(output, 'third-party-licenses/electron', file));
fs.mkdirSync(path.join(output, 'third-party-licenses/inno-setup'), { recursive: true });
fs.copyFileSync(path.join(root, 'assets/installer/inno-license.txt'), path.join(output, 'third-party-licenses/inno-setup/LICENSE.txt'));
for (const file of ['GPL-3.0.txt', 'LGPL-3.0.txt', 'entities-6.0.0-LICENSE.txt']) fs.copyFileSync(path.join(root, 'assets/licenses', file), path.join(output, 'third-party-licenses', file));

const library = path.join(root, 'node_modules/mathml2omml/dist');
const sourceMapBytes = fs.readFileSync(path.join(library, 'index.js.map'));
const sourceMap = JSON.parse(sourceMapBytes.toString());
const sourceFolder = path.join(output, 'mathml2omml-source');
fs.mkdirSync(sourceFolder, { recursive: true });
const sources = [];
for (let index = 0; index < sourceMap.sources.length; index++) {
  const name = sourceMap.sources[index].replace(/^\.\.\//, '');
  const target = path.resolve(sourceFolder, name);
  if (!target.startsWith(sourceFolder + path.sep) || typeof sourceMap.sourcesContent[index] !== 'string') throw new Error('Invalid or incomplete library source map.');
  const contents = sourceMap.sourcesContent[index];
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, contents);
  sources.push({ name, sha256: sha256(Buffer.from(contents)) });
}
const provenance = require('../assets/third-party/provenance.json');
const archive = fs.readFileSync(path.join(root, 'assets/third-party/mathml2omml-0.5.0-source.tar.gz'));
if (sha256(archive) !== provenance.mathml2omml.sha256) throw new Error('Library source archive changed.');
fs.writeFileSync(path.join(sourceFolder, 'upstream-source.tar.gz'), archive);
fs.writeFileSync(path.join(sourceFolder, 'source-manifest.json'), JSON.stringify({ upstream: provenance.mathml2omml, bundledLibrarySha256: sha256(fs.readFileSync(path.join(library, 'index.js'))), sourceMapSha256: sha256(sourceMapBytes), sources }, null, 2));
const notice = `# Folio · 轻页 ${pkg.version} — 第三方组件说明\n\nFolio 自有部分采用 MIT，见 LICENSE。第三方组件保留各自许可证，完整原文位于 third-party-licenses/。\n\nElectron ${electron.version} 与 Chromium 声明随附。Inno Setup 6.7.3 的工具许可亦随附。\n\n| 组件 | 版本 | 许可证 |\n| --- | --- | --- |\n${entries.map(entry => `| ${entry.name} | ${entry.version} | ${entry.license} |`).join('\n')}\n\nmathml2omml 0.5.0 by Johannes Wilm 使用 LGPL-3.0-or-later；其内嵌 entities 6.0.0 使用 MIT。GPL/LGPL 原文、源码映射提取的源文件、上游完整源码归档与替换重建步骤随附。另见 docx-third-party-notices.md。\n\nEnglish: Folio is MIT; dependencies retain their own licenses. Exact dependency versions and original texts accompany this build. LGPL/GPL texts, original library sources and rebuild guidance are provided for mathml2omml.\n`;
fs.writeFileSync(path.join(output, 'THIRD_PARTY_NOTICES.md'), notice);
fs.writeFileSync(path.join(output, 'dependency-manifest.json'), JSON.stringify({ product: pkg.productName, version: pkg.version, license: pkg.license, electron: electron.version, dependencies: entries, embeddedDependencies: [{ name: 'entities', version: '6.0.0', license: 'MIT', source: 'mathml2omml source map' }] }, null, 2));
for (const file of ['LICENSE', 'README.md', 'README.en.md', 'SECURITY.md', 'SUPPORT.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'ROADMAP.md']) fs.copyFileSync(path.join(root, file), path.join(output, file));
for (const file of ['USER_GUIDE.md', 'INSTALLATION.md', 'DEVELOPMENT.md', 'RELEASE_NOTES.md', 'docx-third-party-notices.md']) fs.copyFileSync(path.join(root, 'docs', file), path.join(output, file));
fs.cpSync(path.join(root, 'docs'), path.join(output, 'docs'), { recursive: true });
const destination = path.join(root, 'out/release-resources');
if (fs.existsSync(destination)) fs.renameSync(destination, path.join(root, `out/release-resources-before-${Date.now()}`));
fs.renameSync(output, destination);
console.log(`Prepared Folio ${pkg.version}: MIT, ${entries.length} dependencies, embedded entities, source archive and notices.`);
