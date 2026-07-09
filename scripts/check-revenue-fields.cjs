const fs = require('fs');
const path = require('path');
const c = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i = c.indexOf('window.RevenuePage');
if (i < 0) {
  console.error('RevenuePage not found');
  process.exit(1);
}
const rest = c.slice(i + 20);
const j = rest.search(/window\.[A-Za-z]+Page\s*=/);
const chunk = c.slice(i, i + 20 + (j > 0 ? j : 150000));
const checks = {
  weatherLoading: chunk.includes('weatherLoading'),
  genderLabel: chunk.includes('お客様性別'),
  purposeLabel: chunk.includes("'用途'"),
  memoPlaceholder: chunk.includes('任意のメモ'),
  weatherAuto: chunk.includes('天候（自動取得'),
};
console.log('Revenue chunk length:', chunk.length);
console.log(checks);
const bad = Object.entries(checks).filter(([, v]) => v);
if (bad.length) {
  console.error('FAIL: still present:', bad.map(([k]) => k).join(', '));
  process.exit(2);
}
console.log('OK: removed fields not present in Revenue form');
