(function() {
// logger.js - アプリケーションロガー
window.AppLogger = (() => {
  const MAX_LOGS = 100;
  let logs = [];
  let listeners = [];
  // debug はメモリのみ（localStorage 書き込み・購読者通知をしない）
  const PERSIST_LEVELS = { warn: true, error: true, info: true };

  function loadLogs() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.LOGS);
      if (saved) {
        logs = JSON.parse(saved);
        // 旧データが重い場合に削減
        if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
      }
    } catch (e) {
      logs = [];
    }
  }

  let _saveTimer = null;
  function saveLogs() {
    if (_saveTimer) return;
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      try {
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.LOGS, JSON.stringify(logs.slice(-MAX_LOGS)));
      } catch (e) { /* ignore */ }
    }, 1500);
  }

  function notify() {
    if (listeners.length === 0) return;
    const snapshot = logs.slice();
    listeners.forEach(fn => {
      try { fn(snapshot); } catch (e) { /* ignore */ }
    });
  }

  function addLog(level, message, data = null) {
    // debug はコンソールのみ（負荷低減）
    if (level === 'debug') {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug(`[DEBUG] ${message}`, data || '');
      }
      return null;
    }

    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    if (PERSIST_LEVELS[level]) saveLogs();
    // 購読者はログ画面だけ想定。毎回コピーを避けるため遅延通知
    if (listeners.length > 0) {
      if (!_saveTimer) {
        // save と別に軽く debounce
        setTimeout(notify, 300);
      }
    }

    const consoleFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : console.log;
    consoleFn(`[${level.toUpperCase()}] ${message}`, data || '');

    return entry;
  }

  loadLogs();

  return {
    debug: (msg, data) => addLog('debug', msg, data),
    info: (msg, data) => addLog('info', msg, data),
    warn: (msg, data) => addLog('warn', msg, data),
    error: (msg, data) => addLog('error', msg, data),
    getLogs: () => logs.slice(),
    clearLogs: () => { logs = []; saveLogs(); notify(); },
    subscribe: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter(l => l !== fn); }; },
  };
})();

})();
