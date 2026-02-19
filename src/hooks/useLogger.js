// useLogger.js - ロギング用カスタムフック
//
// AppLogger をReactコンポーネントから便利に使うためのフック。
// コンポーネント名を自動的にプレフィックスとして付加する。

window.useLogger = (componentName = '') => {
  const { useCallback, useMemo } = React;

  const prefix = componentName ? `[${componentName}] ` : '';

  const logger = useMemo(() => ({
    debug: (msg, data) => AppLogger.debug(`${prefix}${msg}`, data),
    info: (msg, data) => AppLogger.info(`${prefix}${msg}`, data),
    warn: (msg, data) => AppLogger.warn(`${prefix}${msg}`, data),
    error: (msg, data) => AppLogger.error(`${prefix}${msg}`, data),
  }), [prefix]);

  // コンポーネントのマウント/アンマウントをログ
  const logMount = useCallback(() => {
    if (componentName) {
      AppLogger.debug(`${prefix}マウント`);
    }
  }, [prefix, componentName]);

  const logUnmount = useCallback(() => {
    if (componentName) {
      AppLogger.debug(`${prefix}アンマウント`);
    }
  }, [prefix, componentName]);

  return {
    ...logger,
    logMount,
    logUnmount,
    getLogs: AppLogger.getLogs,
    clearLogs: AppLogger.clearLogs,
    subscribe: AppLogger.subscribe,
  };
};
