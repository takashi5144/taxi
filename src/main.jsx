// main.jsx - エントリーポイント（TaxiApp名前空間登録 + アプリ起動）
(() => {
  // ============================================================
  // TaxiApp 名前空間にすべてのグローバルを整理
  // window.XXX は後方互換のために残すが、正規の参照先は TaxiApp
  // ============================================================
  const T = window.TaxiApp;

  // Utils
  T.utils.constants = APP_CONSTANTS;
  T.utils.logger = AppLogger;
  T.utils.storage = AppStorage;
  T.utils.dataService = DataService;
  T.utils.geminiService = GeminiService;

  // Contexts
  T.contexts.AppContext = AppContext;
  T.contexts.AppProvider = AppProvider;
  T.contexts.MapContext = MapContext;
  T.contexts.MapProvider = MapProvider;
  T.contexts.LogContext = LogContext;
  T.contexts.LogProvider = LogProvider;

  // Hooks
  T.hooks.useAppContext = useAppContext;
  T.hooks.useMapContext = useMapContext;
  T.hooks.useLogContext = useLogContext;
  T.hooks.useGeolocation = useGeolocation;
  T.hooks.useGoogleMaps = useGoogleMaps;
  T.hooks.useLogger = useLogger;

  // Components
  T.components.Loading = Loading;
  T.components.Card = Card;
  T.components.Button = Button;
  T.components.ErrorBoundary = ErrorBoundary;
  T.components.Header = Header;
  T.components.Sidebar = Sidebar;
  T.components.BottomNav = BottomNav;
  T.components.Layout = Layout;
  T.components.GoogleMapView = GoogleMapView;
  T.components.GpsTracker = GpsTracker;
  T.components.MapControls = MapControls;
  T.components.TrafficLegend = TrafficLegend;

  // Pages
  T.pages.Dashboard = DashboardPage;
  T.pages.MapView = MapViewPage;
  T.pages.Revenue = RevenuePage;
  T.pages.RivalRide = RivalRidePage;
  T.pages.TransitInfo = TransitInfoPage;
  T.pages.Events = EventsPage;
  T.pages.Analytics = AnalyticsPage;
  T.pages.Settings = SettingsPage;
  T.pages.DevTools = DevToolsPage;
  T.pages.Logs = LogsPage;
  T.pages.Structure = StructurePage;
  T.pages.ApiStatus = ApiStatusPage;

  // App
  T.App = App;

  // ============================================================
  // アプリケーション起動
  // ============================================================
  AppLogger.info('アプリケーション起動中...');
  AppLogger.info(`バージョン: ${APP_CONSTANTS.VERSION}`);
  AppLogger.info(`React バージョン: ${React.version}`);

  const root = ReactDOM.createRoot(document.getElementById('root'));

  root.render(
    React.createElement(ErrorBoundary, null,
      React.createElement(AppProvider, null,
        React.createElement(MapProvider, null,
          React.createElement(LogProvider, null,
            React.createElement(App)
          )
        )
      )
    )
  );

  AppLogger.info('アプリケーション起動完了');
  AppLogger.info(`登録済みコンポーネント: ${Object.keys(T.components).length}個, ページ: ${Object.keys(T.pages).length}個`);
})();
