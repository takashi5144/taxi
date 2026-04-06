// sw.js - Service Worker（オフラインキャッシュ対応）
// アプリはindex.html単体で動作するため、キャッシュ対象は最小限に絞る
const CACHE_NAME = 'taxi-support-v3.71.0';
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
];

// インストール: 静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// キャッシュエントリの最大有効期間（30日）
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_TIMESTAMP_HEADER = 'sw-cache-timestamp';

// 古いキャッシュエントリを削除（30日超過分）
async function cleanExpiredCacheEntries() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  const now = Date.now();
  for (const request of requests) {
    const response = await cache.match(request);
    if (response) {
      const cachedTime = response.headers.get(CACHE_TIMESTAMP_HEADER);
      if (cachedTime && (now - Number(cachedTime)) > CACHE_MAX_AGE_MS) {
        await cache.delete(request);
      }
    }
  }
}

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => cleanExpiredCacheEntries())
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
        // 正常なレスポンスをキャッシュに保存（タイムスタンプ付き）
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(async (cache) => {
            const body = await clone.arrayBuffer();
            const headers = new Headers(clone.headers);
            headers.set(CACHE_TIMESTAMP_HEADER, String(Date.now()));
            const timestampedResponse = new Response(body, {
              status: clone.status,
              statusText: clone.statusText,
              headers: headers,
            });
            cache.put(request, timestampedResponse);
          });
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
