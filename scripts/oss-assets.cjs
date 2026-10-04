// Code-native vector banners reuse the original Folio icon unchanged.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'docs/images');
fs.mkdirSync(output, { recursive: true });
const icon = fs.readFileSync(path.join(root, 'assets/folio-mark.png')).toString('base64');
for (const dark of [false, true]) {
  const palette = dark ? ['#232625', '#dedfd9', '#a5c7b5', '#b1b8af', '#3c4540'] : ['#faf9f6', '#30332f', '#466e60', '#626860', '#e2e6df'];
  const [paper, ink, moss, secondary, line] = palette;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 310" role="img" aria-labelledby="title desc"><title id="title">Folio · 轻页</title><desc id="desc">安静地写，清楚地表达。 Write quietly. Express clearly.</desc><rect width="1200" height="310" rx="22" fill="${paper}"/><path d="M72 253H1128" stroke="${line}"/><image x="74" y="91" width="80" height="80" xlink:href="data:image/png;base64,${icon}"/><text x="184" y="163" fill="${ink}" font-family="Georgia,serif" font-size="94" letter-spacing="-3">Folio</text><text x="440" y="157" fill="${moss}" font-family="Microsoft YaHei,Segoe UI,sans-serif" font-size="52" font-weight="400">· 轻页</text><text x="78" y="220" fill="${secondary}" font-family="Microsoft YaHei,Segoe UI,sans-serif" font-size="26">安静地写，清楚地表达。</text><text x="78" y="284" fill="${secondary}" font-family="Segoe UI,sans-serif" font-size="17" letter-spacing="2">WRITE QUIETLY. EXPRESS CLEARLY.</text><g fill="none" stroke="${line}" stroke-width="2"><rect x="935" y="73" width="160" height="146" rx="12"/><path d="M963 111H1067M963 137H1067M963 163H1040M963 189H1015"/></g><circle cx="1095" cy="219" r="7" fill="${moss}"/></svg>`;
  fs.writeFileSync(path.join(output, `hero-${dark ? 'dark' : 'light'}.svg`), svg + '\n');
}
console.log('Created light/dark brand banners from the existing icon.');
