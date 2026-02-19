// App.jsx - ルートコンポーネント（ハッシュルーティング対応）
window.App = () => {
  const { currentPage, navigate } = useAppContext();

  // レガシー: カスタムイベントでのナビゲーション対応（後方互換性）
  React.useEffect(() => {
    const handler = (e) => navigate(e.detail);
    document.addEventListener('navigate', handler);
    return () => document.removeEventListener('navigate', handler);
  }, [navigate]);

  // ページルーティング（useMemoで不要な再生成を防止）
  const page = React.useMemo(() => {
    switch (currentPage) {
      case 'dashboard': return React.createElement(DashboardPage);
      case 'map': return React.createElement(MapViewPage);
      case 'revenue': return React.createElement(RevenuePage);
      case 'analytics': return React.createElement(AnalyticsPage);
      case 'settings': return React.createElement(SettingsPage);
      case 'dev': return React.createElement(DevToolsPage);
      case 'dev-logs': return React.createElement(LogsPage);
      case 'dev-structure': return React.createElement(StructurePage);
      case 'dev-api': return React.createElement(ApiStatusPage);
      default: return React.createElement(DashboardPage);
    }
  }, [currentPage]);

  return React.createElement(Layout, null, page);
};
