// A clean, locked Windows install without depending on upstream lifecycle bugs.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (!process.env.npm_execpath) throw new Error('Run this script with npm run setup.');
function run(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// The locked installer dependency selects os.arch without calling it. Skipping
// lifecycle hooks lets us prepare its documented vendor runtime explicitly.
run(process.env.npm_execpath, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
run(path.join(root, 'node_modules/electron/install.js'), [], { ...process.env, electron_config_cache: path.join(root, 'out/electron-cache') });
run(path.join(root, 'node_modules/esbuild/install.js'));
if (process.platform === 'win32') {
  const vendor = path.join(root, 'node_modules/electron-winstaller/vendor');
  for (const extension of ['exe', 'dll']) fs.copyFileSync(path.join(vendor, `7z-${process.arch}.${extension}`), path.join(vendor, `7z.${extension}`));
}
console.log('Locked dependencies and build runtimes are ready.');
