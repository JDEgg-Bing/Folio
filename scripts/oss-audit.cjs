// Heuristic review aid: reports locations only, never potential credential values.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'out/open-source-audit');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['cloud-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['assigned-secret', /\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["'][^"'\s]{12,}["']/i],
  ['personal-path', /[A-Z]:[\\/]Users[\\/](?!Public\b|Default\b)[^\s"'<>]+|[A-Z]:[\\/]000_Project[\\/]/i],
];
const findings = [], binaries = [];
function scan(bytes, file, commit = 'working-tree') {
  if (bytes.includes(0)) { if (commit === 'working-tree' && /\.(zip|docx|dotx|pdf)$/i.test(file)) binaries.push(file); return; }
  bytes.toString('utf8').split(/\r?\n/).forEach((line, index) => {
    for (const [kind, pattern] of patterns) if (pattern.test(line)) findings.push({ kind, file, commit, line: index + 1 });
  });
}
const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
for (const file of files) if (fs.existsSync(path.join(root, file))) scan(fs.readFileSync(path.join(root, file)), file);
const commits = git(['rev-list', '--all']).trim().split('\n').filter(Boolean), seen = new Set();
for (const commit of commits) {
  const tree = git(['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean);
  for (const entry of tree) {
    const match = /^(\d+) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match || seen.has(match[2])) continue; seen.add(match[2]);
    const bytes = execFileSync('git', ['cat-file', 'blob', match[2]], { cwd: root, maxBuffer: 50 * 1024 * 1024 });
    scan(bytes, match[3], commit);
  }
}
fs.mkdirSync(output, { recursive: true });
const report = { result: findings.some(item => item.kind !== 'personal-path') ? 'REVIEW_REQUIRED' : 'NO_SECRET_PATTERN_FOUND', disclaimer: 'Heuristic pattern scan, not a comprehensive audit. Review document provenance manually.', workingFiles: files.length, commits: commits.length, uniqueHistoricalBlobs: seen.size, binaryDocumentsForManualReview: binaries, findings };
fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: report.result, workingFiles: files.length, commits: commits.length, findings: findings.length, binaryDocuments: binaries.length, report: path.join(output, 'audit.json') }));
