(function() {
// gpsLogService.js - シフト中GPS追跡 + 実車/空車分類サービス
//
// 始業〜終業の間、GPSを1秒間隔で記録（IndexedDB保存）。
// 売上記録の乗車時間〜降車時間と照合して実車/空車を自動分類する。

window.GpsLogService = (() => {
  const THROTTLE_MS = 1000;       // 1秒
  const FLUSH_INTERVAL_MS = 10000; // 10秒ごとにIndexedDBへフラッシュ
  // 保存期間: 無期限（自動削除なし）
  const DB_NAME = 'taxi_app_gps_db';
  const STORE_NAME = 'gps_log';

  let _lastRecordTime = 0;
  let _buffer = {};    // { dateStr: [entry, ...] }
  let _db = null;
  let _flushTimer = null;
  let _lastKnownPosition = null; // 最新GPS座標（天気予報API用）

  // --- 天気キャッシュ ---
  const WEATHER_POLL_MS = 300000; // 5分間隔で天気取得
  let _weatherCache = null;       // { w: '晴れ', tp: 5.2, wc: 1, ts: Date.now() }
  let _weatherTimer = null;

  // WMO天気コードを天候カテゴリに変換（共通ユーティリティ委譲）
  const _wmoToWeather = (code) => TaxiApp.utils.wmoToWeather(code, '曇り');

  /** Open-Meteo APIから現在地の天気を取得しキャッシュ更新 */
  function _fetchWeather() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        _lastKnownPosition = { lat, lng };
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=Asia/Tokyo`;
        fetch(url)
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
          .then(data => {
            const cw = data.current_weather;
            if (cw) {
              _weatherCache = {
                w: _wmoToWeather(cw.weathercode),
                tp: Math.round(cw.temperature * 10) / 10,
                wc: cw.weathercode,
                ts: Date.now(),
              };
              AppLogger.info(`天気取得: ${_weatherCache.w} ${_weatherCache.tp}℃ (WMO:${_weatherCache.wc})`);
            }
          })
          .catch(err => {
            AppLogger.warn(`天気API取得失敗: ${err}（前回キャッシュを維持）`);
          });
      },
      (err) => {
        AppLogger.warn(`天気用位置取得失敗: ${err.message}（前回キャッシュを維持）`);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  /** 天気ポーリング開始（即時1回 + 5分間隔） */
  function startWeatherPolling() {
    stopWeatherPolling();
    _fetchWeather();
    _weatherTimer = setInterval(_fetchWeather, WEATHER_POLL_MS);
    AppLogger.info('天気ポーリング開始（5分間隔）');
  }

  /** 天気ポーリング停止 */
  function stopWeatherPolling() {
    if (_weatherTimer) {
      clearInterval(_weatherTimer);
      _weatherTimer = null;
    }
    _weatherCache = null;
  }

  // --- IndexedDB ---
  function _openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function _idbGet(key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function _idbPut(key, value) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function _idbDelete(key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function _idbAllKeys() {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function _idbClear() {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- メモリバッファ → IndexedDBフラッシュ ---
  async function _flush() {
    const dates = Object.keys(_buffer);
    if (dates.length === 0) return;
    const snapshot = _buffer;
    _buffer = {};
    for (const dateStr of dates) {
      try {
        const existing = (await _idbGet(dateStr)) || [];
        await _idbPut(dateStr, existing.concat(snapshot[dateStr]));
      } catch (e) {
        // フラッシュ失敗時はバッファに戻す
        if (!_buffer[dateStr]) _buffer[dateStr] = [];
        _buffer[dateStr] = snapshot[dateStr].concat(_buffer[dateStr]);
      }
    }
  }

  function _startFlushTimer() {
    if (_flushTimer) return;
    _flushTimer = setInterval(() => _flush(), FLUSH_INTERVAL_MS);
  }

  function _stopFlushTimer() {
    if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
  }

  // ページアンロード時にフラッシュ
  window.addEventListener('beforeunload', () => {
    _stopFlushTimer();
    // beforeunloadではasyncが使えないのでベストエフォートで同期的にトランザクション開始
    const dates = Object.keys(_buffer);
    if (dates.length === 0 || !_db) return;
    try {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const dateStr of dates) {
        // getしてconcatする余裕がないので、既存データを取得せず追記用に一旦put
        // → 実際にはbeforeunloadでgetは間に合わないため、バッファ分だけ書き込む
        // これはflushで後から結合されるか、ページが本当に閉じるなら最大10秒分のロス
        const entries = _buffer[dateStr];
        const getReq = store.get(dateStr);
        getReq.onsuccess = () => {
          const existing = getReq.result || [];
          store.put(existing.concat(entries), dateStr);
        };
      }
    } catch { /* best effort */ }
    _buffer = {};
  });

  // visibilitychange: タブ非表示時にもフラッシュ（モバイルブラウザ対策）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _flush();
    }
  });

  // --- ヘルパー ---
  function _todayStr() {
    return getLocalDateString();
  }

  function _isShiftActive() {
    try {
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      return shifts.some(s => !s.endTime);
    } catch { return false; }
  }

  function _isOnBreak() {
    try {
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      return breaks.some(b => !b.endTime);
    } catch { return false; }
  }

  // localStorageからの一括マイグレーション
  async function _migrateFromLocalStorage() {
    const STORAGE_KEY = APP_CONSTANTS.STORAGE_KEYS.GPS_LOG;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const dates = Object.keys(data);
      if (dates.length === 0) return;
      for (const dateStr of dates) {
        if (data[dateStr] && data[dateStr].length > 0) {
          const existing = (await _idbGet(dateStr)) || [];
          if (existing.length === 0) {
            await _idbPut(dateStr, data[dateStr]);
          }
        }
      }
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore migration errors */ }
  }

  // 初期化: DB接続 + マイグレーション + フラッシュタイマー開始
  _openDB().then(() => _migrateFromLocalStorage()).then(() => _startFlushTimer()).catch((e) => {
    if (window.AppLogger) AppLogger.warn('GpsLogService init error:', e);
  });

  // --- リアルタイム待機検出 ---
  const RT_STANDBY_RADIUS = 50;       // 50m以内なら停車中
  const RT_STANDBY_MIN_MS = 180000;   // 3分以上で待機確定
  const RT_STANDBY_RIDE_CHECK_MS = 120000; // 待機終了後2分間は乗車チェック猶予
  let _rtAnchor = null;   // { lat, lng, startTime, lastTime }
  let _rtPendingStandby = null; // 待機終了後の乗車チェック待ち { ...standbyData, movedAt }
  let _rtLastEntryCount = 0; // 直前の売上記録数（乗車検出用）

  /** リアルタイム待機検出: GPS受信のたびに呼ばれる */
  function _rtDetectStandby(lat, lng, now) {
    // まず前回の未確定待機をチェック
    _rtCheckPendingStandby(now);

    if (_rtAnchor === null) {
      _rtAnchor = { lat, lng, startTime: now, lastTime: now };
      return;
    }

    const dist = _haversine(_rtAnchor.lat, _rtAnchor.lng, lat, lng);
    if (dist <= RT_STANDBY_RADIUS) {
      // まだ同じ場所にいる
      _rtAnchor.lastTime = now;
    } else {
      // 動き始めた → 待機期間を確定するか判定
      const duration = _rtAnchor.lastTime - _rtAnchor.startTime;
      if (duration >= RT_STANDBY_MIN_MS) {
        // 待機確定 → 乗車チェック待ちに入れる
        const avgLat = _rtAnchor.lat;
        const avgLng = _rtAnchor.lng;
        const catInfo = _classifyStandbyCategory(avgLat, avgLng);
        _rtPendingStandby = {
          lat: avgLat, lng: avgLng,
          startTime: _rtAnchor.startTime,
          endTime: _rtAnchor.lastTime,
          durationMin: Math.round(duration / 60000 * 10) / 10,
          movedAt: now,
          ...catInfo,
        };
        // 現在の売上記録数を記憶
        try { _rtLastEntryCount = DataService.getEntries().length; } catch { _rtLastEntryCount = 0; }
      }
      // アンカーリセット
      _rtAnchor = { lat, lng, startTime: now, lastTime: now };
    }
  }

  /** 待機終了後の乗車チェック: 猶予時間内に売上が追加されなければ空車待機を自動記録 */
  function _rtCheckPendingStandby(now) {
    if (!_rtPendingStandby) return;
    const elapsed = now - _rtPendingStandby.movedAt;
    if (elapsed < RT_STANDBY_RIDE_CHECK_MS) return; // まだ猶予中

    // 猶予時間経過 → 売上が増えたかチェック
    let currentCount = 0;
    try { currentCount = DataService.getEntries().length; } catch {}
    const gotRide = currentCount > _rtLastEntryCount;

    if (!gotRide) {
      // 乗車なし → 空車待機を自動記録
      _autoRecordVacantStandby(_rtPendingStandby);
    }
    _rtPendingStandby = null;
  }

  /** リアルタイム待機状態のフラッシュ（終業時・休憩開始時に呼ぶ） */
  function flushRealtimeStandby() {
    const now = Date.now();
    // アンカー中の待機を確定
    if (_rtAnchor) {
      const duration = _rtAnchor.lastTime - _rtAnchor.startTime;
      if (duration >= RT_STANDBY_MIN_MS) {
        const catInfo = _classifyStandbyCategory(_rtAnchor.lat, _rtAnchor.lng);
        const standby = {
          lat: _rtAnchor.lat, lng: _rtAnchor.lng,
          startTime: _rtAnchor.startTime,
          endTime: _rtAnchor.lastTime,
          durationMin: Math.round(duration / 60000 * 10) / 10,
          movedAt: now,
          ...catInfo,
        };
        // 直近に売上追加がなければ空車待機として記録
        let currentCount = 0;
        try { currentCount = DataService.getEntries().length; } catch {}
        if (currentCount <= _rtLastEntryCount) {
          _autoRecordVacantStandby(standby);
        }
      }
      _rtAnchor = null;
    }
    // ペンディング中の待機もチェック
    if (_rtPendingStandby) {
      let currentCount = 0;
      try { currentCount = DataService.getEntries().length; } catch {}
      if (currentCount <= _rtLastEntryCount) {
        _autoRecordVacantStandby(_rtPendingStandby);
      }
      _rtPendingStandby = null;
    }
  }

  /** 空車待機を売上データに自動記録（noPassenger: true） */
  function _autoRecordVacantStandby(standby) {
    if (!window.DataService) return;
    const dateStr = getLocalDateString(new Date(standby.startTime));
    const startT = new Date(standby.startTime);
    const endT = new Date(standby.endTime);
    const pickupTime = `${String(startT.getHours()).padStart(2,'0')}:${String(startT.getMinutes()).padStart(2,'0')}`;
    const dropoffTime = `${String(endT.getHours()).padStart(2,'0')}:${String(endT.getMinutes()).padStart(2,'0')}`;
    const placeName = standby.nearbyName || standby.categoryLabel || '';

    const form = {
      amount: '0',
      date: dateStr,
      weather: _weatherCache ? _weatherCache.w : '',
      temperature: _weatherCache ? _weatherCache.tp : null,
      pickup: placeName,
      pickupTime: pickupTime,
      dropoff: placeName,
      dropoffTime: dropoffTime,
      pickupCoords: { lat: standby.lat, lng: standby.lng },
      dropoffCoords: { lat: standby.lat, lng: standby.lng },
      passengers: '0',
      gender: '',
      purpose: '待機',
      source: '',
      memo: `空車待機${standby.durationMin}分（${standby.nearbyName || standby.categoryLabel}）自動記録`,
      noPassenger: true,
      paymentMethod: 'cash',
    };

    try {
      DataService.addEntry(form);
      if (window.AppLogger) AppLogger.info(`空車待機を自動記録: ${placeName || '不明'} ${standby.durationMin}分 [${standby.categoryLabel}]`);
    } catch (e) {
      if (window.AppLogger) AppLogger.warn('空車待機の自動記録に失敗:', e);
    }
  }

  // --- 公開API ---

  function _isMobile() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /** 1秒スロットル記録（同期・バッファ書き込み）- スマホ+始業中+休憩外のみ */
  function maybeRecord(lat, lng, accuracy, speed) {
    // 常に最新位置を保存（天気予報APIで使用）
    if (lat != null && lng != null) {
      _lastKnownPosition = { lat, lng };
    }
    const now = Date.now();
    if (now - _lastRecordTime < THROTTLE_MS) return false;
    if (!_isMobile()) return false;
    if (!_isShiftActive()) return false;
    if (_isOnBreak()) return false;
    if (lat == null || lng == null) return false;
    if (accuracy != null && accuracy > 500) return false; // 精度500m超は破棄

    _lastRecordTime = now;
    const dateStr = _todayStr();
    if (!_buffer[dateStr]) _buffer[dateStr] = [];
    _buffer[dateStr].push({
      t: new Date(now).toISOString(),
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      acc: accuracy != null ? Math.round(accuracy) : null,
      spd: speed != null ? Math.round(speed * 10) / 10 : null,
      w: _weatherCache ? _weatherCache.w : null,
      tp: _weatherCache ? _weatherCache.tp : null,
    });

    // リアルタイム待機検出
    _rtDetectStandby(Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6, now);

    return true;
  }

  /** 日付指定でGPSログ取得 (async) - IndexedDB + バッファ結合 */
  async function getLogForDate(dateStr) {
    const stored = (await _idbGet(dateStr)) || [];
    const buffered = _buffer[dateStr] || [];
    return stored.concat(buffered);
  }

  /** ログがある日付一覧（降順）(async) */
  async function getLogDates() {
    const keys = await _idbAllKeys();
    const bufferKeys = Object.keys(_buffer).filter(k => _buffer[k].length > 0);
    const allKeys = [...new Set([...keys, ...bufferKeys])];
    // 空のエントリを除外するためにキーごとにチェック
    const validKeys = [];
    for (const k of allKeys) {
      if (_buffer[k] && _buffer[k].length > 0) { validKeys.push(k); continue; }
      const data = await _idbGet(k);
      if (data && data.length > 0) validKeys.push(k);
    }
    return validKeys.sort().reverse();
  }

  /** 売上記録とGPSを照合し、各ポイントに occupied/vacant を付与 (async) */
  async function classifyEntries(dateStr) {
    const log = await getLogForDate(dateStr);
    if (log.length === 0) return [];

    const entries = DataService.getEntries();
    const ranges = [];
    for (const e of entries) {
      if (e.date !== dateStr) continue;
      if (!e.pickupTime || !e.dropoffTime) continue;
      const pickup = new Date(dateStr + 'T' + e.pickupTime + ':00').getTime();
      const dropoff = new Date(dateStr + 'T' + e.dropoffTime + ':00').getTime();
      if (!isNaN(pickup) && !isNaN(dropoff) && dropoff > pickup) {
        ranges.push({ from: pickup, to: dropoff });
      }
    }

    return log.map(p => {
      const ts = new Date(p.t).getTime();
      const occupied = ranges.some(r => ts >= r.from && ts <= r.to);
      return { ...p, status: occupied ? 'occupied' : 'vacant' };
    });
  }

  /** 実車時間/空車時間/実車率のサマリー (async) */
  async function getDaySummary(dateStr) {
    const classified = await classifyEntries(dateStr);
    if (classified.length === 0) return { total: 0, occupied: 0, vacant: 0, rate: 0, points: 0, firstTime: null, lastTime: null };

    let occupiedCount = 0;
    let vacantCount = 0;
    for (const p of classified) {
      if (p.status === 'occupied') occupiedCount++;
      else vacantCount++;
    }

    const intervalSec = THROTTLE_MS / 1000;
    const occupiedMin = Math.round(occupiedCount * intervalSec / 60);
    const vacantMin = Math.round(vacantCount * intervalSec / 60);
    const totalMin = occupiedMin + vacantMin;
    const rate = totalMin > 0 ? Math.round(occupiedMin / totalMin * 100) : 0;

    return {
      total: totalMin,
      occupied: occupiedMin,
      vacant: vacantMin,
      rate,
      points: classified.length,
      firstTime: classified[0].t,
      lastTime: classified[classified.length - 1].t,
    };
  }

  /** 指定日のデータ削除 (async) */
  async function deleteDate(dateStr) {
    delete _buffer[dateStr];
    await _idbDelete(dateStr);
  }

  /** 全GPS記録削除 (async) */
  async function clearAll() {
    _buffer = {};
    _lastRecordTime = 0;
    await _idbClear();
  }

  /** cleanup - 保存期間無期限のため何もしない */
  async function cleanup() {
    // 無期限保存: 自動削除なし
  }

  /** CSV出力 (async) */
  async function exportCsv(dateStr) {
    const classified = await classifyEntries(dateStr);
    if (classified.length === 0) return null;

    const header = '時刻,緯度,経度,精度(m),速度(m/s),状態,天気,気温(℃)';
    const rows = classified.map(p => {
      const time = new Date(p.t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const status = p.status === 'occupied' ? '実車' : '空車';
      return `${time},${p.lat},${p.lng},${p.acc ?? ''},${p.spd ?? ''},${status},${p.w || ''},${p.tp != null ? p.tp : ''}`;
    });

    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gps_log_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  // --- 分析API ---

  /** Haversine距離(メートル) */
  function _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** 空車走行ヒートマップ用データ (async) - 複数日対応 */
  async function getVacantHeatmapData(dateStrs) {
    const allPoints = [];
    for (const d of dateStrs) {
      const classified = await classifyEntries(d);
      for (const p of classified) {
        if (p.status === 'vacant') {
          allPoints.push({ lat: p.lat, lng: p.lng });
        }
      }
    }
    if (allPoints.length === 0) return [];

    // グリッド集約（0.001° ≒ 100m）
    const CELL = 0.001;
    const grid = {};
    for (const p of allPoints) {
      const key = `${Math.round(p.lat / CELL)}_${Math.round(p.lng / CELL)}`;
      if (!grid[key]) grid[key] = { lat: 0, lng: 0, count: 0 };
      grid[key].lat += p.lat;
      grid[key].lng += p.lng;
      grid[key].count++;
    }
    return Object.values(grid).map(g => ({
      lat: g.lat / g.count,
      lng: g.lng / g.count,
      weight: g.count,
    }));
  }

  /** 時間帯×エリア別 実車率マトリクス (async) */
  async function getAreaTimeMatrix(dateStrs) {
    const allClassified = [];
    for (const d of dateStrs) {
      const classified = await classifyEntries(d);
      allClassified.push(...classified);
    }
    if (allClassified.length === 0) return { cells: [], areas: [], hours: [] };

    // エリア分割: GPS範囲を5×5グリッドに分割
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of allClassified) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const GRID = 5;
    const latStep = Math.max((maxLat - minLat) / GRID, 0.001);
    const lngStep = Math.max((maxLng - minLng) / GRID, 0.001);

    // 24時間のうち営業時間帯のみ
    const hourBuckets = [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2];

    // セル集約
    const matrix = {}; // "areaIdx_hour" => { occupied, total }
    const areaNames = [];
    const usedAreas = new Set();

    for (const p of allClassified) {
      const hr = new Date(p.t).getHours();
      const areaRow = Math.min(Math.floor((p.lat - minLat) / latStep), GRID - 1);
      const areaCol = Math.min(Math.floor((p.lng - minLng) / lngStep), GRID - 1);
      const areaIdx = areaRow * GRID + areaCol;
      usedAreas.add(areaIdx);
      const key = `${areaIdx}_${hr}`;
      if (!matrix[key]) matrix[key] = { occupied: 0, total: 0 };
      matrix[key].total++;
      if (p.status === 'occupied') matrix[key].occupied++;
    }

    // エリア名生成（中心座標から簡易ラベル）
    const areas = [...usedAreas].sort((a, b) => a - b).map(idx => {
      const row = Math.floor(idx / GRID);
      const col = idx % GRID;
      const cLat = (minLat + (row + 0.5) * latStep).toFixed(3);
      const cLng = (minLng + (col + 0.5) * lngStep).toFixed(3);
      return { idx, label: `${cLat},${cLng}`, centerLat: parseFloat(cLat), centerLng: parseFloat(cLng) };
    });

    // マトリクスデータ
    const cells = [];
    for (const area of areas) {
      for (const hr of hourBuckets) {
        const key = `${area.idx}_${hr}`;
        const d = matrix[key];
        if (d && d.total >= 2) {
          cells.push({
            areaIdx: area.idx,
            hour: hr,
            rate: Math.round(d.occupied / d.total * 100),
            total: d.total,
          });
        }
      }
    }

    return { cells, areas, hours: hourBuckets };
  }

  /** 日次走行トレンド (async) - 1日分の距離・速度統計 */
  async function getDailyTrend(dateStr) {
    const log = await getLogForDate(dateStr);
    if (log.length < 2) return { date: dateStr, distance: 0, avgSpeed: 0, maxSpeed: 0, points: log.length, duration: 0 };

    let totalDist = 0;
    let maxSpd = 0;
    let spdSum = 0;
    let spdCount = 0;

    for (let i = 1; i < log.length; i++) {
      const prev = log[i - 1];
      const curr = log[i];
      totalDist += _haversine(prev.lat, prev.lng, curr.lat, curr.lng);
      if (curr.spd != null && curr.spd >= 0) {
        spdSum += curr.spd;
        spdCount++;
        if (curr.spd > maxSpd) maxSpd = curr.spd;
      }
    }

    const firstT = new Date(log[0].t).getTime();
    const lastT = new Date(log[log.length - 1].t).getTime();
    const durationMin = Math.round((lastT - firstT) / 60000);

    return {
      date: dateStr,
      distance: Math.round(totalDist),            // meters
      distanceKm: Math.round(totalDist / 100) / 10, // km (1桁)
      avgSpeed: spdCount > 0 ? Math.round(spdSum / spdCount * 3.6 * 10) / 10 : 0, // km/h
      maxSpeed: Math.round(maxSpd * 3.6 * 10) / 10,  // km/h
      points: log.length,
      duration: durationMin,  // minutes
    };
  }

  /** 全日次トレンド取得 (async) */
  async function getAllDailyTrends() {
    const dates = await getLogDates();
    const trends = [];
    for (const d of dates) {
      trends.push(await getDailyTrend(d));
    }
    return trends; // 降順（最新が先頭）
  }

  /** プレイバック用トラックデータ (async) - 分類済み + 累積距離 */
  async function getTrackData(dateStr) {
    const classified = await classifyEntries(dateStr);
    if (classified.length === 0) return [];

    let cumDist = 0;
    return classified.map((p, i) => {
      if (i > 0) {
        cumDist += _haversine(classified[i - 1].lat, classified[i - 1].lng, p.lat, p.lng);
      }
      return { ...p, distM: Math.round(cumDist), index: i };
    });
  }

  /** 待機場所のカテゴリ分類（具体的な施設名を返す） */
  function _classifyStandbyCategory(lat, lng) {
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    if (!locs) return { category: 'other', categoryLabel: 'その他', nearbyName: null };

    // 駅チェック
    if (locs.station) {
      const d = _haversine(lat, lng, locs.station.lat, locs.station.lng);
      if (d <= 300) return { category: 'station', categoryLabel: locs.station.name, nearbyName: locs.station.name };
    }

    // 病院チェック（具体的な病院名を表示）
    if (locs.hospitalSchedules) {
      let bestHosp = null;
      let bestDist = Infinity;
      for (const h of locs.hospitalSchedules) {
        const d = _haversine(lat, lng, h.lat, h.lng);
        if (d <= 300 && d < bestDist) { bestHosp = h; bestDist = d; }
      }
      if (bestHosp) return { category: 'hospital', categoryLabel: bestHosp.name, nearbyName: bestHosp.name };
    }

    // ホテルチェック（具体的なホテル名を表示）
    if (locs.hotels) {
      let bestHotel = null;
      let bestDist = Infinity;
      for (const h of locs.hotels) {
        const d = _haversine(lat, lng, h.lat, h.lng);
        if (d <= 200 && d < bestDist) { bestHotel = h; bestDist = d; }
      }
      if (bestHotel) return { category: 'hotel', categoryLabel: bestHotel.name, nearbyName: bestHotel.name };
    }

    // 待機スポットチェック（イオン等、具体名）
    if (locs.waitingSpots) {
      let bestSpot = null;
      let bestDist = Infinity;
      for (const s of locs.waitingSpots) {
        const d = _haversine(lat, lng, s.lat, s.lng);
        if (d <= 300 && d < bestDist) { bestSpot = s; bestDist = d; }
      }
      if (bestSpot) return { category: 'spot', categoryLabel: bestSpot.name, nearbyName: bestSpot.name };
    }

    return { category: 'other', categoryLabel: 'その他', nearbyName: null };
  }

  /** 待機クラスターを確定するヘルパー */
  function _finalizeStandby(points, startIdx, endIdx) {
    if (startIdx > endIdx || points.length === 0) return null;
    const cluster = points.slice(startIdx, endIdx + 1);
    const startTime = new Date(cluster[0].t).getTime();
    const endTime = new Date(cluster[cluster.length - 1].t).getTime();
    const durationMin = (endTime - startTime) / 60000;
    if (durationMin < 3) return null; // 3分未満は破棄
    const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
    const lng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length;
    // カテゴリ分類を自動付与
    const catInfo = _classifyStandbyCategory(lat, lng);
    return { startTime, endTime, durationMin: Math.round(durationMin * 10) / 10, lat, lng, pointCount: cluster.length, ...catInfo };
  }

  /** GPS待機期間自動検出 (async) */
  async function getStandbyPeriods(dateStr) {
    const classified = await classifyEntries(dateStr);
    if (classified.length === 0) return [];

    const RADIUS_M = 50;
    const GAP_MS = 60000; // 60秒のタイムギャップでリセット
    const periods = [];
    let anchorIdx = -1;

    for (let i = 0; i < classified.length; i++) {
      const p = classified[i];
      // 実車中は即リセット
      if (p.status === 'occupied') {
        if (anchorIdx >= 0) {
          const result = _finalizeStandby(classified, anchorIdx, i - 1);
          if (result) periods.push(result);
        }
        anchorIdx = -1;
        continue;
      }
      // 空車ポイント
      if (anchorIdx < 0) {
        anchorIdx = i;
        continue;
      }
      // タイムギャップチェック
      const prevTime = new Date(classified[i - 1].t).getTime();
      const currTime = new Date(p.t).getTime();
      if (currTime - prevTime > GAP_MS) {
        const result = _finalizeStandby(classified, anchorIdx, i - 1);
        if (result) periods.push(result);
        anchorIdx = i;
        continue;
      }
      // 距離チェック（アンカーからの距離）
      const anchor = classified[anchorIdx];
      const dist = _haversine(anchor.lat, anchor.lng, p.lat, p.lng);
      if (dist > RADIUS_M) {
        const result = _finalizeStandby(classified, anchorIdx, i - 1);
        if (result) periods.push(result);
        anchorIdx = i;
      }
    }
    // 末尾処理
    if (anchorIdx >= 0) {
      const result = _finalizeStandby(classified, anchorIdx, classified.length - 1);
      if (result) periods.push(result);
    }
    return periods;
  }

  /** GPSキャッシュ天気を公開（10分以内のキャッシュを返す、古い/未取得はnull） */
  function getCurrentWeather() {
    if (!_weatherCache) return null;
    if (Date.now() - _weatherCache.ts > 600000) return null; // 10分超は古い
    return { weather: _weatherCache.w, temperature: _weatherCache.tp, weatherCode: _weatherCache.wc };
  }

  /** GPS天気トレンド: GPSポイントのw/tpフィールドを時間帯別に集約 */
  async function getWeatherTrend(dateStr) {
    const log = await getLogForDate(dateStr);
    if (log.length === 0) return { date: dateStr, hourly: [] };

    const byHour = {};
    log.forEach(p => {
      if (p.w === undefined && p.tp === undefined) return; // 天気データなし
      const hour = new Date(p.t).getHours();
      if (!byHour[hour]) byHour[hour] = { temps: [], weatherCounts: {} };
      if (p.tp != null) byHour[hour].temps.push(p.tp);
      if (p.w) {
        byHour[hour].weatherCounts[p.w] = (byHour[hour].weatherCounts[p.w] || 0) + 1;
      }
    });

    const hourly = [];
    for (let h = 0; h < 24; h++) {
      const data = byHour[h];
      if (!data) continue;
      const avgTemp = data.temps.length > 0 ? Math.round(data.temps.reduce((s, t) => s + t, 0) / data.temps.length * 10) / 10 : null;
      // 主要天気: 最頻出カテゴリ
      let mainWeather = null;
      let maxCount = 0;
      Object.entries(data.weatherCounts).forEach(([w, c]) => {
        if (c > maxCount) { mainWeather = w; maxCount = c; }
      });
      hourly.push({ hour: h, avgTemp, mainWeather, sampleCount: data.temps.length });
    }

    return { date: dateStr, hourly };
  }

  // 時間別天気予報取得（Open-Meteo API、30分キャッシュ）
  let _forecastCache = null;

  // wmoToWeather は共通ユーティリティ _wmoToWeather を使用（重複排除済み）

  async function fetchHourlyForecast() {
    if (_forecastCache && Date.now() - _forecastCache.fetchedAt < 30 * 60 * 1000) {
      return _forecastCache;
    }
    try {
      const pos = _lastKnownPosition || { lat: 43.77, lng: 142.37 };
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat.toFixed(4)}&longitude=${pos.lng.toFixed(4)}&hourly=temperature_2m,weather_code,precipitation,wind_speed_10m&timezone=Asia/Tokyo&forecast_hours=12`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Forecast API error');
      const data = await res.json();
      const hourly = data.hourly || {};
      const times = hourly.time || [];
      const hours = times.map((t, i) => ({
        hour: new Date(t).getHours(),
        temperature: (hourly.temperature_2m || [])[i],
        weatherCode: (hourly.weather_code || [])[i],
        weather: _wmoToWeather((hourly.weather_code || [])[i]),
        precipitation: (hourly.precipitation || [])[i] || 0,
        windSpeed: (hourly.wind_speed_10m || [])[i] || 0,
      }));
      _forecastCache = { hours, fetchedAt: Date.now() };
      return _forecastCache;
    } catch (e) {
      if (window.AppLogger) AppLogger.warn('[fetchHourlyForecast] error:', e);
      if (_forecastCache) return _forecastCache;
      return { hours: [], fetchedAt: Date.now() };
    }
  }

  /** 指定時刻に最も近いGPSログエントリを検索 (async)
   *  @param {string} dateStr - 'YYYY-MM-DD'
   *  @param {number} targetTime - Date.getTime() ミリ秒
   *  @param {number} maxRangeMs - 許容範囲（ミリ秒、デフォルト5分）
   *  @returns {{ lat, lng, acc, t, distance }} | null
   */
  async function findNearestEntry(dateStr, targetTime, maxRangeMs) {
    if (!maxRangeMs) maxRangeMs = 5 * 60 * 1000; // デフォルト5分
    const log = await getLogForDate(dateStr);
    if (log.length === 0) return null;
    let best = null;
    let bestDiff = Infinity;
    for (const entry of log) {
      const diff = Math.abs(new Date(entry.t).getTime() - targetTime);
      if (diff < bestDiff && diff <= maxRangeMs) {
        bestDiff = diff;
        best = entry;
      }
    }
    return best;
  }

  /** 指定座標に最も近い直近GPSログエントリを検索 (async)
   *  地図ピッカーで位置修正する際に、近くのGPSログ座標を候補として返す
   *  @param {string} dateStr - 'YYYY-MM-DD'
   *  @param {number} lat - タップした緯度
   *  @param {number} lng - タップした経度
   *  @param {number} maxDistM - 許容距離（メートル、デフォルト200m）
   *  @param {number} recentMinutes - 直近何分以内のログを検索（デフォルト30分）
   *  @returns {{ lat, lng, acc, t, distance }} | null
   */
  async function findNearestByLocation(dateStr, lat, lng, maxDistM, recentMinutes) {
    if (!maxDistM) maxDistM = 200;
    if (!recentMinutes) recentMinutes = 30;
    const log = await getLogForDate(dateStr);
    if (log.length === 0) return null;
    const now = Date.now();
    const cutoff = now - recentMinutes * 60 * 1000;
    let best = null;
    let bestDist = Infinity;
    for (const entry of log) {
      const entryTime = new Date(entry.t).getTime();
      if (entryTime < cutoff) continue; // 古すぎるエントリは除外
      const dist = _haversine(lat, lng, entry.lat, entry.lng);
      if (dist < bestDist && dist <= maxDistM) {
        bestDist = dist;
        best = { ...entry, distance: Math.round(dist) };
      }
    }
    return best;
  }

  /** 売上記録保存後に乗車/降車イベントをGPSログに記録 */
  async function recordEvent(dateStr, eventType, lat, lng, time, entryId) {
    if (!dateStr || lat == null || lng == null) return;
    const entry = {
      t: time ? new Date(dateStr + 'T' + time + ':00').toISOString() : new Date().toISOString(),
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      acc: null,
      spd: null,
      w: _weatherCache ? _weatherCache.w : null,
      tp: _weatherCache ? _weatherCache.tp : null,
      event: eventType,  // 'pickup' or 'dropoff'
      entryId: entryId || null,
    };
    if (!_buffer[dateStr]) _buffer[dateStr] = [];
    _buffer[dateStr].push(entry);
    await _flush();
  }

  /** 売上記録編集後に乗車/降車イベントをGPSログ上で更新 */
  async function updateEvent(dateStr, entryId, eventType, coords, time) {
    if (!dateStr || !entryId) return;
    // まずバッファをフラッシュしてからIndexedDBのデータのみを操作（二重書き込み防止）
    await _flush();
    const stored = (await _idbGet(dateStr)) || [];
    let changed = false;
    for (const p of stored) {
      if (p.entryId === entryId && p.event === eventType) {
        if (coords && coords.lat != null) {
          p.lat = Math.round(coords.lat * 1e6) / 1e6;
          p.lng = Math.round(coords.lng * 1e6) / 1e6;
        }
        if (time) {
          p.t = new Date(dateStr + 'T' + time + ':00').toISOString();
        }
        changed = true;
      }
    }
    if (changed) {
      await _idbPut(dateStr, stored);
    }
  }

  /** 待機効率分析: 各待機期間の直後に乗車があったかを判定 (async) */
  async function getStandbyEfficiency(dateStr) {
    const periods = await getStandbyPeriods(dateStr);
    if (periods.length === 0) return { periods: [], stats: { total: 0, gotRide: 0, noRide: 0, conversionRate: 0, avgWaitToRide: 0 } };

    const entries = DataService.getEntries();
    const dayEntries = entries.filter(e => e.date === dateStr && e.pickupTime);

    const enriched = periods.map(p => {
      const standbyEnd = p.endTime;
      // 待機終了後15分以内に乗車があれば「待機→乗車成功」とみなす
      let nextRide = null;
      let minGap = Infinity;
      for (const e of dayEntries) {
        const pickupMs = new Date(dateStr + 'T' + e.pickupTime + ':00').getTime();
        const gap = pickupMs - standbyEnd;
        if (gap >= -60000 && gap <= 900000 && gap < minGap) { // -1分〜+15分
          minGap = gap;
          nextRide = e;
        }
      }
      return {
        ...p,
        gotRide: !!nextRide,
        nextRideAmount: nextRide ? (nextRide.amount || 0) : null,
        nextRidePickup: nextRide ? (nextRide.pickup || '') : null,
        nextRideDropoff: nextRide ? (nextRide.dropoff || '') : null,
        nextRideSource: nextRide ? (nextRide.source || '') : null,
        waitToRideMin: nextRide ? Math.round(minGap / 60000 * 10) / 10 : null,
      };
    });

    const gotRideCount = enriched.filter(p => p.gotRide).length;
    const rideWaits = enriched.filter(p => p.gotRide && p.waitToRideMin != null);
    const avgWaitToRide = rideWaits.length > 0 ? Math.round(rideWaits.reduce((s, p) => s + p.waitToRideMin, 0) / rideWaits.length * 10) / 10 : 0;

    return {
      periods: enriched,
      stats: {
        total: periods.length,
        gotRide: gotRideCount,
        noRide: periods.length - gotRideCount,
        conversionRate: periods.length > 0 ? Math.round(gotRideCount / periods.length * 100) : 0,
        avgWaitToRide,
      },
    };
  }

  /** 全日待機集計: 全GPSログ日の待機データをカテゴリ別・場所別に集約 (async) */
  async function getStandbyAllDaysSummary() {
    const dates = await getLogDates();
    const allPeriods = [];
    for (const d of dates) {
      const eff = await getStandbyEfficiency(d);
      eff.periods.forEach(p => allPeriods.push({ ...p, date: d }));
    }
    if (allPeriods.length === 0) return { byCategory: [], byPlace: [], overall: null };

    // カテゴリ別集計
    const catMap = {};
    allPeriods.forEach(p => {
      const key = p.category || 'other';
      const catLabelMap = { station: '駅', hospital: '病院', hotel: 'ホテル', spot: '待機スポット', other: 'その他' };
      if (!catMap[key]) catMap[key] = { category: key, label: catLabelMap[key] || 'その他', count: 0, totalMin: 0, gotRide: 0, totalAmount: 0 };
      catMap[key].count++;
      catMap[key].totalMin += p.durationMin;
      if (p.gotRide) {
        catMap[key].gotRide++;
        catMap[key].totalAmount += (p.nextRideAmount || 0);
      }
    });
    const byCategory = Object.values(catMap).map(c => ({
      ...c,
      avgMin: Math.round(c.totalMin / c.count * 10) / 10,
      conversionRate: c.count > 0 ? Math.round(c.gotRide / c.count * 100) : 0,
      avgAmount: c.gotRide > 0 ? Math.round(c.totalAmount / c.gotRide) : 0,
    })).sort((a, b) => b.count - a.count);

    // 場所別集計（nearbyName優先）
    const placeMap = {};
    for (const p of allPeriods) {
      let name = p.nearbyName;
      if (!name && window.TaxiApp && TaxiApp.utils.matchKnownPlace) {
        name = TaxiApp.utils.matchKnownPlace(p.lat, p.lng);
      }
      if (!name) name = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
      if (!placeMap[name]) placeMap[name] = { name, category: p.category, categoryLabel: p.categoryLabel, count: 0, totalMin: 0, gotRide: 0, totalAmount: 0 };
      placeMap[name].count++;
      placeMap[name].totalMin += p.durationMin;
      if (p.gotRide) {
        placeMap[name].gotRide++;
        placeMap[name].totalAmount += (p.nextRideAmount || 0);
      }
    }
    const byPlace = Object.values(placeMap).map(pl => ({
      ...pl,
      avgMin: Math.round(pl.totalMin / pl.count * 10) / 10,
      conversionRate: pl.count > 0 ? Math.round(pl.gotRide / pl.count * 100) : 0,
      avgAmount: pl.gotRide > 0 ? Math.round(pl.totalAmount / pl.gotRide) : 0,
    })).sort((a, b) => b.count - a.count);

    // 全体統計
    const totalGotRide = allPeriods.filter(p => p.gotRide).length;
    const totalMin = allPeriods.reduce((s, p) => s + p.durationMin, 0);
    const overall = {
      totalPeriods: allPeriods.length,
      totalDays: dates.length,
      totalMin: Math.round(totalMin),
      avgMin: Math.round(totalMin / allPeriods.length * 10) / 10,
      gotRide: totalGotRide,
      conversionRate: allPeriods.length > 0 ? Math.round(totalGotRide / allPeriods.length * 100) : 0,
    };

    return { byCategory, byPlace, overall };
  }

  /**
   * 待機場所別の詳細パフォーマンス分析
   * - 場所別: 平均待ち時間、平均売上、時給効率、乗車率
   * - 時間帯別: 各場所の0-23時の待ち時間・売上の分布
   * - 流しとの比較: 待ち時間が長い場所は流しを推奨
   */
  async function getStandbyLocationAnalysis() {
    const dates = await getLogDates();
    const allPeriods = [];
    for (const d of dates) {
      const eff = await getStandbyEfficiency(d);
      eff.periods.forEach(p => allPeriods.push({ ...p, date: d }));
    }
    if (allPeriods.length === 0) return { locations: [], recommendation: null };

    // 売上データから流しの実績を集計
    const entries = DataService.getEntries();
    const cruisingEntries = entries.filter(e => e.source === '流し' && e.amount > 0);
    const cruisingAvgFare = cruisingEntries.length > 0
      ? Math.round(cruisingEntries.reduce((s, e) => s + (e.amount || 0), 0) / cruisingEntries.length)
      : 0;

    // 場所名の解決
    function resolveName(p) {
      if (p.nearbyName) return p.nearbyName;
      if (window.TaxiApp && TaxiApp.utils.matchKnownPlace) {
        const n = TaxiApp.utils.matchKnownPlace(p.lat, p.lng);
        if (n) return n;
      }
      return null;
    }

    // 場所別に集計
    const locMap = {};
    for (const p of allPeriods) {
      const name = resolveName(p);
      if (!name) continue; // 不明な場所はスキップ
      if (!locMap[name]) {
        locMap[name] = {
          name, category: p.category, categoryLabel: p.categoryLabel,
          lat: p.lat, lng: p.lng,
          periods: [],
        };
      }
      locMap[name].periods.push(p);
    }

    // 各場所のパフォーマンスを算出
    const locations = Object.values(locMap).map(loc => {
      const total = loc.periods.length;
      const rides = loc.periods.filter(p => p.gotRide);
      const noRides = total - rides.length;
      const conversionRate = total > 0 ? Math.round(rides.length / total * 100) : 0;

      // 待ち時間（全待機の平均）
      const totalWaitMin = loc.periods.reduce((s, p) => s + p.durationMin, 0);
      const avgWaitMin = total > 0 ? Math.round(totalWaitMin / total * 10) / 10 : 0;

      // 売上（乗車成功時のみの平均）
      const totalAmount = rides.reduce((s, p) => s + (p.nextRideAmount || 0), 0);
      const avgFare = rides.length > 0 ? Math.round(totalAmount / rides.length) : 0;

      // 時給効率 = (乗車率 × 平均売上) / (平均待ち時間 + 乗車時間15分想定) × 60
      const cycleMin = avgWaitMin + 15;
      const hourlyEfficiency = cycleMin > 0 ? Math.round((conversionRate / 100) * avgFare / cycleMin * 60) : 0;

      // 時間帯別分析（0-23時）
      const hourly = {};
      for (let h = 0; h < 24; h++) {
        const hPeriods = loc.periods.filter(p => {
          const startH = new Date(p.startTime).getHours();
          return startH === h;
        });
        if (hPeriods.length === 0) continue;
        const hRides = hPeriods.filter(p => p.gotRide);
        const hTotalWait = hPeriods.reduce((s, p) => s + p.durationMin, 0);
        const hTotalAmount = hRides.reduce((s, p) => s + (p.nextRideAmount || 0), 0);
        hourly[h] = {
          hour: h,
          count: hPeriods.length,
          avgWaitMin: Math.round(hTotalWait / hPeriods.length * 10) / 10,
          rides: hRides.length,
          conversionRate: Math.round(hRides.length / hPeriods.length * 100),
          avgFare: hRides.length > 0 ? Math.round(hTotalAmount / hRides.length) : 0,
        };
      }

      // 推奨判定
      let verdict = 'good'; // good / caution / avoid
      if (avgWaitMin >= 60 || conversionRate < 20) verdict = 'avoid';
      else if (avgWaitMin >= 40 || conversionRate < 40) verdict = 'caution';

      return {
        name: loc.name, category: loc.category, categoryLabel: loc.categoryLabel,
        lat: loc.lat, lng: loc.lng,
        totalStandbys: total, rideCount: rides.length, noRideCount: noRides,
        conversionRate, avgWaitMin, avgFare, hourlyEfficiency,
        totalWaitMin: Math.round(totalWaitMin),
        totalAmount,
        hourly, verdict,
      };
    });

    // 時給効率でソート
    locations.sort((a, b) => b.hourlyEfficiency - a.hourlyEfficiency);

    // ベスト・ワースト
    const best = locations.length > 0 ? locations[0] : null;
    const worst = locations.length > 1 ? locations[locations.length - 1] : null;

    // 全体の平均待ち時間
    const overallAvgWait = locations.length > 0
      ? Math.round(locations.reduce((s, l) => s + l.avgWaitMin * l.totalStandbys, 0) / allPeriods.length * 10) / 10
      : 0;

    return {
      locations,
      cruisingAvgFare,
      recommendation: {
        best: best ? best.name : '---',
        worst: worst ? worst.name : '---',
        overallAvgWait,
        shouldCruiseThreshold: 60, // 60分以上で流し推奨
      },
    };
  }

  return {
    maybeRecord,
    getLogForDate,
    getLogDates,
    classifyEntries,
    getDaySummary,
    deleteDate,
    clearAll,
    cleanup,
    exportCsv,
    // 天気
    getCurrentWeather,
    getWeatherTrend,
    startWeatherPolling,
    stopWeatherPolling,
    fetchHourlyForecast,
    // 分析API
    getVacantHeatmapData,
    getAreaTimeMatrix,
    getDailyTrend,
    getAllDailyTrends,
    getTrackData,
    getStandbyPeriods,
    getStandbyEfficiency,
    getStandbyAllDaysSummary,
    getStandbyLocationAnalysis,
    flushRealtimeStandby,
    // 座標検索API
    findNearestEntry,
    findNearestByLocation,
    // 乗車/降車イベント記録
    recordEvent,
    updateEvent,
  };
})();
})();
