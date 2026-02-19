// constants.js - アプリケーション定数
//
// TaxiApp 名前空間を定義。全コンポーネント・フック・コンテキストは
// この名前空間に登録される。window直接割り当ては後方互換のためのエイリアス。
window.TaxiApp = window.TaxiApp || {
  components: {},  // UIコンポーネント
  pages: {},       // ページコンポーネント
  hooks: {},       // カスタムフック
  contexts: {},    // React Context
  utils: {},       // ユーティリティ
};

window.APP_CONSTANTS = {
  APP_NAME: 'タクシー売上サポート',
  VERSION: '0.4.0',

  // デフォルト地図設定（東京駅）
  DEFAULT_MAP_CENTER: { lat: 35.6812, lng: 139.7671 },
  DEFAULT_MAP_ZOOM: 15,

  // GPS設定
  GPS_OPTIONS: {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
  },

  // ルート定義
  ROUTES: {
    DASHBOARD: 'dashboard',
    MAP: 'map',
    REVENUE: 'revenue',
    RIVAL_RIDE: 'rival-ride',
    ANALYTICS: 'analytics',
    SETTINGS: 'settings',
    DEV_TOOLS: 'dev',
    DEV_LOGS: 'dev-logs',
    DEV_STRUCTURE: 'dev-structure',
    DEV_API: 'dev-api',
  },

  // ナビゲーション項目
  NAV_ITEMS: [
    { id: 'dashboard', label: 'ダッシュボード', icon: 'dashboard' },
    { id: 'map', label: '地図', icon: 'map' },
    { id: 'revenue', label: '売上記録', icon: 'receipt_long' },
    { id: 'rival-ride', label: '他社乗車', icon: 'local_taxi' },
    { id: 'analytics', label: '分析', icon: 'analytics' },
    { id: 'settings', label: '設定', icon: 'settings' },
  ],

  // ボトムナビ項目
  BOTTOM_NAV_ITEMS: [
    { id: 'dashboard', label: 'ホーム', icon: 'home' },
    { id: 'map', label: '地図', icon: 'map' },
    { id: 'revenue', label: '売上', icon: 'receipt_long' },
    { id: 'rival-ride', label: '他社', icon: 'local_taxi' },
    { id: 'analytics', label: '分析', icon: 'analytics' },
    { id: 'settings', label: '設定', icon: 'more_horiz' },
  ],

  // ログレベル
  LOG_LEVELS: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
  },

  // localStorage キー
  STORAGE_KEYS: {
    API_KEY: 'taxi_app_google_maps_api_key',
    LOGS: 'taxi_app_logs',
    SETTINGS: 'taxi_app_settings',
    REVENUE_DATA: 'taxi_app_revenue',
    RIVAL_RIDES: 'taxi_app_rival_rides',
  },

  // サイト構造（開発者ツール用）
  SITE_STRUCTURE: {
    name: 'taxi-sales-support/',
    type: 'folder',
    children: [
      {
        name: 'src/',
        type: 'folder',
        children: [
          { name: 'main.jsx', type: 'react', desc: 'エントリーポイント' },
          { name: 'App.jsx', type: 'react', desc: 'ルートコンポーネント・ルーティング' },
          {
            name: 'components/',
            type: 'folder',
            children: [
              {
                name: 'Layout/',
                type: 'folder',
                children: [
                  { name: 'Header.jsx', type: 'react', desc: 'ヘッダーナビゲーション' },
                  { name: 'Sidebar.jsx', type: 'react', desc: 'PC用サイドバー' },
                  { name: 'BottomNav.jsx', type: 'react', desc: 'モバイル用ボトムナビ' },
                  { name: 'Layout.jsx', type: 'react', desc: 'レイアウトラッパー' },
                ],
              },
              {
                name: 'Map/',
                type: 'folder',
                children: [
                  { name: 'GoogleMap.jsx', type: 'react', desc: 'Google Maps本体' },
                  { name: 'GpsTracker.jsx', type: 'react', desc: 'GPS追跡パネル' },
                  { name: 'MapControls.jsx', type: 'react', desc: '地図操作コントロール' },
                ],
              },
              {
                name: 'common/',
                type: 'folder',
                children: [
                  { name: 'Button.jsx', type: 'react', desc: '汎用ボタン' },
                  { name: 'Card.jsx', type: 'react', desc: '汎用カード' },
                  { name: 'Loading.jsx', type: 'react', desc: 'ローディング表示' },
                  { name: 'ErrorBoundary.jsx', type: 'react', desc: 'エラーバウンダリ' },
                ],
              },
            ],
          },
          {
            name: 'pages/',
            type: 'folder',
            children: [
              { name: 'Dashboard.jsx', type: 'react', desc: 'ダッシュボード' },
              { name: 'MapView.jsx', type: 'react', desc: '地図ページ' },
              { name: 'Revenue.jsx', type: 'react', desc: '売上記録' },
              { name: 'Analytics.jsx', type: 'react', desc: '売上分析' },
              { name: 'Settings.jsx', type: 'react', desc: 'アプリ設定' },
              {
                name: 'dev/',
                type: 'folder',
                children: [
                  { name: 'DevTools.jsx', type: 'react', desc: '開発者ツールハブ' },
                  { name: 'Structure.jsx', type: 'react', desc: 'サイト構造ビューア' },
                  { name: 'Logs.jsx', type: 'react', desc: 'ログビューア' },
                  { name: 'ApiStatus.jsx', type: 'react', desc: 'API接続状態' },
                ],
              },
            ],
          },
          {
            name: 'context/',
            type: 'folder',
            children: [
              { name: 'AppContext.jsx', type: 'react', desc: 'グローバル状態管理' },
              { name: 'MapContext.jsx', type: 'react', desc: '地図状態管理' },
              { name: 'LogContext.jsx', type: 'react', desc: 'ログ管理' },
            ],
          },
          {
            name: 'hooks/',
            type: 'folder',
            children: [
              { name: 'useGeolocation.js', type: 'js', desc: 'GPS位置情報フック' },
              { name: 'useGoogleMaps.js', type: 'js', desc: 'Google Maps読み込みフック' },
              { name: 'useLogger.js', type: 'js', desc: 'ロガーフック' },
            ],
          },
          {
            name: 'utils/',
            type: 'folder',
            children: [
              { name: 'constants.js', type: 'js', desc: '定数定義・TaxiApp名前空間' },
              { name: 'logger.js', type: 'js', desc: 'ロガーユーティリティ' },
              { name: 'storage.js', type: 'js', desc: 'localStorage管理' },
              { name: 'dataService.js', type: 'js', desc: '売上データ処理・分析・CSV出力' },
            ],
          },
          {
            name: 'styles/',
            type: 'folder',
            children: [
              { name: 'variables.css', type: 'css', desc: 'CSS変数' },
              { name: 'global.css', type: 'css', desc: 'グローバルスタイル' },
              { name: 'responsive.css', type: 'css', desc: 'レスポンシブ対応' },
            ],
          },
        ],
      },
      {
        name: 'docs/',
        type: 'folder',
        children: [
          { name: 'ARCHITECTURE.md', type: 'md', desc: 'アーキテクチャ設計書' },
          { name: 'CHANGELOG.md', type: 'md', desc: '変更履歴' },
          { name: 'DEV_LOG.md', type: 'md', desc: '開発ログ' },
        ],
      },
      {
        name: 'public/',
        type: 'folder',
        children: [
          { name: 'manifest.json', type: 'file', desc: 'PWAマニフェスト' },
          { name: 'sw.js', type: 'js', desc: 'Service Worker（コピー元）' },
        ],
      },
      { name: 'index.html', type: 'html', desc: 'エントリーHTML' },
      { name: 'sw.js', type: 'js', desc: 'Service Worker（ルート配置）' },
      { name: 'package.json', type: 'file', desc: 'プロジェクト情報' },
    ],
  },
};
