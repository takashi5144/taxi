const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'utils', 'dataService.js');
let src = fs.readFileSync(file, 'utf8');

// Find the final return { ... };
const retIdx = src.lastIndexOf('  return {');
if (retIdx < 0) {
  console.error('return block not found');
  process.exit(1);
}
const retBlock = src.slice(retIdx);
const names = [];
for (const line of retBlock.split(/\n/)) {
  const m = line.match(/^\s{4}([a-zA-Z_][a-zA-Z0-9_]*)\s*,?\s*$/);
  if (m) names.push(m[1]);
  const m2 = line.match(/^\s{4}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
  if (m2) names.push(m2[1]);
}

const missing = [];
const present = [];
for (const n of names) {
  const re = new RegExp('function\\s+' + n + '\\s*\\(');
  const re2 = new RegExp('(const|let|var)\\s+' + n + '\\s*=');
  if (re.test(src) || re2.test(src) || src.includes(n + ':')) {
    // alias in return like getFilteredEntries: ...
    if (re.test(src) || re2.test(src)) present.push(n);
    else if (retBlock.includes(n + ':')) present.push(n);
    else missing.push(n);
  } else {
    missing.push(n);
  }
}

console.log('exports', names.length);
console.log('missing', missing.length, missing.join(', '));

// Remove missing from return block OR add stubs before return
let stubs = '';
for (const n of missing) {
  if (n.startsWith('get') || n.startsWith('export') || n.startsWith('download') || n.startsWith('auto')) {
    stubs += `  function ${n}() { return n.startsWith('get') && n.includes('Entries') ? [] : (n.startsWith('get') ? [] : false); }\n`.replace(
      'n.startsWith(\'get\') && n.includes(\'Entries\') ? [] : (n.startsWith(\'get\') ? [] : false)',
      JSON.stringify(
        n.includes('Entries') || n.includes('Memos') || n.includes('Events') || n.endsWith('s') && n.startsWith('get')
          ? []
          : n.startsWith('get')
            ? (n.includes('Data') || n.includes('Analysis') || n.includes('Summary') || n.includes('Breakdown') || n.includes('Report') || n.includes('Index') || n.includes('Forecast') || n.includes('Schedule') || n.includes('Timeline') || n.includes('Action') || n.includes('Score') || n.includes('Routes') || n.includes('Simulation') || n.includes('Efficiency') || n.includes('History') || n.includes('Progress') || n.includes('Recommendation') || n.includes('Correlation') || n.includes('Matrix') || n.includes('Occupancy') || n.includes('Impact') || n.includes('Status') || n.includes('Heatmap') || n.includes('Clusters') || n.includes('Estimate') || n.includes('Countermeasures') || n.includes('Productivity') || n.includes('Alerts') || n.includes('Spots') || n.includes('Suggestion') || n.includes('WithNames') || n === 'exportMLData' ? {} : [])
            : false
      )
    );
  } else {
    stubs += `  function ${n}() { return false; }\n`;
  }
}

// Simpler stubs
stubs = missing.map((n) => {
  if (n === 'getFilteredEntries') return null; // handled as alias
  if (n.startsWith('get') || n === 'exportMLData' || n === 'reverseGeocodeSpot') {
    if (n.includes('Entries') || n.includes('Memos') || n.includes('Events') || n.endsWith('Breakdown') || n === 'getTrash') {
      return `  function ${n}() { return []; }`;
    }
    return `  function ${n}() { return {}; }`;
  }
  if (n.startsWith('auto') || n.startsWith('save') || n.startsWith('download') || n.startsWith('sync') || n.startsWith('apply') || n.startsWith('migrate') || n.startsWith('clean') || n.startsWith('clear') || n.startsWith('delete') || n.startsWith('move') || n.startsWith('restore') || n.startsWith('permanent') || n.startsWith('empty') || n.startsWith('cleanup') || n.startsWith('has') || n.startsWith('import') || n.startsWith('manual') || n.startsWith('select')) {
    return `  function ${n}() { return false; }`;
  }
  if (n.startsWith('add') || n.startsWith('update')) {
    return `  function ${n}() { return { success: false }; }`;
  }
  return `  function ${n}() { return null; }`;
}).filter(Boolean).join('\n') + '\n';

// Insert stubs just before final return
if (missing.length) {
  src = src.slice(0, retIdx) + '\n  // auto-stubs for missing exports\n' + stubs + '\n' + src.slice(retIdx);
  fs.writeFileSync(file, src);
  console.log('added stubs for', missing.length, 'exports');
}

// Verify with Function constructor of the IIFE body is hard due to deps.
// At least ensure every export name has function def now
const src2 = fs.readFileSync(file, 'utf8');
const still = [];
for (const n of names) {
  if (!new RegExp('function\\s+' + n + '\\s*\\(').test(src2) && !new RegExp(n + '\\s*:').test(src2.slice(src2.lastIndexOf('return {')))) {
    still.push(n);
  }
}
console.log('still missing', still);
