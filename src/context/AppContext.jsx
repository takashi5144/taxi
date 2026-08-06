(function() {
// AppContext.jsx - アプリ全体の状態管理（ハッシュルーティング対応）
const { createContext, useState, useEffect, useCallback, useContext } = React;

window.AppContext = createContext(null);

function getPageFromHash() {
  const hash = window.location.hash.replace('#/', '').replace('#', '');
  const validRoutes = Object.values(APP_CONSTANTS.ROUTES);
  return validRoutes.includes(hash) ? hash : APP_CONSTANTS.ROUTES.DASHBOARD;
}

window.AppProvider = ({ children }) => {
  const [currentPage, setCurrentPage] = useState(getPageFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = useCallback((page) => {
    // 廃止ルートはダッシュボードへ
    if (page === 'map' || page === 'transit-info') page = APP_CONSTANTS.ROUTES.DASHBOARD;
    window.location.hash = `#/${page}`;
    setSidebarOpen(false);
    AppLogger.debug(`ページ遷移: ${page}`);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      let page = getPageFromHash();
      if (page === 'map' || page === 'transit-info') {
        window.location.hash = `#/${APP_CONSTANTS.ROUTES.DASHBOARD}`;
        page = APP_CONSTANTS.ROUTES.DASHBOARD;
      }
      setCurrentPage(page);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = `#/${APP_CONSTANTS.ROUTES.DASHBOARD}`;
    } else {
      const page = getPageFromHash();
      if (page === 'map' || page === 'transit-info') {
        window.location.hash = `#/${APP_CONSTANTS.ROUTES.DASHBOARD}`;
      }
    }
  }, []);

  // クラウド同期は起動直後ではなく少し遅らせて UI を優先
  useEffect(() => {
    const secret = (localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET) || '').trim();
    if (!secret) return;
    const t = setTimeout(() => {
      try { DataService.autoSync(); } catch (e) { /* ignore */ }
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  const value = {
    currentPage,
    navigate,
    sidebarOpen,
    setSidebarOpen,
  };

  return React.createElement(AppContext.Provider, { value }, children);
};

window.useAppContext = () => useContext(AppContext);

})();
