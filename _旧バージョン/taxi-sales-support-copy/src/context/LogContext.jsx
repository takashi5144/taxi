// LogContext.jsx - ログ状態管理
const { createContext, useState, useEffect, useContext } = React;

window.LogContext = createContext(null);

window.LogProvider = ({ children }) => {
  const [logs, setLogs] = useState(AppLogger.getLogs());

  useEffect(() => {
    const unsub = AppLogger.subscribe(setLogs);
    return unsub;
  }, []);

  const value = {
    logs,
    addLog: AppLogger.info,
    addDebug: AppLogger.debug,
    addWarn: AppLogger.warn,
    addError: AppLogger.error,
    clearLogs: AppLogger.clearLogs,
  };

  return React.createElement(LogContext.Provider, { value }, children);
};

window.useLogContext = () => useContext(LogContext);
