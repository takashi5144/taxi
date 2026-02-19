// sw.js - Service Worker（オフラインキャッシュ対応）
const CACHE_NAME = 'taxi-support-v0.6.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './src/styles/variables.css',
  './src/styles/global.css',
  './src/styles/responsive.css',
  './src/utils/constants.js',
  './src/utils/logger.js',
  './src/utils/storage.js',
  './src/context/LogContext.jsx',
  './src/context/MapContext.jsx',
  './src/context/AppContext.jsx',
  './src/hooks/useGeolocation.js',
  './src/hooks/useGoogleMaps.js',
  './src/hooks/useLogger.js',
  './src/components/common/Loading.jsx',
  './src/components/common/Card.jsx',
  './src/components/common/Button.jsx',
  './src/components/Map/GoogleMap.jsx',
  './src/components/Map/GpsTracker.jsx',
  './src/components/Map/MapControls.jsx',
  './src/components/Layout/Header.jsx',
  './src/components/Layout/Sidebar.jsx',
  './src/components/Layout/BottomNav.jsx',
  './src/components/Layout/Layout.jsx',
  './src/pages/Dashboard.jsx',
  './src/pages/MapView.jsx',
  './src/pages/Revenue.jsx',
  './src/pages/RivalRide.jsx',
  './src/pages/Analytics.jsx',
  './src/pages/Settings.jsx',
  './src/pages/dev/Logs.jsx',
  './src/pages/dev/Structure.jsx',
  './src/pages/dev/ApiStatus.jsx',
  './src/pages/dev/DevTools.jsx',
  './src/App.jsx',
  './src/main.jsx',
];

// CDNリソース（ネットワーク優先、キャッシュフォールバック）
const CDN_ASSETS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
];

// インストール: 静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 静的アセットをキャッシュ中...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] 一部のアセットのキャッシュに失敗:', err);
      });
    })
  );
  self.skipWaiting();
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] 古いキャッシュを削除:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// フェッチ: ネットワーク優先、フォールバックでキャッシュ
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Google Maps API はキャッシュしない
  if (request.url.includes('maps.googleapis.com') || request.url.includes('maps.gstatic.com')) {
    return;
  }

  // Google Drive / OAuth はキャッシュしない
  if (request.url.includes('googleapis.com/drive') ||
      request.url.includes('googleapis.com/upload') ||
      request.url.includes('googleapis.com/oauth2') ||
      request.url.includes('accounts.google.com')) {
    return;
  }

  // API呼び出しはキャッシュしない
  if (request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 正常なレスポンスをキャッシュに保存
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // ネットワークエラー時はキャッシュから返す
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // HTMLリクエストの場合はindex.htmlを返す（SPA対応）
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('オフラインです', { status: 503 });
        });
      })
  );
});
