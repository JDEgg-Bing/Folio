const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function buildIdentity(directory) {
  const asar = path.join(directory, 'resources/app.asar');
  const metadata = JSON.parse(require('@electron/asar').extractFile(asar, 'package.json').toString());
  const entries = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error(`Unexpected symlink in application: ${item.name}`);
      if (item.isDirectory()) walk(file);
      else entries.push([path.relative(directory, file).split(path.sep).join('/'), sha256(fs.readFileSync(file))]);
    }
  }
  walk(directory); entries.sort((a, b) => a[0].localeCompare(b[0], 'en'));
  return { version: metadata.version, asarSha256: sha256(fs.readFileSync(asar)), applicationSha256: sha256(JSON.stringify(entries)) };
}
function validateEvidence(report, expected, label) {
  if (report.result !== 'PASS') throw new Error(`${label}: acceptance did not pass`);
  for (const key of ['version', 'asarSha256', 'applicationSha256']) {
    if (!report.build?.[key] || report.build[key] !== expected[key]) throw new Error(`${label}: missing or stale ${key}`);
  }
  if (report.errors?.length) throw new Error(`${label}: acceptance contains errors`);
  return report;
}
module.exports = { sha256, buildIdentity, validateEvidence };
