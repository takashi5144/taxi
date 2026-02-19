// logger.js - アプリケーションロガー
window.AppLogger = (() => {
  const MAX_LOGS = 500;
  let logs = [];
  let listeners = [];

  function loadLogs() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.LOGS);
      if (saved) logs = JSON.parse(saved);
    } catch (e) {
      logs = [];
    }
  }

  function saveLogs() {
    try {
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.LOGS, JSON.stringify(logs.slice(-MAX_LOGS)));
    } catch (e) { /* ignore */ }
  }

  function notify() {
    listeners.forEach(fn => fn([...logs]));
  }

  function addLog(level, message, data = null) {
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    saveLogs();
    notify();

    // コンソールにも出力
    const consoleFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
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
    getLogs: () => [...logs],
    clearLogs: () => { logs = []; saveLogs(); notify(); },
    subscribe: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter(l => l !== fn); }; },
  };
})();
