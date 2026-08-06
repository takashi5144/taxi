const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'utils', 'constants.js');
let c = fs.readFileSync(file, 'utf8');
const i = c.indexOf('SITE_STRUCTURE:');
if (i < 0) {
  console.log('SITE_STRUCTURE not found');
  process.exit(0);
}
const start = c.indexOf('{', i);
let depth = 0;
let endB = -1;
for (let p = start; p < c.length; p++) {
  if (c[p] === '{') depth++;
  else if (c[p] === '}') {
    depth--;
    if (depth === 0) {
      endB = p;
      break;
    }
  }
}
if (endB < 0) {
  console.log('brace match failed');
  process.exit(1);
}
// keep trailing comma if present after }
let after = endB + 1;
if (c[after] === ',') after++;
if (c[after] === '\n') after++;
const replacement = 'SITE_STRUCTURE: { name: "taxi/", type: "folder", children: [] },\n';
c = c.slice(0, i) + replacement + c.slice(after);
fs.writeFileSync(file, c);
console.log('constants new size', fs.statSync(file).size);
