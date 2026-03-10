(function() {
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
  // 各ページをErrorBoundaryで包み、1ページのエラーがアプリ全体に影響しないようにする
  const page = React.useMemo(() => {
    let pageComponent;
    switch (currentPage) {
      case 'dashboard': pageComponent = React.createElement(DashboardPage); break;
      case 'map': pageComponent = React.createElement(MapViewPage); break;
      case 'revenue': pageComponent = React.createElement(RevenuePage); break;
      case 'rival-ride': pageComponent = React.createElement(RivalRidePage); break;
      case 'transit-info': pageComponent = React.createElement(TransitInfoPage); break;
      case 'events': pageComponent = React.createElement(EventsPage); break;
      case 'analytics': pageComponent = React.createElement(AnalyticsPage); break;
      case 'gathering-memo': pageComponent = React.createElement(GatheringMemoPage); break;
      case 'calendar': pageComponent = React.createElement(CalendarPage); break;
      case 'info': pageComponent = React.createElement(InfoPage); break;
      case 'data-manage': pageComponent = React.createElement(DataManagePage); break;
      case 'settings': pageComponent = React.createElement(SettingsPage); break;
      case 'dev': pageComponent = React.createElement(DevToolsPage); break;
      case 'dev-logs': pageComponent = React.createElement(LogsPage); break;
      case 'dev-structure': pageComponent = React.createElement(StructurePage); break;
      case 'dev-api': pageComponent = React.createElement(ApiStatusPage); break;
      default: pageComponent = React.createElement(DashboardPage); break;
    }
    return React.createElement(ErrorBoundary, { key: currentPage }, pageComponent);
  }, [currentPage]);

  return React.createElement(Layout, null, page);
};

})();
