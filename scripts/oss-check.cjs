const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), pkg = require('../package.json'), lock = require('../package-lock.json');
const errors = [];
const required = ['README.md', 'README.en.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'SUPPORT.md', 'CHANGELOG.md', 'ROADMAP.md'];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`Missing ${file}`);
if (pkg.license !== 'MIT' || lock.packages[''].license !== 'MIT') errors.push('License metadata must be MIT.');
if (!fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').includes('Copyright (c) 2026 Folio Contributors')) errors.push('Copyright differs from agreed identity.');
const documents = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file); else if (item.name.endsWith('.md')) documents.push(file);
  }
}
for (const file of fs.readdirSync(root)) if (file.endsWith('.md')) documents.push(path.join(root, file));
walk(path.join(root, 'docs')); walk(path.join(root, '.github'));
let links = 0;
for (const file of documents) {
  const text = fs.readFileSync(file, 'utf8');
  if (/\uFFFD/.test(text)) errors.push(`Invalid UTF-8 text: ${path.relative(root, file)}`);
  if (/[A-Z]:[\\/]Users[\\/](?!Public\b|Default\b)[^\s<`]+|[A-Z]:[\\/]000_Project[\\/]/i.test(text)) errors.push(`Personal absolute path: ${path.relative(root, file)}`);
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');
  const targets = [...withoutCode.matchAll(/!?\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)].map(match => match[1]);
  targets.push(...[...text.matchAll(/(?:src|srcset|href)="([^"]+)"/g)].map(match => match[1]));
  for (const target of targets) {
    if (/^(?:https?:|mailto:|data:)/.test(target)) continue;
    const decoded = decodeURIComponent(target.split('#')[0]);
    const resolved = decoded ? path.resolve(path.dirname(file), decoded) : file;
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) errors.push(`Broken local link: ${path.relative(root, file)} → ${target}`);
    else if (path.relative(root, resolved).startsWith('out' + path.sep)) errors.push(`Public document links to ignored artifacts: ${path.relative(root, file)} → ${target}`);
    else if (target.includes('#') && resolved.endsWith('.md')) {
      const fragment = decodeURIComponent(target.split('#')[1]);
      const headings = [...fs.readFileSync(resolved, 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-'));
      if (!headings.includes(fragment)) errors.push(`Missing heading anchor: ${path.relative(root, file)} → ${target}`);
    }
    links++;
  }
}
for (const image of ['hero-light.svg', 'hero-dark.svg', 'writing-light.png', 'writing-dark.png', 'word-template.png']) if (!fs.existsSync(path.join(root, 'docs/images', image))) errors.push(`Missing README image: ${image}`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS: MIT metadata, ${documents.length} Markdown documents, ${links} local links and README assets.`);
