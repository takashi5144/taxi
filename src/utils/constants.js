(function() {
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

// 共通ユーティリティ（各ページから参照）
window.TaxiApp.utils.getNowTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
};

// WMO天気コードを天候カテゴリに変換（共通ユーティリティ）
window.TaxiApp.utils.wmoToWeather = (code, fallback = '曇り') => {
  if (code === undefined || code === null) return fallback;
  if (code <= 1) return '晴れ';
  if (code <= 3 || code === 45 || code === 48) return '曇り';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95 || code === 96 || code === 99) return '雨';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '雪';
  return fallback;
};

window.TaxiApp.utils.nominatimUrl = (lat, lng, zoom = 18) => {
  const params = new URLSearchParams({ format: 'json', lat: String(lat), lon: String(lng), zoom: String(zoom), addressdetails: '1', 'accept-language': 'ja' });
  return `https://nominatim.openstreetmap.org/reverse?${params}`;
};

// Geocoding結果から簡潔な住所を抽出（共通ユーティリティ）
window.TaxiApp.utils.formatAddress = (result) => {
  const comps = result.address_components;
  let prefecture = '', city = '', ward = '', town = '', sublocality = '';
  for (const c of comps) {
    if (c.types.includes('administrative_area_level_1')) prefecture = c.long_name;
    if (c.types.includes('locality')) city = c.long_name;
    if (c.types.includes('sublocality_level_1') || c.types.includes('ward')) ward = c.long_name;
    if (c.types.includes('sublocality_level_2')) town = c.long_name;
    if (c.types.includes('sublocality_level_3')) sublocality = c.long_name;
  }
  const parts = [ward || city || prefecture, town, sublocality].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return result.formatted_address.replace(/、日本$/, '').replace(/^日本、/, '');
};

