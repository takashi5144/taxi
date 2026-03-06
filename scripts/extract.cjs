#!/usr/bin/env node
/**
 * extract.cjs - index.html から src/ ファイルを抽出
 *
 * テキスト範囲ベースの正確な抽出。ビルド→再ビルドで完全一致を保証。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8')
  .replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// --- CSS 抽出 ---
const styleMatch = html.match(/<style>\n([\s\S]*?)\n<\/style>/);
if (!styleMatch) { console.error('ERROR: <style> not found'); process.exit(1); }
const cssBlock = styleMatch[1];

const cssMarkerRe = /^\/\*\s*FILE:\s*(.+?)\s*\*\/$/gm;
const cssFiles = [];
let cm;
while ((cm = cssMarkerRe.exec(cssBlock)) !== null) {
  cssFiles.push({ file: cm[1], markerEnd: cm.index + cm[0].length });
}

for (let i = 0; i < cssFiles.length; i++) {
  const start = cssFiles[i].markerEnd + 1; // skip \n after marker
  const end = i + 1 < cssFiles.length
    ? cssBlock.lastIndexOf('\n', cssBlock.indexOf('/* FILE:', start)) + 1
    : cssBlock.length + 1; // include trailing \n
  const content = cssBlock.slice(start, end);
  const outPath = path.join(SRC, 'styles', cssFiles[i].file);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`CSS: ${cssFiles[i].file} (${content.split('\n').length} lines)`);
}

// --- JS/JSX 抽出 ---
const scriptMatch = html.match(/<script type="text\/javascript">\n\n([\s\S]*?)\n\n {2}<\/script>/);
if (!scriptMatch) { console.error('ERROR: <script> not found'); process.exit(1); }
const jsBlock = scriptMatch[1];

// FILE マーカーは3行セット: // ====\n// FILE: xxx\n// ====
const jsMarkerRe = /^\/\/ =+\n\/\/ FILE: (.+)\n\/\/ =+$/gm;
const jsFiles = [];
let jm;
while ((jm = jsMarkerRe.exec(jsBlock)) !== null) {
  jsFiles.push({ file: jm[1], markerStart: jm.index, markerEnd: jm.index + jm[0].length });
}

for (let i = 0; i < jsFiles.length; i++) {
  const start = jsFiles[i].markerEnd + 1; // skip \n after marker block
  const end = i + 1 < jsFiles.length
    ? jsFiles[i + 1].markerStart  // 次のマーカーブロックの開始位置
    : jsBlock.length;
  // 末尾の余分な改行を削って\n1つに統一
  const raw = jsBlock.slice(start, end);
  const content = raw.replace(/\n+$/, '\n');
  const outPath = path.join(ROOT, jsFiles[i].file);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`JS:  ${jsFiles[i].file} (${content.split('\n').length} lines)`);
}

// --- テンプレート抽出 ---
const styleIdx = html.indexOf('<style>\n');
const styleEndIdx = html.indexOf('\n</style>') + '\n</style>'.length;
const scriptIdx = html.indexOf('  <script type="text/javascript">');
const scriptEndIdx = html.indexOf('\n  </script>', scriptIdx) + '\n  </script>'.length;

const template = {
  head: html.slice(0, styleIdx),
  body: html.slice(styleEndIdx, scriptIdx),
  sw: html.slice(scriptEndIdx)
};

fs.writeFileSync(path.join(__dirname, 'template.json'), JSON.stringify(template, null, 2), 'utf-8');

// --- ファイル順序 ---
const manifest = {
  css: cssFiles.map(f => f.file),
  js: jsFiles.map(f => f.file)
};
fs.writeFileSync(path.join(__dirname, 'file-order.json'), JSON.stringify(manifest, null, 2), 'utf-8');

console.log(`\n=== 完了: CSS ${cssFiles.length} + JS ${jsFiles.length} = ${cssFiles.length + jsFiles.length} files ===`);
