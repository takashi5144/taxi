const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'pages', 'Revenue.jsx');
let s = fs.readFileSync(file, 'utf8');
const before = s.length;

// Remove landmark + reverse geocode block through _formatAddress
const startMarker = '  // GPS座標から近くのランドマーク名を取得';
const endMarker = '  const handleSubmit = (e) => {';
const a = s.indexOf(startMarker);
const b = s.indexOf(endMarker);
if (a >= 0 && b > a) {
  s = s.slice(0, a) + '\n' + s.slice(b);
  console.log('removed geocode block');
}

// Simplify handleSubmit GPS inject
s = s.replace(
  /\/\/ GPS座標とランドマーク情報をformに注入[\s\S]*?\/\/ 待機情報を保存[\s\S]*?\/\/ 合算日の設定/,
  '// 合算日の設定'
);
// If that failed, try smaller replace
s = s.replace(
  /const formWithCoords = \{ \.\.\.form \};\s*if \(gpsInfo\.pickup[\s\S]*?formWithCoords\.dropoffLandmark = gpsInfo\.dropoff\.landmark;\s*\}\s*/,
  'const formWithCoords = { ...form };\n    '
);

// reset form after save
s = s.replace(
  /setForm\(\{ date: getLocalDateString\(\), weather: form\.weather[\s\S]*?customerName: '' \}\);/,
  "setForm({ date: getLocalDateString(), amount: '', paymentMethod: 'cash', discounts: {}, pickupTime: '', dropoffTime: '', passengers: '1' });"
);

// Remove getEditGpsLocation function
const gpsFn = s.indexOf('  const getEditGpsLocation = useCallback');
if (gpsFn >= 0) {
  // find next top-level const after function
  const next = s.indexOf('\n  const ', gpsFn + 10);
  const next2 = s.indexOf('\n  // ', gpsFn + 10);
  let end = next > 0 ? next : next2;
  // better: match braces from useCallback
  const braceStart = s.indexOf('{', gpsFn);
  let depth = 0;
  let endB = -1;
  for (let p = braceStart; p < s.length; p++) {
    if (s[p] === '{') depth++;
    else if (s[p] === '}') {
      depth--;
      if (depth === 0) {
        endB = p + 1;
        // skip ); and newline
        while (endB < s.length && /[);\s]/.test(s[endB])) endB++;
        break;
      }
    }
  }
  if (endB > 0) {
    s = s.slice(0, gpsFn) + s.slice(endB);
    console.log('removed getEditGpsLocation');
  }
}

// Remove GPS buttons from edit form - replace GPS button blocks with nothing
s = s.replace(
  /React\.createElement\('button', \{\s*type: 'button',\s*onClick: \(\) => getEditGpsLocation\('pickup'\)[\s\S]*?\}, editGpsLoading\.pickup \? 'GPS取得中\.\.\.' : 'GPS'\s*\)\s*,?\s*/g,
  ''
);
s = s.replace(
  /React\.createElement\('button', \{\s*type: 'button',\s*onClick: \(\) => getEditGpsLocation\('dropoff'\)[\s\S]*?\}, editGpsLoading\.dropoff \? 'GPS取得中\.\.\.' : 'GPS'\s*\)\s*,?\s*/g,
  ''
);

// Remove editGpsLoading state if present
s = s.replace(/const \[editGpsLoading, setEditGpsLoading\] = useState\(\{ pickup: false, dropoff: false \}\);\s*/g, '');
s = s.replace(/setEditGpsLoading\([^)]*\);\s*/g, '');

// Remove gpsButtonStyle helper if present
const gbs = s.indexOf('  // GPS取得ボタンのスタイル');
if (gbs >= 0) {
  const nextConst = s.indexOf('\n  const handleSubmit', gbs);
  const nextReturn = s.indexOf('\n  return ', gbs);
  const end = nextReturn > 0 ? nextReturn : (nextConst > 0 ? nextConst : -1);
  // find function gpsButtonStyle
  const fn = s.indexOf('gpsButtonStyle', gbs);
}

// Remove references to gpsLoading in render - may leave broken parts; clean edit GPS UI labels
s = s.replace(/\/\/ 乗車地（GPS付き）/g, '// 乗車地');
s = s.replace(/\/\/ 降車地（GPS付き）/g, '// 降車地');

fs.writeFileSync(file, s);
console.log('Revenue', before, '->', s.length);

// verify no bare gpsInfo
const bad = (s.match(/\bgpsInfo\b/g) || []).length;
const bad2 = (s.match(/\bgpsLoading\b/g) || []).length;
const bad3 = (s.match(/\bgetEditGpsLocation\b/g) || []).length;
console.log('remaining gpsInfo', bad, 'gpsLoading', bad2, 'getEditGps', bad3);
