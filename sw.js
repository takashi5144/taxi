// sw.js - Service Worker（オフラインキャッシュ対応）
// アプリはindex.html単体で動作するため、キャッシュ対象は最小限に絞る
const CACHE_NAME = 'taxi-support-v1.0.5';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// CDNリソース（ネットワーク優先、キャッシュフォールバック）
const CDN_ASSETS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
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

  // API呼び出しはキャッシュしない
  if (request.url.includes('/api/')) {
    return;
  }

  // Gemini API はキャッシュしない
  if (request.url.includes('generativelanguage.googleapis.com')) {
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
