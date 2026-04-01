(function() {
// ワンタイム: 4月2日の売上データを4月1日に移行（日付またぎ対応）
(function migrateApril2ToApril1() {
  const MIGRATION_KEY = 'taxi_migration_apr2_to_apr1_done';
  if (localStorage.getItem(MIGRATION_KEY)) return;
  try {
    const entries = JSON.parse(localStorage.getItem('taxi_app_revenue') || '[]');
    let changed = false;
    entries.forEach(e => {
      if (e.date === '2026-04-02') {
        e.date = '2026-04-01';
        if (window.JapaneseHolidays) {
          const info = JapaneseHolidays.getDateInfo('2026-04-01');
          e.dayOfWeek = info.dayOfWeek;
          e.holiday = info.holiday || '';
        }
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem('taxi_app_revenue', JSON.stringify(entries));
      if (window.AppLogger) AppLogger.info('4月2日の売上を4月1日に移行しました');
    }
    localStorage.setItem(MIGRATION_KEY, '1');
  } catch (e) { /* ignore */ }
})();

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
