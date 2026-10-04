// Export the current reviewed source without ignored artifacts or private Git history.
const fs = require('node:fs'), path = require('node:path'), { execFileSync, spawnSync } = require('node:child_process');
const { zipSync } = require('fflate');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'out/open-source'), pkg = require('../package.json');
const at = process.argv.indexOf('--directory');
const directory = at < 0 ? path.join(output, `Folio-${pkg.version}-source`) : path.resolve(process.argv[at + 1]);
if (!directory.startsWith(path.join(root, 'out') + path.sep)) throw new Error('Source snapshot must stay under the workspace out directory.');
if (fs.existsSync(directory)) throw new Error('Snapshot directory already exists; choose a new empty destination.');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: root, encoding: 'utf8', input: files.join('\n') + '\n', windowsHide: true });
if (![0, 1].includes(ignored.status)) throw new Error('Could not check ignored paths.');
if (ignored.stdout.trim()) throw new Error(`Tracked ignored files require review: ${ignored.stdout.trim()}`);
const zipped = {};
for (const file of files) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) continue;
  const bytes = fs.readFileSync(source); zipped[file.replace(/\\/g, '/')] = bytes;
  const target = path.resolve(directory, file);
  if (!target.startsWith(directory + path.sep)) throw new Error('Invalid source path.');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
}
fs.mkdirSync(output, { recursive: true });
const archive = path.join(output, `Folio-${pkg.version}-source.zip`);
fs.writeFileSync(archive, zipSync(zipped));
console.log(JSON.stringify({ directory, archive, files: Object.keys(zipped).length, gitHistory: 'excluded; original repository preserved' }));
