#!/usr/bin/env node
/**
 * build.cjs - src/ ファイルから index.html を組み立て
 *
 * Usage: node scripts/build.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUTPUT = path.join(ROOT, 'index.html');

const template = JSON.parse(fs.readFileSync(path.join(__dirname, 'template.json'), 'utf-8'));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'file-order.json'), 'utf-8'));

function read(p) {
  if (!fs.existsSync(p)) { console.error(`ERROR: not found: ${p}`); process.exit(1); }
  return fs.readFileSync(p, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// --- CSS ---
const cssParts = manifest.css.map(f => {
  const content = read(path.join(SRC, 'styles', f));
  return `/* FILE: ${f} */\n${content}`;
});
const cssBlock = cssParts.join('');

// --- JS/JSX ---
const jsParts = manifest.js.map((f, i) => {
  const content = read(path.join(ROOT, f));
  const sep = '// ============================================================';
  const header = `${sep}\n// FILE: ${f}\n${sep}\n`;
  const block = header + content;
  // 最後のファイル以外は末尾を改行2つに（セクション間の空行）
  if (i < manifest.js.length - 1) {
    return block.replace(/\n+$/, '') + '\n\n';
  }
  return block.replace(/\n+$/, '') + '\n';
});
const jsBlock = jsParts.join('').replace(/\n$/, '');

// --- 組み立て ---
const output = [
  template.head,
  '<style>\n',
  cssBlock,
  '\n</style>',
  template.body,
  '  <script type="text/javascript">\n\n',
  jsBlock,
  '\n\n  </script>',
  template.sw
].join('');

fs.writeFileSync(OUTPUT, output, 'utf-8');

const lineCount = output.split('\n').length;
const sizeKB = Math.round(output.length / 1024);
console.log(`index.html generated: ${lineCount} lines, ${sizeKB} KB`);
console.log(`CSS: ${manifest.css.length} files, JS/JSX: ${manifest.js.length} files`);
