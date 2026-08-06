const fs = require('fs');
const path = require('path');
const files = JSON.parse(fs.readFileSync(path.join(__dirname, 'file-order.json'), 'utf8')).js;

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Error,
  Promise,
  parseInt,
  parseFloat,
  isNaN,
  URLSearchParams,
  encodeURIComponent,
};
sandbox.window = {
  TaxiApp: { utils: {}, contexts: {}, hooks: {}, components: {}, pages: {} },
  location: { hash: '', protocol: 'https:', origin: 'http://localhost', href: 'http://localhost/' },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] || null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  navigator: {},
  document: {
    getElementById() { return { innerHTML: '' }; },
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
  },
  React: {
    createElement() { return null; },
    useState(v) { return [typeof v === 'function' ? v() : v, () => {}]; },
    useEffect() {},
    useMemo(f) { return f(); },
    useCallback(f) { return f; },
    useRef(v) { return { current: v }; },
    useContext() { return {}; },
    createContext() { return { Provider: function Provider(p) { return p && p.children; } }; },
    Fragment: 'div',
    version: '18.0.0',
  },
  ReactDOM: {
    createRoot() { return { render() {} }; },
  },
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox.window;
// mirror window globals used by code
Object.defineProperty(sandbox, 'window', { value: sandbox.window, writable: true });

// code uses bare React, ReactDOM, etc. - assign from window pattern after each file? 
// Files use React as free var - need global React
sandbox.React = sandbox.window.React;
sandbox.ReactDOM = sandbox.window.ReactDOM;
sandbox.document = sandbox.window.document;
sandbox.navigator = sandbox.window.navigator;
sandbox.location = sandbox.window.location;
sandbox.localStorage = sandbox.window.localStorage;

let code = '';
for (const f of files) {
  code += '\n; // FILE ' + f + '\n' + fs.readFileSync(path.join(__dirname, '..', f), 'utf8') + '\n';
}

const vm = require('vm');
const context = vm.createContext(sandbox);
try {
  vm.runInContext(code, context, { timeout: 10000, filename: 'bundle.js' });
  console.log('BOOT OK');
  console.log('DataService', typeof context.window.DataService);
  console.log('App', typeof context.window.App);
  console.log('DashboardPage', typeof context.window.DashboardPage);
  console.log('MapProvider', typeof context.window.MapProvider);
} catch (e) {
  console.log('BOOT FAIL:', e.message);
  console.log(e.stack.split('\n').slice(0, 15).join('\n'));
  process.exit(1);
}
