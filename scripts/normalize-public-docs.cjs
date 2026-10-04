// One-time publication preparation; retained historical evidence stays local.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['product-identity-review.md', 'visual-design-review.md', 'word-template-stress-baseline.md']) {
  const file = path.join(root, 'docs', name);
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/!?\[([^\]]*)\]\((?:\.\.\/)?(out\/[^)]+)\)/g, '$1（本地历史证据：`$2`）');
  content = content.replace(/\]\(assets\//g, '](../assets/');
  content = content.replace(/^- 图标由内置 Image Gen 生成；.*$/m, '- 图标由内置 Image Gen 生成；最终采用不透明输出，原始图标与多尺寸 ICO 保留在项目 assets 目录。');
  const marker = '\n> 历史阶段记录；其中测试数量、界面与边界只对应当时构建。当前范围以 [1.2.0 发布验收](RELEASE_ACCEPTANCE.md)和[统一规范](DESIGN_SYSTEM.md)为准。原始日志与历史截图留在本地，不随源码公开。\n';
  if (!content.includes('> 历史阶段记录')) content = content.replace(/^(# .+\n)/, '$1' + marker);
  fs.writeFileSync(file, content);
}
console.log('Normalized historical review links without removing local evidence.');
