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
