const fs = require('node:fs');
const path = require('node:path');
// Embed KaTeX fonts at build time, so packaged exports need no network or
// runtime node_modules paths and fonts are available before PDF pagination.
module.exports = function (source) {
  const css = source.toString().replace(/url\(([^)]+)\)/g, (_match, value) => {
    const filename = value.replace(/^['"]|['"]$/g, '');
    const font = path.resolve(path.dirname(this.resourcePath), filename);
    this.addDependency(font);
    const ext = path.extname(font).slice(1);
    return `url(data:font/${ext};base64,${fs.readFileSync(font).toString('base64')})`;
  });
  return `module.exports = ${JSON.stringify(css)};`;
};
