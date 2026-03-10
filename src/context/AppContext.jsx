(function() {
// AppContext.jsx - アプリ全体の状態管理（ハッシュルーティング対応）
const { createContext, useState, useEffect, useCallback, useContext } = React;

window.AppContext = createContext(null);

// ハッシュからページ名を取得するヘルパー
function getPageFromHash() {
  const hash = window.location.hash.replace('#/', '').replace('#', '');
  const validRoutes = Object.values(APP_CONSTANTS.ROUTES);
  return validRoutes.includes(hash) ? hash : APP_CONSTANTS.ROUTES.DASHBOARD;
}

window.AppProvider = ({ children }) => {
  const [currentPage, setCurrentPage] = useState(getPageFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiKey, setApiKeyState] = useState(AppStorage.getApiKey());
  const [geminiApiKey, setGeminiApiKeyState] = useState(AppStorage.getGeminiApiKey());

  const setApiKey = useCallback((key) => {
    AppStorage.setApiKey(key);
    setApiKeyState(key);
    AppLogger.info('Google Maps APIキーが更新されました');
  }, []);

  const setGeminiApiKey = useCallback((key) => {
    AppStorage.setGeminiApiKey(key);
    setGeminiApiKeyState(key);
    AppLogger.info('Gemini APIキーが更新されました');
  }, []);

  // ページ遷移（ハッシュを更新 → hashchangeで状態も更新）
  const navigate = useCallback((page) => {
    window.location.hash = `#/${page}`;
    setSidebarOpen(false);
    AppLogger.debug(`ページ遷移: ${page}`);
  }, []);

  // ブラウザの戻る/進むボタン対応
  useEffect(() => {
    const handleHashChange = () => {
      const page = getPageFromHash();
      setCurrentPage(page);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 初期ハッシュが空の場合にセット
  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = `#/${APP_CONSTANTS.ROUTES.DASHBOARD}`;
    }
  }, []);

  // ── 自動同期（SYNC_SECRET設定時のみ） ──
  useEffect(() => {
    const secret = (localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET) || '').trim();
    if (!secret) return;

    // A. アプリ起動時に自動同期
    DataService.autoSync();

    // B. ページ復帰時（タブ切替から戻った時）に自動同期（最低30秒の間隔を空ける）
    let lastSyncTime = Date.now();
    const MIN_SYNC_INTERVAL = 30 * 1000;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastSyncTime >= MIN_SYNC_INTERVAL) {
          lastSyncTime = now;
          DataService.autoSync();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // C. 5分間隔の定期同期
    const intervalId = setInterval(() => {
      lastSyncTime = Date.now();
      DataService.autoSync();
    }, 5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(intervalId);
    };
  }, []);


  // ── 需要通知サービス ──
  useEffect(() => {
    DemandNotificationService.start();
    return () => DemandNotificationService.stop();
  }, []);

  const value = {
    currentPage,
    navigate,
    sidebarOpen,
    setSidebarOpen,
    apiKey,
    setApiKey,
    geminiApiKey,
    setGeminiApiKey,
  };

  return React.createElement(AppContext.Provider, { value }, children);
};

window.useAppContext = () => useContext(AppContext);

})();