// 2点間の距離(m)を計算 (Haversine)
window.TaxiApp.utils.haversineDistance = (lat1, lng1, lat2, lng2) => {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return Infinity;
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Google Geocoder結果から、クエリ座標に近い最適な結果を選択
window.TaxiApp.utils.pickBestGeocoderResult = (results, queryLat, queryLng) => {
  const dist = TaxiApp.utils.haversineDistance;
  const MAX_DIST = 300; // 300m以内の結果のみ対象

  // 各結果に距離を付与（locationがないものは除外）
  const withDist = results
    .filter(r => r.geometry && r.geometry.location)
    .map(r => {
      const loc = r.geometry.location;
      const rLat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
      const rLng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
      return { result: r, distance: dist(queryLat, queryLng, rLat, rLng) };
    });
  if (withDist.length === 0) return results[0]; // フォールバック

  // 近い結果のみ (300m以内)
  const nearby = withDist.filter(w => w.distance <= MAX_DIST);

  // 近い結果がなければ最も近い結果を返す
  if (nearby.length === 0) {
    withDist.sort((a, b) => a.distance - b.distance);
    return withDist[0].result;
  }

  // 近い結果内でタイプ優先選択
  const typePriority = ['street_address', 'premise', 'sublocality_level_3', 'sublocality_level_2', 'route'];
  for (const t of typePriority) {
    const match = nearby.find(w => w.result.types.includes(t));
    if (match) return match.result;
  }

  // タイプ一致なしなら最も近い結果
  nearby.sort((a, b) => a.distance - b.distance);
  return nearby[0].result;
};

window.TaxiApp.utils.extractAddress = (result) => {
  const comps = result.address_components;
  let prefecture = '', city = '', ward = '', town = '', sublocality = '', chome = '', banchi = '', route = '';
  for (const c of comps) {
    if (c.types.includes('administrative_area_level_1')) prefecture = c.long_name;
    if (c.types.includes('locality')) city = c.long_name;
    if (c.types.includes('sublocality_level_1') || c.types.includes('ward')) ward = c.long_name;
    if (c.types.includes('sublocality_level_2')) town = c.long_name;
    if (c.types.includes('sublocality_level_3')) sublocality = c.long_name;
    if (c.types.includes('sublocality_level_4')) chome = c.long_name;
    if (c.types.includes('premise')) banchi = c.long_name;
    if (c.types.includes('route')) route = c.long_name;
  }
  const area = ward || city || prefecture;
  const detail = [town, sublocality, chome, banchi].filter(Boolean).join('');
  if (area && detail) return area + ' ' + detail;
  if (area && route) return area + ' ' + route;
  if (area) return area;
  return result.formatted_address
    .replace(/〒\d{3}-?\d{4}\s*/, '')
    .replace(/、日本$/, '').replace(/^日本、\s*/, '')
    .replace(/^日本\s*/, '');
};

// 場所名エイリアス適用: 住所文字列に含まれるキーワードを置換
window.TaxiApp.utils.applyPlaceAlias = (address) => {
  if (!address) return address;
  const aliases = APP_CONSTANTS.PLACE_ALIASES;
  for (const [keyword, replacement] of Object.entries(aliases)) {
    if (address.includes(keyword)) return replacement;
  }
  return address;
};

// 座標ベースの既知場所マッチング（最優先）
// KNOWN_PLACESに登録された座標のradius以内なら即座にその名称を返す
window.TaxiApp.utils.matchKnownPlace = (lat, lng) => {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
  const places = APP_CONSTANTS.KNOWN_PLACES;
  if (!places || places.length === 0) return null;
  const dist = TaxiApp.utils.haversineDistance;
  let best = null;
  let bestDist = Infinity;
  for (const place of places) {
    const d = dist(lat, lng, place.lat, place.lng);
    if (d <= place.radius && d < bestDist) {
      best = place.name;
      bestDist = d;
    }
  }
  return best;
};

// GPS座標から近くのランドマーク名を取得（Places API + Nominatimフォールバック）
window.TaxiApp.utils.findNearbyLandmark = (() => {
  const cache = {};
  const CACHE_KEY = 'taxi_landmark_cache';
  const MAX_CACHE = 500;
  let diskCache = null;
  // APIレート制限
  let _lastPlacesCall = 0;
  let _lastNominatimCall = 0;
  const PLACES_MIN_INTERVAL = 2000;    // Places API: 2秒間隔
  const NOMINATIM_MIN_INTERVAL = 1100; // Nominatim: 1.1秒間隔（利用規約準拠）

  function _loadDiskCache() {
    if (diskCache) return diskCache;
    try { diskCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { diskCache = {}; }
    return diskCache;
  }
  function _saveDiskCache(c) {
    const keys = Object.keys(c);
    if (keys.length > MAX_CACHE) keys.slice(0, keys.length - MAX_CACHE).forEach(k => delete c[k]);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
  }

  // Places APIで検索する施設タイプ（優先度順）
  const POI_TYPES = [
    'train_station', 'bus_station', 'subway_station',
    'hospital', 'doctor', 'pharmacy',
    'local_government_office', 'city_hall', 'courthouse', 'police', 'fire_station', 'post_office',
    'school', 'university', 'library',
    'tourist_attraction', 'museum', 'park', 'amusement_park', 'zoo', 'aquarium',
    'shopping_mall', 'department_store', 'supermarket',
    'hotel', 'lodging',
    'restaurant', 'cafe',
    'bank',
    'gas_station', 'car_repair',
    'convenience_store',
    'store',
  ];

  // 距離(m)に応じた適格判定
  function isEligible(place, distM) {
    const t = place.types || [];
    // 駅・病院・役所・観光地: 200m以内
    if (t.some(x => ['train_station','bus_station','subway_station','hospital','local_government_office','city_hall','tourist_attraction','museum','park','amusement_park','zoo','aquarium','university'].includes(x))) {
      return distM <= 200;
    }
    // その他の施設: 100m以内
    return distM <= 100;
  }

  // Places APIで近くの施設を検索
  function _searchPlaces(lat, lng) {
    return new Promise((resolve) => {
      if (!window.google || !google.maps || !google.maps.places) {
        resolve(null);
        return;
      }
      // レート制限チェック
      const now = Date.now();
      if (now - _lastPlacesCall < PLACES_MIN_INTERVAL) {
        resolve(null);
        return;
      }
      _lastPlacesCall = now;
      // PlacesServiceにはmap要素かdiv要素が必要
      let attrDiv = document.getElementById('places-attr');
      if (!attrDiv) {
        attrDiv = document.createElement('div');
        attrDiv.id = 'places-attr';
        attrDiv.style.display = 'none';
        document.body.appendChild(attrDiv);
      }
      const service = new google.maps.places.PlacesService(attrDiv);
      const location = new google.maps.LatLng(lat, lng);
      const dist = TaxiApp.utils.haversineDistance;

      service.nearbySearch({
        location,
        rankBy: google.maps.places.RankBy.DISTANCE,
        type: POI_TYPES[0], // typeは1つのみ指定可能、まず駅を試す
      }, (results, status) => {
        // 全タイプを一括でkeyword検索（typeフィルタなし）
        service.nearbySearch({
          location,
          radius: 200,
          language: 'ja',
        }, (allResults, allStatus) => {
          const candidates = [];
          if (allStatus === 'OK' && allResults) {
            allResults.forEach(p => {
              if (!p.name || !p.geometry || !p.geometry.location) return;
              const pLat = typeof p.geometry.location.lat === 'function' ? p.geometry.location.lat() : p.geometry.location.lat;
              const pLng = typeof p.geometry.location.lng === 'function' ? p.geometry.location.lng() : p.geometry.location.lng;
              const d = dist(lat, lng, pLat, pLng);
              if (isEligible(p, d)) {
                // 優先度スコア: タイプの優先順位
                const typeScore = Math.min(...(p.types || []).map(t => { const idx = POI_TYPES.indexOf(t); return idx >= 0 ? idx : 999; }));
                candidates.push({ name: p.name, distance: d, typeScore, types: p.types });
              }
            });
          }
          if (results && status === 'OK') {
            results.forEach(p => {
              if (!p.name || !p.geometry || !p.geometry.location) return;
              const pLat = typeof p.geometry.location.lat === 'function' ? p.geometry.location.lat() : p.geometry.location.lat;
              const pLng = typeof p.geometry.location.lng === 'function' ? p.geometry.location.lng() : p.geometry.location.lng;
              const d = dist(lat, lng, pLat, pLng);
              if (isEligible(p, d) && !candidates.find(c => c.name === p.name)) {
                const typeScore = Math.min(...(p.types || []).map(t => { const idx = POI_TYPES.indexOf(t); return idx >= 0 ? idx : 999; }));
                candidates.push({ name: p.name, distance: d, typeScore, types: p.types });
              }
            });
          }

          if (candidates.length === 0) { resolve(null); return; }

          // 優先度スコア→距離でソート
          candidates.sort((a, b) => a.typeScore - b.typeScore || a.distance - b.distance);
          resolve(candidates[0].name);
        });
      });
    });
  }

  // Nominatimで近くのPOI名を取得（フォールバック）
  async function _searchNominatim(lat, lng) {
    try {
      // レート制限チェック（Nominatim利用規約: 1秒あたり1リクエストまで）
      const now = Date.now();
      if (now - _lastNominatimCall < NOMINATIM_MIN_INTERVAL) {
        return null;
      }
      _lastNominatimCall = now;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&namedetails=1&extratags=1&accept-language=ja`,
        { headers: { 'User-Agent': 'TaxiSalesSupport/3.24.0 (taxi-app)' } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      // POI名が直接取得できる場合
      if (data.namedetails && data.namedetails.name && data.type !== 'residential' && data.type !== 'house') {
        return data.namedetails.name;
      }
      if (data.name && data.class !== 'highway' && data.class !== 'place') {
        return data.name;
      }
      return null;
    } catch { return null; }
  }

  return async function findNearbyLandmark(lat, lng) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
    // 最優先: 座標ベースの既知場所マッチング
    const knownPlace = TaxiApp.utils.matchKnownPlace(lat, lng);
    if (knownPlace) return knownPlace;

    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

    // メモリキャッシュ
    if (cache[key] !== undefined) return cache[key];

    // ディスクキャッシュ
    const dc = _loadDiskCache();
    if (dc[key] !== undefined) { cache[key] = dc[key]; return dc[key]; }

    // Places API
    let name = await _searchPlaces(lat, lng);

    // Nominatimフォールバック
    if (!name) name = await _searchNominatim(lat, lng);

    // エイリアス適用
    if (name) name = TaxiApp.utils.applyPlaceAlias(name);

    // キャッシュ保存（nullも保存して再検索を防止）
    cache[key] = name;
    dc[key] = name;
    diskCache = dc;
    _saveDiskCache(dc);

    return name;
  };
})();

// 逆ジオコーディング（メモリ+localStorageキャッシュ付き）
window.TaxiApp.utils.reverseGeocode = (() => {
  const CACHE_KEY = 'taxi_geocode_cache';
  const MAX_CACHE = 500;
  let memCache = null;
  let _lastNominatimGeoCall = 0;
  const NOMINATIM_MIN_MS = 1100; // Nominatim利用規約準拠
  function _loadCache() {
    if (memCache) return memCache;
    try { memCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { memCache = {}; }
    return memCache;
  }
  function _saveCache(c) {
    const keys = Object.keys(c);
    if (keys.length > MAX_CACHE) {
      const remove = keys.slice(0, keys.length - MAX_CACHE);
      remove.forEach(k => delete c[k]);
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
  }
  function _roundKey(lat, lng) { return `${lat.toFixed(5)},${lng.toFixed(5)}`; }

  return async function reverseGeocode(lat, lng) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
    // 最優先: 座標ベースの既知場所マッチング
    const knownPlace = TaxiApp.utils.matchKnownPlace(lat, lng);
    if (knownPlace) return knownPlace;

    const cache = _loadCache();
    const key = _roundKey(lat, lng);
    if (cache[key]) return cache[key];

    // Google Maps Geocoder優先
    if (window.google && google.maps && google.maps.Geocoder) {
      try {
        const geocoder = new google.maps.Geocoder();
        const results = await new Promise((resolve, reject) => {
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results && results.length > 0) resolve(results); else reject(status);
          });
        });
        const best = TaxiApp.utils.pickBestGeocoderResult(results, lat, lng);
        const name = TaxiApp.utils.extractAddress(best);
        cache[key] = name;
        memCache = cache;
        _saveCache(cache);
        return name;
      } catch {}
    }

    // Nominatimフォールバック（レート制限付き）
    const nowNom = Date.now();
    if (nowNom - _lastNominatimGeoCall < NOMINATIM_MIN_MS) {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
    _lastNominatimGeoCall = nowNom;
    try {
      const url = TaxiApp.utils.nominatimUrl(lat, lng);
      const res = await fetch(url, { headers: { 'User-Agent': 'TaxiSalesSupport/3.35 (taxi-app)' } });
      const data = await res.json();
      let name = null;
      if (data && data.address) {
        const a = data.address;
        const area = a.city || a.town || a.village || a.county || '';
        const detail = [a.suburb || a.neighbourhood || a.quarter || '', a.road || '', a.house_number || ''].filter(Boolean).join(' ');
        name = [area, detail].filter(Boolean).join(' ') || null;
      }
      if (!name) {
        name = data.display_name ? data.display_name.split(',').slice(0, 3).join(' ').trim() : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
      cache[key] = name;
      memCache = cache;
      _saveCache(cache);
      return name;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  };
})();

// ローカル時間でYYYY-MM-DD形式の日付文字列を取得（UTC誤差回避）
window.getLocalDateString = (date) => {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

window.APP_CONSTANTS = {
  APP_NAME: 'タクシー売上サポート',
  VERSION: '3.37.0',

  // デフォルト地図設定（東京駅）
  DEFAULT_MAP_CENTER: { lat: 35.6812, lng: 139.7671 },
  DEFAULT_MAP_ZOOM: 15,

  // GPS設定
  GPS_OPTIONS: {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 3000,
  },
  // GPS精度フィルタリング設定
  GPS_ACCURACY: {
    MAX_ACCEPT: 200,       // この精度(m)以上の測位は無視
    SMOOTHING_COUNT: 3,    // 平滑化に使う直近の測位数
    MAX_JUMP_METERS: 500,  // 1回の更新で許容する最大移動距離(m)
    MAX_JUMP_INTERVAL: 5000, // ジャンプ判定の最小間隔(ms)
  },

  // ルート定義
  ROUTES: {
    DASHBOARD: 'dashboard',
    MAP: 'map',
    REVENUE: 'revenue',
    RIVAL_RIDE: 'rival-ride',
    TRANSIT_INFO: 'transit-info',
    EVENTS: 'events',
    ANALYTICS: 'analytics',
    CALENDAR: 'calendar',
    INFO: 'info',
    DATA_MANAGE: 'data-manage',
    SETTINGS: 'settings',
    DEV_TOOLS: 'dev',
    DEV_LOGS: 'dev-logs',
    DEV_STRUCTURE: 'dev-structure',
    DEV_API: 'dev-api',
    GATHERING_MEMO: 'gathering-memo',
  },

  // ナビゲーション項目
  NAV_ITEMS: [
    { id: 'dashboard', label: 'ダッシュボード', icon: 'dashboard' },
    { id: 'map', label: '地図', icon: 'map' },
    { id: 'revenue', label: '売上記録', icon: 'receipt_long' },
    { id: 'rival-ride', label: '他社乗車', icon: 'local_taxi' },
    { id: 'analytics', label: '分析', icon: 'analytics' },
    { id: 'gathering-memo', label: '集客メモ', icon: 'mic' },
    { id: 'calendar', label: 'カレンダー', icon: 'calendar_month' },
    { id: 'data-manage', label: 'データ管理', icon: 'edit_note' },
    { id: 'settings', label: '設定', icon: 'settings' },
  ],

  // 情報ナビゲーション項目
  INFO_NAV_ITEMS: [
    { id: 'info', label: '情報', icon: 'info' },
    { id: 'events', label: 'イベント', icon: 'event' },
    { id: 'transit-info', label: '交通情報', icon: 'directions_transit' },
  ],

  // ボトムナビ項目
  BOTTOM_NAV_ITEMS: [
    { id: 'dashboard', label: 'ホーム', icon: 'home' },
    { id: 'map', label: '地図', icon: 'map' },
    { id: 'revenue', label: '売上', icon: 'receipt_long' },
    { id: 'calendar', label: 'カレンダー', icon: 'calendar_month' },
    { id: 'data-manage', label: 'データ', icon: 'edit_note' },
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
    GEMINI_API_KEY: 'taxi_app_gemini_api_key',
    LOGS: 'taxi_app_logs',
    SETTINGS: 'taxi_app_settings',
    REVENUE_DATA: 'taxi_app_revenue',
    RIVAL_RIDES: 'taxi_app_rival_rides',
    EVENTS: 'taxi_app_events',
    SYNC_SECRET: 'taxi_app_sync_secret',
    TRANSIT_INFO: 'taxi_app_transit_info',
    NOTIFICATION_ENABLED: 'taxi_app_notification_enabled',
    SHIFTS: 'taxi_app_shifts',
    BREAKS: 'taxi_app_breaks',
    DAILY_DEMAND_PLAN: 'taxi_app_daily_demand_plan',
    WORK_STATUS: 'taxi_app_work_status',
    HOTEL_PRICES: 'taxi_app_hotel_prices',
    GATHERING_MEMOS: 'taxi_app_gathering_memos',
    TRASH: 'taxi_app_trash',
    GPS_LOG: 'taxi_app_gps_log',
    GPS_BG_ENABLED: 'taxi_gps_bg_enabled',
    PLACE_ALIASES: 'taxi_app_place_aliases',
    DEFAULT_SHIFT_START: 'taxi_app_default_shift_start',
    DEFAULT_SHIFT_END: 'taxi_app_default_shift_end',
  },

  // 場所名エイリアス（逆ジオコーディング結果の自動置換）
  // キー: 元の住所に含まれる文字列（部分一致）、値: 置換後の名称
  PLACE_ALIASES: {
    'タクシープール': '旭川駅北口',
    '見本林道路線': '三浦綾子記念館',
  },

  // 座標ベースの既知場所（GPS座標で正確にマッチング）
  // radius(m)以内の座標は全てこの名称に変換される
  // 近接する場所は小さいradiusで区別する
  KNOWN_PLACES: [
    { name: '旭川駅北口', lat: 43.763314, lng: 142.359065, radius: 100 },
    { name: 'イオンモール旭川駅前', lat: 43.76455, lng: 142.35875, radius: 100 },
    { name: '旭山動物園', lat: 43.7710, lng: 142.4855, radius: 1000 },
    { name: 'ローソン8条10丁目店', lat: 43.7730, lng: 142.3670, radius: 50 },
    { name: 'OMO7旭川', lat: 43.7703, lng: 142.3646, radius: 80 },
    { name: 'プレミアホテルCABIN旭川', lat: 43.7658, lng: 142.3586, radius: 80 },
    { name: 'アートホテル旭川', lat: 43.7730, lng: 142.3604, radius: 80 },
    { name: 'ホテルクレッセント旭川', lat: 43.7698, lng: 142.3624, radius: 80 },
    { name: '9Cホテル旭川', lat: 43.7672, lng: 142.3588, radius: 80 },
    { name: 'ホテルウイング旭川', lat: 43.7665, lng: 142.3575, radius: 80 },
    // 病院
    { name: '旭川医科大学病院', lat: 43.7306, lng: 142.3857, radius: 300 },
    { name: '旭川赤十字病院', lat: 43.7580, lng: 142.3720, radius: 200 },
    { name: '市立旭川病院', lat: 43.7710, lng: 142.3650, radius: 200 },
    { name: '旭川厚生病院', lat: 43.7650, lng: 142.3490, radius: 200 },
  ],

  // 旭川市の主要ロケーション（駅・病院）
  KNOWN_LOCATIONS: {
    asahikawa: {
      station: { name: '旭川駅', lat: 43.7631, lng: 142.3581 },
      hospitals: [
        { name: '旭川医科大学病院', lat: 43.7306, lng: 142.3857, peakMorning: '08:00-11:00', peakAfternoon: null },
        { name: '旭川赤十字病院', lat: 43.7580, lng: 142.3720, peakMorning: '08:30-11:00', peakAfternoon: null },
        { name: '市立旭川病院', lat: 43.7710, lng: 142.3650, peakMorning: null, peakAfternoon: '13:00-15:00' },
        { name: '旭川厚生病院', lat: 43.7650, lng: 142.3490, peakMorning: null, peakAfternoon: '13:00-15:00' },
      ],
      hospitalSchedules: [
        { id: 'asahikawa_medical', name: '旭川医科大学病院',
          lat: 43.7306, lng: 142.3857,
          reception: [{ days: [1,2,3,4,5], start: '08:00', end: '11:00' }],
          dischargePeaks: [{ start: '10:30', end: '12:00', weight: 1.0, label: '午前診察終了' }],
          closedDays: [0, 6] },
        { id: 'red_cross', name: '旭川赤十字病院',
          lat: 43.7580, lng: 142.3720,
          reception: [{ days: [1,2,3,4,5], start: '08:30', end: '11:00' }],
          dischargePeaks: [{ start: '10:30', end: '12:00', weight: 0.9, label: '午前診察終了' }],
          closedDays: [0, 6] },
        { id: 'kosei', name: '旭川厚生病院',
          lat: 43.7650, lng: 142.3490,
          reception: [{ days: [1,2,3,4,5], start: '08:30', end: '11:00' },
                      { days: [1,2,3,4,5], start: '13:00', end: '15:00' }],
          dischargePeaks: [{ start: '11:00', end: '12:30', weight: 0.8, label: '午前診察終了' },
                           { start: '14:30', end: '16:00', weight: 0.7, label: '午後診察終了' }],
          closedDays: [0, 6] },
        { id: 'shiritsu', name: '市立旭川病院',
          lat: 43.7710, lng: 142.3650,
          reception: [{ days: [1,2,3,4,5], start: '08:30', end: '11:30' },
                      { days: [1,2,3,4,5], start: '13:00', end: '15:00' }],
          dischargePeaks: [{ start: '11:00', end: '12:30', weight: 0.8, label: '午前診察終了' },
                           { start: '14:30', end: '16:00', weight: 0.7, label: '午後診察終了' }],
          closedDays: [0, 6] },
      ],
      hotels: [
        // 駅遠方（タクシー需要: 非常に高い）
        { name: 'アートホテル旭川', lat: 43.7730, lng: 142.3604, rooms: 265, distKm: 1.2, demandLevel: 'very_high' },
        { name: 'OMO7旭川', lat: 43.7703, lng: 142.3646, rooms: 237, distKm: 1.0, demandLevel: 'very_high' },
        { name: '旭川トーヨーホテル', lat: 43.7723, lng: 142.3621, rooms: 128, distKm: 1.2, demandLevel: 'very_high' },
        // 中距離（タクシー需要: 高い）
        { name: 'ドーミーイン旭川', lat: 43.7708, lng: 142.3594, rooms: 172, distKm: 0.9, demandLevel: 'high' },
        { name: 'ホテルクレッセント旭川', lat: 43.7698, lng: 142.3624, rooms: 159, distKm: 0.9, demandLevel: 'high' },
        { name: 'プレミアホテルCABIN旭川', lat: 43.7658, lng: 142.3586, rooms: 355, distKm: 0.4, demandLevel: 'high' },
        { name: 'ホテルアマネク旭川', lat: 43.7655, lng: 142.3599, rooms: 221, distKm: 0.35, demandLevel: 'high' },
        // 駅近（大型 → ボリューム需要）
        { name: 'ルートインGrand旭川駅前', lat: 43.7633, lng: 142.3588, rooms: 342, distKm: 0.2, demandLevel: 'medium' },
        { name: 'JRイン旭川', lat: 43.7639, lng: 142.3568, rooms: 198, distKm: 0.0, demandLevel: 'medium' },
        { name: '東横INN旭川駅東口', lat: 43.7625, lng: 142.3637, rooms: 185, distKm: 0.4, demandLevel: 'medium' },
        { name: 'ルートイン旭川駅前一条通', lat: 43.7663, lng: 142.3569, rooms: 187, distKm: 0.5, demandLevel: 'medium' },
        { name: 'ワイズホテル旭川駅前', lat: 43.7612, lng: 142.3585, rooms: 160, distKm: 0.2, demandLevel: 'medium' },
        { name: '東横INN旭川駅前一条通', lat: 43.7649, lng: 142.3612, rooms: 143, distKm: 0.4, demandLevel: 'medium' },
        { name: 'WBFグランデ旭川', lat: 43.7630, lng: 142.3622, rooms: 120, distKm: 0.3, demandLevel: 'low' },
        { name: 'コートホテル旭川', lat: 43.7649, lng: 142.3612, rooms: 114, distKm: 0.2, demandLevel: 'low' },
      ],
      // ホテル需要ピーク時間帯（全ホテル共通）
      hotelPeakWindows: {
        checkout: { start: '09:30', end: '11:00', label: 'チェックアウト', weight: 1.0 },
        checkin:  { start: '15:00', end: '17:00', label: 'チェックイン', weight: 0.8 },
        evening:  { start: '18:00', end: '20:00', label: '夕食・外出', weight: 0.6 },
        night:    { start: '22:00', end: '24:00', label: '帰館', weight: 0.5 },
      },
      // 待機スポット定義（需要指数算出用）
      waitingSpots: [
        {
          id: 'station', name: '旭川駅北口', shortName: '駅北口',
          lat: 43.7631, lng: 142.3581,
          hasOddDayRule: true, // 奇数日は待機不可
          // 24要素: 0時〜23時のベース需要(0-100) 平日
          basePatternWeekday: [0,0,0,0,0,0,5,15,30,55,65,50,40,35,45,55,60,50,55,60,45,30,15,5],
          basePatternWeekend: [0,0,0,0,0,0,3,10,25,50,60,55,45,40,40,50,55,50,55,65,50,35,20,8],
          peakBoost: null, // 交通機関ブーストで加算
        },
        {
          id: 'asahikawa_medical', name: '旭川医科大学病院', shortName: '医大',
          lat: 43.7306, lng: 142.3857,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,5,20,55,70,75,65,30,15,10,8,5,3,2,0,0,0,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,2,5,8,10,8,5,3,2,1,0,0,0,0,0,0,0,0],
          peakBoost: { startHour: 8, endHour: 11, boost: 20 },
        },
        {
          id: 'red_cross', name: '旭川赤十字病院', shortName: '赤十字',
          lat: 43.7580, lng: 142.3720,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,3,15,45,65,70,60,25,12,8,5,3,2,1,0,0,0,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,2,5,8,10,8,5,3,2,1,0,0,0,0,0,0,0,0],
          peakBoost: { startHour: 8, endHour: 11, boost: 18 },
        },
        {
          id: 'kosei', name: '旭川厚生病院', shortName: '厚生',
          lat: 43.7650, lng: 142.3490,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,3,10,25,35,40,35,40,60,65,50,20,8,3,0,0,0,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,2,5,8,10,8,5,3,2,1,0,0,0,0,0,0,0,0],
          peakBoost: { startHour: 13, endHour: 15, boost: 20 },
        },
        {
          id: 'shiritsu', name: '市立旭川病院', shortName: '市立',
          lat: 43.7710, lng: 142.3650,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,3,10,25,35,40,35,40,55,60,45,18,6,2,0,0,0,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,2,5,8,10,8,5,3,2,1,0,0,0,0,0,0,0,0],
          peakBoost: { startHour: 13, endHour: 15, boost: 18 },
        },
        {
          id: 'asahiyama_zoo', name: '旭山動物園', shortName: '動物園',
          lat: 43.7710, lng: 142.4855,
          hasOddDayRule: false,
          // 夏期（9:30-17:15）用パターン — 閉園前15-17時がピーク
          basePatternWeekday: [0,0,0,0,0,0,0,0,0,20,35,40,35,30,40,55,60,45,0,0,0,0,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,0,0,30,50,55,50,45,55,65,70,55,0,0,0,0,0,0],
          // 冬期（10:30-15:30）用パターン — 閉園前14-15時がピーク
          basePatternWinterWeekday: [0,0,0,0,0,0,0,0,0,0,10,25,30,35,50,55,20,0,0,0,0,0,0,0],
          basePatternWinterWeekend: [0,0,0,0,0,0,0,0,0,0,15,35,45,50,60,65,25,0,0,0,0,0,0,0],
          peakBoost: null,
          // 営業スケジュール
          zooSchedule: {
            // 夏期開園 (例年4月下旬〜10月中旬)
            summer: { startMonth: 4, startDay: 26, endMonth: 10, endDay: 15, open: '9:30', close: '17:15', lastEntry: '16:00' },
            // 秋期 (10月中旬〜11月上旬)
            autumn: { startMonth: 10, startDay: 16, endMonth: 11, endDay: 3, open: '9:30', close: '16:30', lastEntry: '16:00' },
            // 冬期開園 (11月中旬〜翌4月上旬)
            winter: { startMonth: 11, startDay: 11, endMonth: 4, endDay: 7, open: '10:30', close: '15:30', lastEntry: '15:00' },
            // 休園期間
            closedPeriods: [
              { startMonth: 4, startDay: 8, endMonth: 4, endDay: 25, reason: '春季休園' },
              { startMonth: 11, startDay: 4, endMonth: 11, endDay: 10, reason: '秋季休園' },
              { startMonth: 12, startDay: 30, endMonth: 1, endDay: 1, reason: '年末年始' },
            ],
          },
        },
        {
          id: 'omo7', name: 'OMO7旭川', shortName: 'OMO7',
          lat: 43.7703, lng: 142.3646,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,0,5,15,40,55,45,20,10,8,20,35,30,35,30,15,5,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,8,20,50,65,55,30,15,12,28,45,40,45,40,20,8,0,0],
          peakBoost: { startHour: 9, endHour: 11, boost: 15 },
        },
        {
          id: 'cabin', name: 'プレミアホテルCABIN旭川', shortName: 'CABIN',
          lat: 43.7658, lng: 142.3586,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,0,5,15,40,55,45,20,10,8,20,35,30,35,30,15,5,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,8,20,50,65,55,30,15,12,28,45,40,45,40,20,8,0,0],
          peakBoost: { startHour: 9, endHour: 11, boost: 12 },
        },
        {
          id: 'art_hotel', name: 'アートホテル旭川', shortName: 'アートホテル',
          lat: 43.7730, lng: 142.3604,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,0,5,15,45,60,50,25,12,10,22,38,32,38,32,18,8,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,8,22,55,70,60,35,18,15,30,48,42,48,42,22,10,0,0],
          peakBoost: { startHour: 9, endHour: 11, boost: 18 },
        },
        {
          id: 'crescent', name: 'ホテルクレッセント旭川', shortName: 'クレッセント',
          lat: 43.7698, lng: 142.3624,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,0,5,12,35,50,40,18,10,8,18,30,28,32,28,14,5,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,8,18,45,60,50,28,15,12,25,40,38,42,38,18,8,0,0],
          peakBoost: { startHour: 9, endHour: 11, boost: 12 },
        },
        {
          id: '9c_hotel', name: '9Cホテル旭川', shortName: '9C',
          lat: 43.7672, lng: 142.3588,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,0,4,10,30,42,35,15,8,6,15,25,22,28,22,12,4,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,6,15,40,52,45,22,12,10,22,35,30,38,30,15,6,0,0],
          peakBoost: { startHour: 9, endHour: 11, boost: 10 },
        },
        {
          id: 'wing', name: 'ホテルウイング旭川', shortName: 'ウイング',
          lat: 43.7665, lng: 142.3575,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,0,4,10,30,42,35,15,8,6,15,25,22,28,22,12,4,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,6,15,40,52,45,22,12,10,22,35,30,38,30,15,6,0,0],
          peakBoost: { startHour: 9, endHour: 11, boost: 10 },
        },
        {
          id: 'lawson_8jo', name: 'ローソン8条10丁目店', shortName: 'ローソン8条',
          lat: 43.7730, lng: 142.3670,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,3,10,20,30,25,20,15,15,20,25,30,35,30,20,10,5,0,0],
          basePatternWeekend: [0,0,0,0,0,0,2,8,15,25,22,18,15,15,18,22,28,32,28,18,8,3,0,0],
          peakBoost: null,
        },
        {
          id: 'aeon', name: 'イオンモール旭川駅前', shortName: 'イオン',
          lat: 43.7618, lng: 142.3592,
          hasOddDayRule: false,
          basePatternWeekday: [0,0,0,0,0,0,0,0,5,10,25,45,50,40,30,25,30,50,55,50,35,15,5,0],
          basePatternWeekend: [0,0,0,0,0,0,0,0,8,15,35,55,60,50,40,35,40,60,65,55,40,20,8,0],
          peakBoost: null, // ホテル需要ブーストで加算
        },
      ],
      // 流しエリア定義（エリア別需要指数算出用）
      cruisingAreas: [
        {
          id: 'downtown', name: '中心地方面', shortName: '中心地',
          lat: 43.7710, lng: 142.3650,
          keywords: ['中心|買物|3条|4条|5条|6条|7条|宮下|平和'],
          basePatternWeekday: [0,0,0,0,0,0,3,10,25,40,50,55,60,55,50,45,50,55,60,55,40,25,10,3],
          basePatternWeekend: [0,0,0,0,0,0,2,8,20,35,50,60,65,60,55,50,55,60,65,60,45,30,15,5],
        },
        {
          id: 'toyooka', name: '豊岡方面', shortName: '豊岡',
          lat: 43.7650, lng: 142.3900,
          keywords: ['豊岡'],
          basePatternWeekday: [0,0,0,0,0,0,5,15,30,35,25,20,15,15,20,25,30,35,30,20,10,5,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,10,20,25,20,18,15,15,18,22,25,30,25,18,8,3,0,0],
        },
        {
          id: 'touko', name: '東光方面', shortName: '東光',
          lat: 43.7530, lng: 142.3850,
          keywords: ['東光'],
          basePatternWeekday: [0,0,0,0,0,0,5,15,25,30,25,20,15,12,18,22,28,32,28,18,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,10,18,22,20,18,15,12,15,20,25,28,25,15,6,2,0,0],
        },
        {
          id: 'idai', name: '医大方面', shortName: '医大方面',
          lat: 43.7306, lng: 142.3857,
          keywords: ['医大|医科大|西御料'],
          basePatternWeekday: [0,0,0,0,0,0,5,20,45,55,50,40,25,15,10,8,5,3,2,0,0,0,0,0],
          basePatternWeekend: [0,0,0,0,0,0,0,5,10,15,12,10,8,5,3,2,0,0,0,0,0,0,0,0],
        },
        {
          id: 'kagura', name: '神楽方面', shortName: '神楽',
          lat: 43.7500, lng: 142.3700,
          keywords: ['神楽'],
          basePatternWeekday: [0,0,0,0,0,0,5,15,25,30,25,20,15,15,20,25,30,35,30,20,10,5,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,10,18,25,22,18,15,15,18,22,28,32,28,18,8,3,0,0],
        },
        {
          id: 'chuwa', name: '忠和方面', shortName: '忠和',
          lat: 43.7700, lng: 142.3350,
          keywords: ['忠和'],
          basePatternWeekday: [0,0,0,0,0,0,5,12,20,25,20,15,12,10,15,20,25,28,22,15,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,8,15,20,18,14,10,10,12,18,22,25,20,12,6,2,0,0],
        },
        {
          id: 'midorimachi', name: '緑町方面', shortName: '緑町',
          lat: 43.7780, lng: 142.3600,
          keywords: ['緑町|緑が丘'],
          basePatternWeekday: [0,0,0,0,0,0,5,12,22,28,22,18,14,12,16,22,28,30,25,15,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,8,16,22,20,16,12,12,14,20,25,28,22,14,6,2,0,0],
        },
        {
          id: 'shunko', name: '春光方面', shortName: '春光',
          lat: 43.7850, lng: 142.3500,
          keywords: ['春光|花咲'],
          basePatternWeekday: [0,0,0,0,0,0,5,15,25,30,22,18,14,12,16,22,28,32,25,15,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,10,18,22,18,15,12,12,14,20,25,28,22,13,6,2,0,0],
        },
        {
          id: 'suehiro', name: '末広方面', shortName: '末広',
          lat: 43.7900, lng: 142.3700,
          keywords: ['末広'],
          basePatternWeekday: [0,0,0,0,0,0,5,12,22,28,22,18,14,12,16,22,28,30,25,15,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,8,16,22,18,15,12,12,14,20,25,28,22,13,6,2,0,0],
        },
        {
          id: 'nagayama', name: '永山方面', shortName: '永山',
          lat: 43.8000, lng: 142.3800,
          keywords: ['永山'],
          basePatternWeekday: [0,0,0,0,0,0,5,15,28,35,28,22,18,15,20,28,35,38,30,20,10,5,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,10,20,28,25,20,15,15,18,25,30,35,28,18,8,3,0,0],
        },
        {
          id: 'kamui', name: '神居方面', shortName: '神居',
          lat: 43.7600, lng: 142.3300,
          keywords: ['神居'],
          basePatternWeekday: [0,0,0,0,0,0,5,12,20,25,20,16,12,10,14,20,25,28,22,14,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,8,15,20,18,14,10,10,12,18,22,25,20,12,6,2,0,0],
        },
        {
          id: 'kawabata', name: '川端方面', shortName: '川端',
          lat: 43.7680, lng: 142.3750,
          keywords: ['川端'],
          basePatternWeekday: [0,0,0,0,0,0,3,10,20,28,25,20,15,12,16,22,28,32,28,18,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,2,8,15,22,20,18,14,12,14,20,25,28,25,15,6,2,0,0],
        },
        {
          id: 'omachi', name: '大町方面', shortName: '大町',
          lat: 43.7730, lng: 142.3580,
          keywords: ['大町'],
          basePatternWeekday: [0,0,0,0,0,0,3,10,22,30,25,20,15,12,16,22,28,32,25,16,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,2,8,16,24,22,18,14,12,14,20,25,30,22,14,6,2,0,0],
        },
        {
          id: 'kitamon_nishiki', name: '北門・錦町方面', shortName: '北門錦町',
          lat: 43.7800, lng: 142.3650,
          keywords: ['北門|錦町'],
          basePatternWeekday: [0,0,0,0,0,0,5,14,24,30,25,20,15,12,16,22,28,32,26,16,8,3,0,0],
          basePatternWeekend: [0,0,0,0,0,0,3,10,18,24,22,18,14,12,14,20,25,30,24,14,6,2,0,0],
        },
      ],
    },
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
              { name: 'TransitInfo.jsx', type: 'react', desc: '公共交通機関情報' },
              { name: 'Events.jsx', type: 'react', desc: 'イベント記録' },
              { name: 'DataManage.jsx', type: 'react', desc: 'データ管理（編集・削除）' },
              { name: 'GatheringMemo.jsx', type: 'react', desc: '集客メモ（音声入力対応）' },
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
              { name: 'geminiService.js', type: 'js', desc: 'Gemini AI API連携' },
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

})();
