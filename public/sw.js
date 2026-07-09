// sw.js - Service Worker�E�オフラインキャチE��ュ対応！E
// アプリはindex.html単体で動作するため、キャチE��ュ対象は最小限に絞る
const CACHE_NAME = 'taxi-support-v3.83.4-no-gps-settings';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// CDNリソース�E�ネチE��ワーク優先、キャチE��ュフォールバック�E�E
const CDN_ASSETS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
];

// インスト�Eル: 静的アセチE��をキャチE��ュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// キャチE��ュエントリの最大有効期間�E�E0日�E�E
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_TIMESTAMP_HEADER = 'sw-cache-timestamp';

// 古ぁE��ャチE��ュエントリを削除�E�E0日趁E��刁E��E
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

// アクチE��ベ�EチE 古ぁE��ャチE��ュを削除
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

// フェチE��: ネットワーク優先、フォールバックでキャチE��ュ
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Google Maps API はキャチE��ュしなぁE
  if (request.url.includes('maps.googleapis.com') || request.url.includes('maps.gstatic.com')) {
    return;
  }

  // API呼び出し�EキャチE��ュしなぁE
  if (request.url.includes('/api/')) {
    return;
  }

  // Gemini API はキャチE��ュしなぁE
  if (request.url.includes('generativelanguage.googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 正常なレスポンスをキャチE��ュに保存（タイムスタンプ付き�E�E
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
        // ネットワークエラー時�EキャチE��ュから返す
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // HTMLリクエスト�E場合�Eindex.htmlを返す�E�EPA対応！E
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('オフラインでぁE, { status: 503 });
        });
      })
  );
});
