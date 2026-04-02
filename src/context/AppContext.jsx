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
  const [apiKeyRaw, setApiKeyState] = useState(AppStorage.getApiKey());
  const [apiKeyEnabled, setApiKeyEnabledState] = useState(() => localStorage.getItem('taxi_api_key_enabled') === 'true');
  const [geminiApiKey, setGeminiApiKeyState] = useState(AppStorage.getGeminiApiKey());

  // APIキーが有効な場合のみ返す（オフの場合は空文字）
  const apiKey = apiKeyEnabled ? apiKeyRaw : '';

  const setApiKey = useCallback((key) => {
    AppStorage.setApiKey(key);
    setApiKeyState(key);
    AppLogger.info('Google Maps APIキーが更新されました');
  }, []);

  const setApiKeyEnabled = useCallback((enabled) => {
    setApiKeyEnabledState(enabled);
    localStorage.setItem('taxi_api_key_enabled', enabled ? 'true' : 'false');
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

  // ── クラウド同期（起動時の1回のみ。通信量削減のためポーリング・タブ復帰同期は無効） ──
  useEffect(() => {
    const secret = (localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET) || '').trim();
    if (!secret) return;
    DataService.autoSync();
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
    apiKeyEnabled,
    setApiKeyEnabled,
    geminiApiKey,
    setGeminiApiKey,
  };

  return React.createElement(AppContext.Provider, { value }, children);
};

window.useAppContext = () => useContext(AppContext);

})();
