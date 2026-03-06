(function() {
// dataService.js - データ処理層（ビジネスロジック）
//
// 売上データの集計・分析・エクスポートを一元管理するサービス層。
// Dashboard, Analytics, Revenue の全ページがこのサービスを通じてデータにアクセスする。

window.DataService = (() => {
  // ============================================================
  // データ取得（キャッシュ付き）
  // ============================================================
  let _entriesCache = null;
  let _entriesCacheRaw = null;
  let _rivalCache = null;
  let _rivalCacheRaw = null;
  let _gatheringCache = null;
  let _gatheringCacheRaw = null;

  function getEntries() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA);
      if (saved === _entriesCacheRaw && _entriesCache !== null) return _entriesCache;
      const entries = saved ? JSON.parse(saved) : [];
      entries.forEach(e => {
        if (e.date) {
          const info = JapaneseHolidays.getDateInfo(e.date);
          e.dayOfWeek = info.dayOfWeek;
          e.holiday = info.holiday || '';
        }
      });
      _entriesCacheRaw = saved;
      _entriesCache = _sortByDateTimeDesc(entries.filter(e => !e.noPassenger), 'date', 'dropoffTime');
      return _entriesCache;
    } catch {
      return [];
    }
  }

  function _sortByDateTimeDesc(entries, dateKey, timeKey) {
    return entries.sort((a, b) => {
      const dateA = a[dateKey] || '';
      const dateB = b[dateKey] || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      const timeA = a[timeKey] || '';
      const timeB = b[timeKey] || '';
      if (timeA !== timeB) return timeB.localeCompare(timeA);
      const tsA = a.timestamp || '';
      const tsB = b.timestamp || '';
      return tsB.localeCompare(tsA);
    });
  }

  function saveEntries(entries) {
    try {
      const sorted = _sortByDateTimeDesc([...entries], 'date', 'dropoffTime');
      const json = JSON.stringify(sorted);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA, json);
      _entriesCacheRaw = json;
      _entriesCache = sorted;
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        AppLogger.error('ストレージ容量が不足しています。不要なデータを削除してください。');
      } else {
        AppLogger.error('売上データの保存に失敗しました', e.message);
      }
      return false;
    }
  }

  // 既存データにランドマーク情報を補完（pickup/dropoffは住所のまま維持）
  function applyPlaceAliasesToExistingData() {
    const alias = TaxiApp.utils.applyPlaceAlias;
    const matchKnown = TaxiApp.utils.matchKnownPlace;
    let changed = false;

    // 売上記録: ランドマークフィールドが未設定の場合に補完
    const entries = getEntries();
    entries.forEach(e => {
      if (!e.pickupLandmark && e.pickupCoords && e.pickupCoords.lat) {
        const known = matchKnown(e.pickupCoords.lat, e.pickupCoords.lng);
        if (known) { e.pickupLandmark = known; changed = true; }
      }
      if (!e.pickupLandmark && e.pickup) {
        const aliased = alias(e.pickup);
        if (aliased !== e.pickup) { e.pickupLandmark = aliased; changed = true; }
      }
      if (!e.dropoffLandmark && e.dropoffCoords && e.dropoffCoords.lat) {
        const known = matchKnown(e.dropoffCoords.lat, e.dropoffCoords.lng);
        if (known) { e.dropoffLandmark = known; changed = true; }
      }
      if (!e.dropoffLandmark && e.dropoff) {
        const aliased = alias(e.dropoff);
        if (aliased !== e.dropoff) { e.dropoffLandmark = aliased; changed = true; }
      }
    });
    if (changed) {
      saveEntries(entries);
      AppLogger.info(`ランドマーク情報を既存売上データに補完しました`);
    }

    // 他社乗車記録: ランドマーク情報を補完
    let rivalChanged = false;
    const rivals = getRivalEntries();
    rivals.forEach(e => {
      if (!e.locationLandmark) {
        if (e.locationCoords && e.locationCoords.lat) {
          const known = matchKnown(e.locationCoords.lat, e.locationCoords.lng);
          if (known) { e.locationLandmark = known; rivalChanged = true; return; }
        }
        const newLoc = alias(e.location);
        if (newLoc !== e.location) { e.locationLandmark = newLoc; rivalChanged = true; }
      }
    });
    if (rivalChanged) {
      saveRivalEntries(rivals);
      AppLogger.info(`ランドマーク情報を既存他社乗車データに補完しました`);
    }
  }

  // ============================================================
  // ファイル保存・復元（売上データフォルダ）
  // ============================================================
  let _dirHandle = null; // File System Access API用

  // ── IndexedDB でフォルダハンドルを永続化 ──
  const _DB_NAME = 'taxi_app_fs';
  const _DB_STORE = 'handles';
  const _DB_KEY = 'saveDir';

  function _openHandleDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(_DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(_DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function _persistHandle(handle) {
    try {
      const db = await _openHandleDB();
      const tx = db.transaction(_DB_STORE, 'readwrite');
      tx.objectStore(_DB_STORE).put(handle, _DB_KEY);
      await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
      db.close();
    } catch (e) {
      AppLogger.warn('ハンドル永続化失敗: ' + e.message);
    }
  }

  async function _restoreHandle() {
    try {
      const db = await _openHandleDB();
      const tx = db.transaction(_DB_STORE, 'readonly');
      const req = tx.objectStore(_DB_STORE).get(_DB_KEY);
      const handle = await new Promise((r, j) => { req.onsuccess = () => r(req.result); req.onerror = j; });
      db.close();
      if (handle) {
        _dirHandle = handle;
        AppLogger.info('保存先フォルダを自動復元: ' + handle.name);
      }
    } catch (e) {
      AppLogger.warn('ハンドル復元失敗: ' + e.message);
    }
  }

  // 起動時に自動復元（Promiseを保持し、保存時にawait）
  const _handleReady = _restoreHandle();

  // サブフォルダのハンドルを取得（なければ自動作成）
  async function _getSubFolder(subName) {
    if (!_dirHandle) return null;
    try {
      const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const req = await _dirHandle.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') return null;
      }
      return await _dirHandle.getDirectoryHandle(subName, { create: true });
    } catch (e) {
      AppLogger.warn(`サブフォルダ取得失敗 (${subName}): ` + e.message);
      return null;
    }
  }

  // File System Access APIでサブフォルダにJSONを直接保存
  async function _saveToSubFolder(subName, fileName, entries, version) {
    try {
      const subDir = await _getSubFolder(subName);
      if (!subDir) return false;
      const fileHandle = await subDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      const data = JSON.stringify({ version: version, exportedAt: new Date().toISOString(), count: entries.length, entries: entries }, null, 2);
      await writable.write(data);
      await writable.close();
      AppLogger.info(`ファイル保存完了: ${subName}/${fileName} (${entries.length}件)`);
      return true;
    } catch (e) {
      AppLogger.warn(`フォルダ保存失敗 (${subName}): ` + e.message);
      return false;
    }
  }

  // ダウンロード方式でJSON保存（フォールバック）
  function _downloadBackup(entries) {
    try {
      const dateStr = getLocalDateString();
      const data = JSON.stringify({ version: APP_CONSTANTS.VERSION, exportedAt: new Date().toISOString(), count: entries.length, entries: entries }, null, 2);
      const blob = new Blob([data], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `売上記録_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      AppLogger.info(`バックアップダウンロード: ${entries.length}件`);
      return true;
    } catch (e) {
      AppLogger.warn('バックアップ失敗: ' + e.message);
      return false;
    }
  }

  function _downloadRivalBackup(entries) {
    try {
      const dateStr = getLocalDateString();
      const data = JSON.stringify({ version: APP_CONSTANTS.VERSION, exportedAt: new Date().toISOString(), count: entries.length, entries: entries }, null, 2);
      const blob = new Blob([data], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `他社乗車記録_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      AppLogger.info(`他社乗車バックアップダウンロード: ${entries.length}件`);
      return true;
    } catch (e) {
      AppLogger.warn('他社乗車バックアップ失敗: ' + e.message);
      return false;
    }
  }

  // 売上記録の自動保存（サブフォルダ「売上記録」）
  async function autoSaveToFile() {
    await _handleReady;
    if (!_dirHandle) return;
    const entries = getEntries();
    if (entries.length === 0) return;
    const dateStr = getLocalDateString();
    await _saveToSubFolder('売上記録', `売上記録_${dateStr}.json`, entries, APP_CONSTANTS.VERSION);
  }

  // 他社乗車記録の自動保存（サブフォルダ「他社乗車」）
  async function autoSaveRivalToFile() {
    await _handleReady;
    if (!_dirHandle) return;
    const entries = getRivalEntries();
    if (entries.length === 0) return;
    const dateStr = getLocalDateString();
    await _saveToSubFolder('他社乗車', `他社乗車記録_${dateStr}.json`, entries, APP_CONSTANTS.VERSION);
  }

  // 手動JSON保存（ボタン押下時）— フォルダ未設定時はダウンロード
  async function manualSaveToFile() {
    await _handleReady;
    const entries = getEntries();
    if (entries.length === 0) return;
    if (_dirHandle) {
      const dateStr = getLocalDateString();
      const ok = await _saveToSubFolder('売上記録', `売上記録_${dateStr}.json`, entries, APP_CONSTANTS.VERSION);
      if (ok) return;
    }
    _downloadBackup(entries);
  }

  async function manualSaveRivalToFile() {
    await _handleReady;
    const entries = getRivalEntries();
    if (entries.length === 0) return;
    if (_dirHandle) {
      const dateStr = getLocalDateString();
      const ok = await _saveToSubFolder('他社乗車', `他社乗車記録_${dateStr}.json`, entries, APP_CONSTANTS.VERSION);
      if (ok) return;
    }
    _downloadRivalBackup(entries);
  }

  // 保存先フォルダを選択（File System Access API）
  async function selectSaveFolder() {
    if (!window.showDirectoryPicker) {
      return { success: false, message: 'このブラウザではフォルダ直接保存がサポートされていません。ダウンロード方式で保存します。' };
    }
    try {
      _dirHandle = await window.showDirectoryPicker({ id: 'taxi-save', mode: 'readwrite', startIn: 'documents' });
      await _persistHandle(_dirHandle);
      AppLogger.info('保存先フォルダを設定・永続化: ' + _dirHandle.name)
      return { success: true, folderName: _dirHandle.name };
    } catch (e) {
      if (e.name === 'AbortError') return { success: false, message: 'フォルダ選択がキャンセルされました' };
      return { success: false, message: 'フォルダ選択に失敗: ' + e.message };
    }
  }

  // JSONファイルから復元
  // インポートデータのサニタイズ
  const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_STRING_LENGTH = 500;
  function _sanitizeEntry(entry) {
    const stripHtml = (s) => typeof s === 'string' ? s.replace(/<[^>]*>/g, '').slice(0, MAX_STRING_LENGTH) : '';
    return {
      id: stripHtml(entry.id),
      amount: typeof entry.amount === 'number' && isFinite(entry.amount) ? Math.max(0, Math.min(entry.amount, 1000000)) : 0,
      date: typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : '',
      dayOfWeek: stripHtml(entry.dayOfWeek),
      holiday: stripHtml(entry.holiday),
      weather: stripHtml(entry.weather),
      pickup: stripHtml(entry.pickup),
      pickupTime: stripHtml(entry.pickupTime),
      dropoff: stripHtml(entry.dropoff),
      dropoffTime: stripHtml(entry.dropoffTime),
      passengers: stripHtml(entry.passengers),
      gender: stripHtml(entry.gender),
      purpose: stripHtml(entry.purpose),
      memo: stripHtml(entry.memo),
      source: stripHtml(entry.source),
      pickupCoords: entry.pickupCoords && typeof entry.pickupCoords.lat === 'number' ? { lat: entry.pickupCoords.lat, lng: entry.pickupCoords.lng } : null,
      dropoffCoords: entry.dropoffCoords && typeof entry.dropoffCoords.lat === 'number' ? { lat: entry.dropoffCoords.lat, lng: entry.dropoffCoords.lng } : null,
      pickupLandmark: stripHtml(entry.pickupLandmark),
      dropoffLandmark: stripHtml(entry.dropoffLandmark),
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp.slice(0, 30) : new Date().toISOString(),
    };
  }

  async function importFromFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { resolve({ success: false, message: 'ファイルが選択されませんでした' }); return; }
        if (file.size > MAX_IMPORT_FILE_SIZE) { resolve({ success: false, message: 'ファイルサイズが10MBを超えています' }); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            let entries = [];
            if (Array.isArray(data)) {
              entries = data;
            } else if (data.entries && Array.isArray(data.entries)) {
              entries = data.entries;
            } else {
              resolve({ success: false, message: 'ファイル形式が正しくありません' }); return;
            }
            // 既存データとマージ（IDで重複排除 + サニタイズ）
            const existing = getEntries();
            const existingIds = new Set(existing.map(e => e.id));
            let newCount = 0;
            entries.forEach(entry => {
              const sanitized = _sanitizeEntry(entry);
              if (!existingIds.has(sanitized.id) && sanitized.amount > 0) {
                existing.push(sanitized);
                newCount++;
              }
            });
            existing.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            saveEntries(existing);
            AppLogger.info(`ファイルから復元: ${newCount}件追加 (合計${existing.length}件)`);
            resolve({ success: true, message: `${newCount}件の新しい記録を復元しました（合計${existing.length}件）` });
          } catch (err) {
            resolve({ success: false, message: 'ファイルの読み込みに失敗: ' + err.message });
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // 保存フォルダが設定済みかどうか
  function hasSaveFolder() {
    return !!_dirHandle;
  }

  // ============================================================
  // クラウド同期（Vercel Blob Storage）
  // ============================================================
  function _getSyncSecret() {
    return (localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET) || '').trim();
  }

  const ALLOWED_SYNC_TYPES = ['revenue', 'rival', 'workstatus', 'gathering', 'shifts', 'breaks'];

  async function _syncToCloud(type, entries, _retryCount) {
    if (!ALLOWED_SYNC_TYPES.includes(type)) { AppLogger.warn('不正な同期タイプ: ' + type); return; }
    const retryCount = _retryCount || 0;
    const MAX_RETRIES = 2;
    try {
      const secret = _getSyncSecret();
      const params = new URLSearchParams({ type });
      const res = await fetch(`/api/data?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'Authorization': `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({
          version: APP_CONSTANTS.VERSION,
          syncedAt: new Date().toISOString(),
          count: entries.length,
          entries,
        }),
      });
      if (res.ok) {
        AppLogger.info(`クラウド同期完了: ${type} (${entries.length}件)`);
      } else if (res.status >= 500 && retryCount < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, retryCount);
        setTimeout(() => _syncToCloud(type, entries, retryCount + 1), delay);
      } else {
        AppLogger.warn(`クラウド同期失敗: ${res.status}`);
      }
    } catch (e) {
      if (retryCount < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, retryCount);
        setTimeout(() => _syncToCloud(type, entries, retryCount + 1), delay);
      } else {
        AppLogger.warn('クラウド同期エラー: ' + e.message);
      }
    }
  }

  async function loadFromCloud(type) {
    if (!ALLOWED_SYNC_TYPES.includes(type)) { AppLogger.warn('不正な同期タイプ: ' + type); return null; }
    try {
      const params = new URLSearchParams({ type });
      const res = await fetch(`/api/data?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data !== 'object') return null;
      return Array.isArray(data.entries) ? data.entries : [];
    } catch (e) {
      AppLogger.warn('クラウド読込エラー: ' + e.message);
      return null;
    }
  }

  async function syncFromCloud(type) {
    const cloudEntries = await loadFromCloud(type);
    if (!cloudEntries || cloudEntries.length === 0) return { merged: 0 };

    const local = type === 'revenue' ? getEntries() : type === 'gathering' ? getGatheringMemos() : getRivalEntries();
    const localIds = new Set(local.map(e => e.id));
    let merged = 0;
    cloudEntries.forEach(entry => {
      if (!localIds.has(entry.id)) {
        local.push(entry);
        merged++;
      }
    });
    if (merged > 0) {
      local.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      if (type === 'revenue') saveEntries(local);
      else if (type === 'gathering') saveGatheringMemos(local);
      else saveRivalEntries(local);
    }
    return { merged, total: local.length };
  }

  async function autoSync() {
    try {
      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        syncFromCloud('revenue'),
        syncFromCloud('rival'),
        syncWorkStatusFromCloud(),
        syncFromCloud('gathering'),
        syncShiftsFromCloud(),
        syncBreaksFromCloud(),
      ]);
      const totalMerged = (r1.merged || 0) + (r2.merged || 0) + (r4.merged || 0) + (r5.merged || 0) + (r6.merged || 0);
      if (totalMerged > 0 || r3.merged) {
        AppLogger.info(`自動同期完了: 売上+${r1.merged}件, 他社+${r2.merged}件, 集客+${r4.merged}件, シフト+${r5.merged}件, 休憩+${r6.merged}件${r3.merged ? ', 勤務状態更新あり' : ''}`);
      } else {
        AppLogger.debug('自動同期: 新規データなし');
      }
      return { revenue: r1, rival: r2, workStatus: r3, gathering: r4, shifts: r5, breaks: r6 };
    } catch (e) {
      AppLogger.warn('自動同期エラー: ' + e.message);
      return null;
    }
  }

  // ============================================================
  // 勤務状態クラウド同期
  // ============================================================
  async function syncWorkStatusToCloud(workStatus) {
    try {
      const secret = _getSyncSecret();
      if (!secret) return;
      const params = new URLSearchParams({ type: 'workstatus' });
      const res = await fetch(`/api/data?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify({
          version: APP_CONSTANTS.VERSION,
          syncedAt: new Date().toISOString(),
          workStatus,
        }),
      });
      if (res.ok) {
        AppLogger.info('勤務状態クラウド同期完了');
      } else {
        AppLogger.warn(`勤務状態クラウド同期失敗: ${res.status}`);
      }
    } catch (e) {
      AppLogger.warn('勤務状態クラウド同期エラー: ' + e.message);
    }
  }

  async function loadWorkStatusFromCloud() {
    try {
      const params = new URLSearchParams({ type: 'workstatus' });
      const res = await fetch(`/api/data?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data !== 'object') return null;
      return data.workStatus || null;
    } catch (e) {
      AppLogger.warn('勤務状態クラウド読込エラー: ' + e.message);
      return null;
    }
  }

  async function syncWorkStatusFromCloud() {
    const cloudStatus = await loadWorkStatusFromCloud();
    if (!cloudStatus || typeof cloudStatus !== 'object') return { merged: false };

    const local = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.WORK_STATUS) || '{}');
    // クラウドのデータをローカルにマージ（クラウド側を優先、ローカルのみのキーは保持）
    const merged = { ...local, ...cloudStatus };
    const changed = JSON.stringify(merged) !== JSON.stringify(local);
    if (changed) {
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.WORK_STATUS, JSON.stringify(merged));
      AppLogger.info('勤務状態クラウド同期: ローカルを更新しました');
    }
    return { merged: changed, data: merged };
  }

  // ============================================================
  // シフト・休憩クラウド同期
  // ============================================================
  async function syncShiftsToCloud() {
    try {
      const secret = _getSyncSecret();
      if (!secret) return;
      const entries = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      await _syncToCloud('shifts', entries);
    } catch (e) {
      AppLogger.warn('シフトクラウド同期エラー: ' + e.message);
    }
  }

  async function syncBreaksToCloud() {
    try {
      const secret = _getSyncSecret();
      if (!secret) return;
      const entries = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      await _syncToCloud('breaks', entries);
    } catch (e) {
      AppLogger.warn('休憩クラウド同期エラー: ' + e.message);
    }
  }

  async function syncShiftsFromCloud() {
    const cloudEntries = await loadFromCloud('shifts');
    if (!cloudEntries || cloudEntries.length === 0) return { merged: 0 };
    const local = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
    const localIds = new Set(local.map(e => e.id));
    let merged = 0;
    cloudEntries.forEach(entry => {
      if (!localIds.has(entry.id)) {
        local.push(entry);
        merged++;
      } else {
        // 既存エントリは最新で上書き（編集反映）
        const idx = local.findIndex(e => e.id === entry.id);
        if (idx !== -1) {
          const localTime = new Date(local[idx].startTime || 0).getTime();
          const cloudTime = new Date(entry.startTime || 0).getTime();
          if (cloudTime !== localTime || local[idx].endTime !== entry.endTime) {
            local[idx] = entry;
          }
        }
      }
    });
    if (merged > 0 || cloudEntries.length > 0) {
      local.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(local));
    }
    return { merged };
  }

  async function syncBreaksFromCloud() {
    const cloudEntries = await loadFromCloud('breaks');
    if (!cloudEntries || cloudEntries.length === 0) return { merged: 0 };
    const local = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
    const localIds = new Set(local.map(e => e.id));
    let merged = 0;
    cloudEntries.forEach(entry => {
      if (!localIds.has(entry.id)) {
        local.push(entry);
        merged++;
      } else {
        const idx = local.findIndex(e => e.id === entry.id);
        if (idx !== -1) {
          const localTime = new Date(local[idx].startTime || 0).getTime();
          const cloudTime = new Date(entry.startTime || 0).getTime();
          if (cloudTime !== localTime || local[idx].endTime !== entry.endTime) {
            local[idx] = entry;
          }
        }
      }
    });
    if (merged > 0 || cloudEntries.length > 0) {
      local.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(local));
    }
    return { merged };
  }


  // ============================================================
  // 日付ヘルパー
  // ============================================================
  function toDateStr(isoString) {
    return isoString ? isoString.split('T')[0] : '';
  }

  function toHour(isoString) {
    return isoString ? new Date(isoString).getHours() : 0;
  }

  function getDayOfWeek(isoString) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[new Date(isoString).getDay()];
  }

  function getDayOfWeekIndex(isoString) {
    return new Date(isoString).getDay();
  }

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return toDateStr(d.toISOString());
  }

  function getMonthStr(isoString) {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // ============================================================
  // 本日のサマリー（Dashboard用）
  // ============================================================
  function getTodaySummary() {
    const entries = getEntries();
    const today = toDateStr(new Date().toISOString());
    const todayEntries = entries.filter(e => toDateStr(e.timestamp) === today);

    const totalAmount = todayEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    const rideCount = todayEntries.length;
    const avgAmount = rideCount > 0 ? Math.round(totalAmount / rideCount) : 0;

    // 稼働時間の計算（シフト始業〜終業の合計 − 休憩時間、未終業は現在時刻まで）
    let workMinutes = 0;
    let breakMinutes = 0;
    try {
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      shifts.forEach(s => {
        if (!s.startTime) return;
        const start = new Date(s.startTime);
        if (toDateStr(s.startTime) !== today) return;
        const end = s.endTime ? new Date(s.endTime) : new Date();
        workMinutes += Math.round((end - start) / 60000);
      });
      // 休憩時間を差し引く
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      breaks.forEach(b => {
        if (!b.startTime) return;
        if (toDateStr(b.startTime) !== today) return;
        const bStart = new Date(b.startTime);
        const bEnd = b.endTime ? new Date(b.endTime) : new Date();
        breakMinutes += Math.round((bEnd - bStart) / 60000);
      });
      workMinutes = Math.max(0, workMinutes - breakMinutes);
    } catch(e) {}
    const workHours = Math.floor(workMinutes / 60);
    const workMins = workMinutes % 60;

    return {
      totalAmount,
      rideCount,
      avgAmount,
      workTime: `${workHours}h ${workMins}m`,
      workMinutes,
      entries: todayEntries,
    };
  }

  // ============================================================
  // 全期間サマリー
  // ============================================================
  function getOverallSummary() {
    const entries = getEntries();
    const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
    const rideCount = entries.length;
    const avgAmount = rideCount > 0 ? Math.round(totalAmount / rideCount) : 0;

    // 日数計算
    const uniqueDays = new Set(entries.map(e => toDateStr(e.timestamp)));
    const activeDays = uniqueDays.size;
    const dailyAvg = activeDays > 0 ? Math.round(totalAmount / activeDays) : 0;

    return {
      totalAmount,
      rideCount,
      avgAmount,
      activeDays,
      dailyAvg,
    };
  }

  // ============================================================
  // 日別集計（Analytics用）
  // ============================================================
  function getDailyBreakdown(days = 30) {
    const entries = getEntries();
    const result = {};

    // 過去N日分の枠を作る
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateStr(d.toISOString());
      result[key] = { date: key, amount: 0, count: 0 };
    }

    entries.forEach(e => {
      const key = e.date || toDateStr(e.timestamp);
      if (result[key]) {
        result[key].amount += e.amount || 0;
        result[key].count += 1;
      }
    });

    return Object.values(result);
  }

  // ============================================================
  // 曜日別集計（Analytics用）
  // ============================================================
  function getDayOfWeekBreakdown() {
    const entries = getEntries();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const result = days.map((name, i) => ({ name, index: i, amount: 0, count: 0, avg: 0 }));

    entries.forEach(e => {
      const dateStr = e.date || toDateStr(e.timestamp);
      const idx = dateStr ? new Date(dateStr + 'T00:00:00').getDay() : getDayOfWeekIndex(e.timestamp);
      result[idx].amount += e.amount || 0;
      result[idx].count += 1;
    });

    result.forEach(d => {
      d.avg = d.count > 0 ? Math.round(d.amount / d.count) : 0;
    });

    return result;
  }

  // ============================================================
  // 時間帯別集計（Analytics用）
  // ============================================================
  function getHourlyBreakdown() {
    const entries = getEntries();
    const result = [];

    for (let h = 0; h < 24; h++) {
      result.push({ hour: h, label: `${h}時`, amount: 0, count: 0, avg: 0 });
    }

    entries.forEach(e => {
      const time = e.dropoffTime || e.pickupTime || '';
      const h = time ? parseInt(time.split(':')[0], 10) : toHour(e.timestamp);
      if (h >= 0 && h < 24) {
        result[h].amount += e.amount || 0;
        result[h].count += 1;
      }
    });

    result.forEach(d => {
      d.avg = d.count > 0 ? Math.round(d.amount / d.count) : 0;
    });

    return result;
  }

  // ============================================================
  // エリア別集計（乗車地・降車地の頻度）
  // ============================================================
  function getAreaBreakdown() {
    const entries = getEntries();
    const pickups = {};
    const dropoffs = {};

    entries.forEach(e => {
      if (e.pickup) {
        pickups[e.pickup] = (pickups[e.pickup] || { name: e.pickup, count: 0, amount: 0 });
        pickups[e.pickup].count += 1;
        pickups[e.pickup].amount += e.amount || 0;
      }
      if (e.dropoff) {
        dropoffs[e.dropoff] = (dropoffs[e.dropoff] || { name: e.dropoff, count: 0, amount: 0 });
        dropoffs[e.dropoff].count += 1;
        dropoffs[e.dropoff].amount += e.amount || 0;
      }
    });

    return {
      pickups: Object.values(pickups).sort((a, b) => b.count - a.count).slice(0, 10),
      dropoffs: Object.values(dropoffs).sort((a, b) => b.count - a.count).slice(0, 10),
    };
  }

  // ============================================================
  // 天候別集計
  // ============================================================
  function getWeatherBreakdown() {
    const entries = getEntries();
    const weathers = ['晴れ', '曇り', '雨', '雪', '未設定'];
    const result = {};
    weathers.forEach(w => { result[w] = { name: w, amount: 0, count: 0, avg: 0 }; });

    entries.forEach(e => {
      const w = e.weather && weathers.includes(e.weather) ? e.weather : '未設定';
      result[w].amount += e.amount || 0;
      result[w].count += 1;
    });

    weathers.forEach(w => {
      result[w].avg = result[w].count > 0 ? Math.round(result[w].amount / result[w].count) : 0;
    });

    return weathers.map(w => result[w]);
  }

  // ============================================================
  // 配車方法別集計
  // ============================================================
  function getSourceBreakdown() {
    const entries = getEntries();
    const sources = ['Go', 'Uber', 'DIDI', '電話', '流し', '未設定'];
    const result = {};
    sources.forEach(s => { result[s] = { name: s, amount: 0, count: 0, avg: 0 }; });

    entries.forEach(e => {
      const s = e.source && sources.includes(e.source) ? e.source : '未設定';
      result[s].amount += e.amount || 0;
      result[s].count += 1;
    });

    sources.forEach(s => {
      result[s].avg = result[s].count > 0 ? Math.round(result[s].amount / result[s].count) : 0;
    });

    return sources.map(s => result[s]);
  }

  // ============================================================
  // 用途別集計
  // ============================================================
  function getPurposeBreakdown() {
    const entries = getEntries();
    const purposes = ['通勤', '通院', '買物', '観光', '出張', '送迎', '空港', '飲食', 'パチンコ', '未設定'];
    const result = {};
    purposes.forEach(p => { result[p] = { name: p, amount: 0, count: 0, avg: 0 }; });

    entries.forEach(e => {
      const p = e.purpose && purposes.includes(e.purpose) ? e.purpose : '未設定';
      result[p].amount += e.amount || 0;
      result[p].count += 1;
    });

    purposes.forEach(p => {
      result[p].avg = result[p].count > 0 ? Math.round(result[p].amount / result[p].count) : 0;
    });

    return purposes.map(p => result[p]);
  }

  // ============================================================
  // 用途×曜日×日種別（平日/休日/大型連休）クロス分析
  // ============================================================
  function getPurposeDayAnalysis() {
    const entries = getEntries();
    const purposes = ['通勤', '通院', '買物', '観光', '出張', '送迎', '空港', '飲食', 'パチンコ'];
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    // 大型連休判定（3日以上連続する祝日/休日をlong holidayとする）
    function classifyDayType(dateStr) {
      const info = JapaneseHolidays.getDateInfo(dateStr);
      const dayIdx = new Date(dateStr + 'T00:00:00').getDay();
      // 祝日または土日
      const isOff = info.isHoliday || dayIdx === 0 || dayIdx === 6;
      if (!isOff) return 'weekday';
      // 大型連休判定: 前後に連続する休日を数える
      let streak = 1;
      for (let d = 1; d <= 5; d++) {
        const prev = new Date(dateStr + 'T00:00:00');
        prev.setDate(prev.getDate() - d);
        const ps = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
        const pi = JapaneseHolidays.getDateInfo(ps);
        const pd = prev.getDay();
        if (pi.isHoliday || pd === 0 || pd === 6) streak++; else break;
      }
      for (let d = 1; d <= 5; d++) {
        const next = new Date(dateStr + 'T00:00:00');
        next.setDate(next.getDate() + d);
        const ns = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
        const ni = JapaneseHolidays.getDateInfo(ns);
        const nd = next.getDay();
        if (ni.isHoliday || nd === 0 || nd === 6) streak++; else break;
      }
      return streak >= 3 ? 'longHoliday' : 'holiday';
    }

    // 用途×曜日マトリクス
    const matrix = {};
    purposes.forEach(p => {
      matrix[p] = {};
      dayNames.forEach(d => { matrix[p][d] = { count: 0, amount: 0 }; });
    });

    // 用途×日種別マトリクス
    const typeMatrix = {};
    purposes.forEach(p => {
      typeMatrix[p] = { weekday: { count: 0, amount: 0 }, holiday: { count: 0, amount: 0 }, longHoliday: { count: 0, amount: 0 } };
    });

    // 日別集計（日種別ごとの日数カウント用）
    const dateSet = new Set();
    const dateDayTypeMap = {};

    entries.forEach(e => {
      const p = e.purpose && purposes.includes(e.purpose) ? e.purpose : null;
      if (!p) return;
      const dateStr = e.date || '';
      if (!dateStr) return;

      const dow = e.dayOfWeek || JapaneseHolidays.getDayOfWeek(dateStr);
      if (dow && matrix[p][dow]) {
        matrix[p][dow].count += 1;
        matrix[p][dow].amount += e.amount || 0;
      }

      if (!dateDayTypeMap[dateStr]) {
        dateDayTypeMap[dateStr] = classifyDayType(dateStr);
      }
      const dayType = dateDayTypeMap[dateStr];
      typeMatrix[p][dayType].count += 1;
      typeMatrix[p][dayType].amount += e.amount || 0;

      dateSet.add(dateStr);
    });

    // 日種別ごとの日数
    const dayTypeCounts = { weekday: 0, holiday: 0, longHoliday: 0 };
    const allDates = new Set();
    entries.forEach(e => { if (e.date) allDates.add(e.date); });
    allDates.forEach(d => {
      if (!dateDayTypeMap[d]) dateDayTypeMap[d] = classifyDayType(d);
      dayTypeCounts[dateDayTypeMap[d]]++;
    });

    // 月別・用途別トレンド
    const monthPurpose = {};
    entries.forEach(e => {
      const p = e.purpose && purposes.includes(e.purpose) ? e.purpose : null;
      if (!p || !e.date) return;
      const month = e.date.substring(0, 7); // YYYY-MM
      if (!monthPurpose[month]) {
        monthPurpose[month] = {};
        purposes.forEach(pp => { monthPurpose[month][pp] = 0; });
      }
      monthPurpose[month][p]++;
    });

    // 予測生成: 今後30日間で各日にどの用途が増えそうか
    const predictions = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + i);
      const ds = `${futureDate.getFullYear()}-${String(futureDate.getMonth()+1).padStart(2,'0')}-${String(futureDate.getDate()).padStart(2,'0')}`;
      const dow = dayNames[futureDate.getDay()];
      const dayType = classifyDayType(ds);
      const info = JapaneseHolidays.getDateInfo(ds);

      // 各用途のスコアを計算（曜日パターン + 日種別パターン）
      const scores = purposes.map(p => {
        const dowData = matrix[p][dow] || { count: 0 };
        const typeData = typeMatrix[p][dayType] || { count: 0 };
        // 曜日スコアと日種別スコアの加重平均
        const dowScore = dowData.count;
        const typeScore = typeData.count;
        return { purpose: p, score: dowScore * 0.6 + typeScore * 0.4, dowCount: dowData.count, typeCount: typeData.count };
      }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

      if (scores.length > 0) {
        predictions.push({
          date: ds,
          dayOfWeek: dow,
          dayType,
          holiday: info.holiday || null,
          topPurposes: scores.slice(0, 3),
        });
      }
    }

    return {
      matrix,        // 用途×曜日
      typeMatrix,    // 用途×日種別
      dayTypeCounts, // 日種別ごとの日数
      monthPurpose,  // 月別×用途
      predictions,   // 今後30日の予測
      purposes,
      dayNames,
    };
  }

  // ============================================================
  // エリア×時間帯クロス集計
  // ============================================================
  function getAreaTimeBreakdown() {
    const entries = getEntries();
    const areaMap = {};

    entries.forEach(e => {
      const area = e.pickup || '';
      if (!area) return;
      const hour = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : toHour(e.timestamp);

      if (!areaMap[area]) {
        areaMap[area] = { area, hours: {}, totalCount: 0, totalAmount: 0 };
      }
      areaMap[area].totalCount += 1;
      areaMap[area].totalAmount += e.amount || 0;

      if (!areaMap[area].hours[hour]) {
        areaMap[area].hours[hour] = { hour, count: 0, amount: 0 };
      }
      areaMap[area].hours[hour].count += 1;
      areaMap[area].hours[hour].amount += e.amount || 0;
    });

    return Object.values(areaMap)
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 10)
      .map(a => ({
        area: a.area,
        totalCount: a.totalCount,
        totalAmount: a.totalAmount,
        hours: Array.from({ length: 24 }, (_, h) => a.hours[h] || { hour: h, count: 0, amount: 0 }),
      }));
  }

  // ============================================================
  // 客単価分析
  // ============================================================
  function getUnitPriceAnalysis() {
    const entries = getEntries();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    const byDow = {};
    dayNames.forEach(d => { byDow[d] = { name: d, total: 0, count: 0, avg: 0 }; });

    const byHour = {};
    for (let h = 0; h < 24; h++) { byHour[h] = { name: h + '時', hour: h, total: 0, count: 0, avg: 0 }; }

    const weathers = ['晴れ', '曇り', '雨', '雪', '未設定'];
    const byWeather = {};
    weathers.forEach(w => { byWeather[w] = { name: w, total: 0, count: 0, avg: 0 }; });

    const purposes = ['通勤', '通院', '買物', '観光', '出張', '送迎', '空港', '飲食', 'パチンコ', '未設定'];
    const byPurpose = {};
    purposes.forEach(p => { byPurpose[p] = { name: p, total: 0, count: 0, avg: 0 }; });

    const passengerLabels = ['1人', '2人', '3人以上'];
    const byPassengers = {};
    passengerLabels.forEach(p => { byPassengers[p] = { name: p, total: 0, count: 0, avg: 0 }; });

    entries.forEach(e => {
      const amt = e.amount || 0;

      const dow = getDayOfWeek(e.timestamp);
      byDow[dow].total += amt;
      byDow[dow].count += 1;

      const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : toHour(e.timestamp);
      byHour[hr].total += amt;
      byHour[hr].count += 1;

      const w = e.weather && weathers.includes(e.weather) ? e.weather : '未設定';
      byWeather[w].total += amt;
      byWeather[w].count += 1;

      const p = e.purpose && purposes.includes(e.purpose) ? e.purpose : '未設定';
      byPurpose[p].total += amt;
      byPurpose[p].count += 1;

      const pNum = parseInt(e.passengers, 10) || 0;
      const pKey = pNum <= 1 ? '1人' : pNum === 2 ? '2人' : '3人以上';
      byPassengers[pKey].total += amt;
      byPassengers[pKey].count += 1;
    });

    const calcAvg = obj => { Object.values(obj).forEach(v => { v.avg = v.count > 0 ? Math.round(v.total / v.count) : 0; }); };
    calcAvg(byDow); calcAvg(byHour); calcAvg(byWeather); calcAvg(byPurpose); calcAvg(byPassengers);

    return {
      byDayOfWeek: dayNames.map(d => byDow[d]),
      byHour: Array.from({ length: 24 }, (_, h) => byHour[h]),
      byWeather: weathers.map(w => byWeather[w]),
      byPurpose: purposes.map(p => byPurpose[p]),
      byPassengers: passengerLabels.map(p => byPassengers[p]),
    };
  }

  // ============================================================
  // 今日のおすすめ（業務推奨）
  // ============================================================
  function getBusinessRecommendation() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDow = getDayOfWeek(now.toISOString());
    const currentDowIndex = now.getDay();

    const entries = getEntries();

    // 現在の時間帯で売上が高いエリアTOP3
    const areaByHour = {};
    entries.forEach(e => {
      const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : toHour(e.timestamp);
      if (hr === currentHour && e.pickup) {
        if (!areaByHour[e.pickup]) areaByHour[e.pickup] = { name: e.pickup, amount: 0, count: 0 };
        areaByHour[e.pickup].amount += e.amount || 0;
        areaByHour[e.pickup].count += 1;
      }
    });
    // 奇数日は駅前エリアを除外
    const isOddDay = now.getDate() % 2 !== 0;
    const stationPat = /駅前|旭川駅/;
    let sortedAreas = Object.values(areaByHour).sort((a, b) => b.amount - a.amount);
    if (isOddDay) sortedAreas = sortedAreas.filter(a => !stationPat.test(a.name));
    const topAreas = sortedAreas.slice(0, 3);

    // 今日の曜日で平均単価が高い時間帯TOP3
    const hourByDow = {};
    for (let h = 0; h < 24; h++) hourByDow[h] = { hour: h, name: h + '時', total: 0, count: 0, avg: 0 };
    entries.forEach(e => {
      const dow = getDayOfWeekIndex(e.timestamp);
      if (dow === currentDowIndex) {
        const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : toHour(e.timestamp);
        hourByDow[hr].total += e.amount || 0;
        hourByDow[hr].count += 1;
      }
    });
    Object.values(hourByDow).forEach(v => { v.avg = v.count > 0 ? Math.round(v.total / v.count) : 0; });
    const topHours = Object.values(hourByDow).filter(v => v.count > 0).sort((a, b) => b.avg - a.avg).slice(0, 3);

    // 推定客単価（曜日+時間帯の平均）
    let estTotal = 0, estCount = 0;
    entries.forEach(e => {
      const dow = getDayOfWeekIndex(e.timestamp);
      const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : toHour(e.timestamp);
      if (dow === currentDowIndex && hr === currentHour) {
        estTotal += e.amount || 0;
        estCount += 1;
      }
    });
    const estimatedUnitPrice = estCount > 0 ? Math.round(estTotal / estCount) : 0;

    return {
      topAreas,
      topHours,
      estimatedUnitPrice,
      currentCondition: { dayOfWeek: currentDow, hour: currentHour },
    };
  }

  // ============================================================
  // 配車方法×エリア×単価ランク クロス分析
  // ============================================================
  function getSourceAreaPriceBreakdown() {
    const entries = getEntries();
    const sources = ['Go', 'Uber', 'DIDI', '電話', '流し'];
    const priceTiers = [
      { key: 'short', label: '¥1,000以下', min: 0, max: 1000 },
      { key: 'mid', label: '¥1,001〜1,999', min: 1001, max: 1999 },
      { key: 'long', label: '¥2,000以上', min: 2000, max: Infinity },
    ];

    // 配車方法×エリアごとの集計
    const sourceAreaMap = {};
    // 配車方法×単価ランクの集計
    const sourceTierMap = {};
    sources.forEach(s => {
      sourceTierMap[s] = {};
      priceTiers.forEach(t => { sourceTierMap[s][t.key] = { count: 0, amount: 0 }; });
    });
    // エリア×単価ランクの集計
    const areaTierMap = {};

    entries.forEach(e => {
      const src = e.source && sources.includes(e.source) ? e.source : null;
      const area = e.pickup || '';
      const amt = e.amount || 0;
      const tier = amt <= 1000 ? 'short' : amt <= 1999 ? 'mid' : 'long';

      // 配車方法×エリア
      if (src && area) {
        const key = src + '::' + area;
        if (!sourceAreaMap[key]) sourceAreaMap[key] = { source: src, area, count: 0, amount: 0, avg: 0, tiers: { short: 0, mid: 0, long: 0 } };
        sourceAreaMap[key].count += 1;
        sourceAreaMap[key].amount += amt;
        sourceAreaMap[key].tiers[tier] += 1;
      }

      // 配車方法×単価ランク
      if (src) {
        sourceTierMap[src][tier].count += 1;
        sourceTierMap[src][tier].amount += amt;
      }

      // エリア×単価ランク
      if (area) {
        if (!areaTierMap[area]) {
          areaTierMap[area] = { area, total: 0, tiers: {} };
          priceTiers.forEach(t => { areaTierMap[area].tiers[t.key] = { count: 0, amount: 0 }; });
        }
        areaTierMap[area].total += 1;
        areaTierMap[area].tiers[tier].count += 1;
        areaTierMap[area].tiers[tier].amount += amt;
      }
    });

    // 平均算出
    Object.values(sourceAreaMap).forEach(v => { v.avg = v.count > 0 ? Math.round(v.amount / v.count) : 0; });

    // 配車方法×エリア: 上位をソート
    const sourceAreaList = Object.values(sourceAreaMap).sort((a, b) => b.count - a.count).slice(0, 30);

    // 配車方法×単価ランク: 構造化
    const sourceTierList = sources.map(s => ({
      source: s,
      tiers: priceTiers.map(t => ({
        ...t,
        count: sourceTierMap[s][t.key].count,
        amount: sourceTierMap[s][t.key].amount,
        avg: sourceTierMap[s][t.key].count > 0 ? Math.round(sourceTierMap[s][t.key].amount / sourceTierMap[s][t.key].count) : 0,
      })),
      totalCount: priceTiers.reduce((sum, t) => sum + sourceTierMap[s][t.key].count, 0),
    }));

    // エリア×単価ランク: 上位エリア
    const areaTierList = Object.values(areaTierMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(a => ({
        area: a.area,
        total: a.total,
        tiers: priceTiers.map(t => ({
          ...t,
          count: a.tiers[t.key].count,
          amount: a.tiers[t.key].amount,
          pct: a.total > 0 ? Math.round((a.tiers[t.key].count / a.total) * 100) : 0,
        })),
      }));

    // エリア×配車方法マトリクス（平均単価）: 上位エリア×全配車方法
    const topAreas = areaTierList.map(a => a.area);
    const matrixData = topAreas.map(area => {
      const row = { area };
      sources.forEach(src => {
        const key = src + '::' + area;
        const d = sourceAreaMap[key];
        row[src] = d ? { count: d.count, avg: d.avg, tiers: d.tiers } : { count: 0, avg: 0, tiers: { short: 0, mid: 0, long: 0 } };
      });
      return row;
    });

    return { priceTiers, sources, sourceAreaList, sourceTierList, areaTierList, matrixData };
  }

  // ============================================================
  // 単価ランク別ヒートマップデータ（地図用）
  // ============================================================
  function getPriceTierHeatmapData(filterSource) {
    const entries = getEntries();
    const points = [];

    entries.forEach(e => {
      if (!e.pickupCoords || !e.pickupCoords.lat || !e.pickupCoords.lng) return;
      if (filterSource && e.source !== filterSource) return;
      const amt = e.amount || 0;
      const tier = amt <= 1000 ? 'short' : amt <= 1999 ? 'mid' : 'long';
      points.push({
        lat: e.pickupCoords.lat,
        lng: e.pickupCoords.lng,
        amount: amt,
        tier,
        source: e.source || '未設定',
        area: e.pickup || '',
        hour: e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : toHour(e.timestamp),
      });
    });

    return points;
  }

  // ============================================================
  // 現在地周辺の推定単価（地図パネル用）
  // ============================================================
  function getNearbyEstimate(lat, lng, radiusKm) {
    radiusKm = (radiusKm != null) ? radiusKm : 2;
    const entries = getEntries();
    const nearby = [];

    entries.forEach(e => {
      if (!e.pickupCoords || !e.pickupCoords.lat || !e.pickupCoords.lng) return;
      const dLat = e.pickupCoords.lat - lat;
      const dLng = e.pickupCoords.lng - lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111; // 粗い距離(km)
      if (dist <= radiusKm) {
        nearby.push(e);
      }
    });

    if (nearby.length === 0) return { count: 0, avgPrice: 0, tierCounts: { short: 0, mid: 0, long: 0 }, sources: {}, topArea: '' };

    let total = 0;
    const tierCounts = { short: 0, mid: 0, long: 0 };
    const sources = {};
    const areaCounts = {};

    nearby.forEach(e => {
      const amt = e.amount || 0;
      total += amt;
      const tier = amt <= 1000 ? 'short' : amt <= 1999 ? 'mid' : 'long';
      tierCounts[tier] += 1;
      const src = e.source || '未設定';
      sources[src] = (sources[src] || 0) + 1;
      if (e.pickup) areaCounts[e.pickup] = (areaCounts[e.pickup] || 0) + 1;
    });

    const topArea = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      count: nearby.length,
      avgPrice: Math.round(total / nearby.length),
      tierCounts,
      sources,
      topArea: topArea ? topArea[0] : '',
    };
  }

  // ============================================================
  // ヒートマップデータ（半径2kmオーバーラップ方式）
  // 各乗車地点から半径2km圏内に仮想ポイントを配置し、
  // 複数の乗車地点の2km圏が重なるエリアほど高密度になる
  // ============================================================
  function getHeatmapData() {
    const entries = getEntries();
    const rivals = getRivalEntries();
    // 元の乗車ポイントを収集
    const origins = [];

    entries.forEach(e => {
      if (e.pickupCoords && e.pickupCoords.lat && e.pickupCoords.lng) {
        origins.push({ lat: e.pickupCoords.lat, lng: e.pickupCoords.lng });
      }
    });

    rivals.forEach(r => {
      if (r.locationCoords && r.locationCoords.lat && r.locationCoords.lng) {
        origins.push({ lat: r.locationCoords.lat, lng: r.locationCoords.lng });
      }
    });

    if (origins.length === 0) return [];

    // グリッドセルサイズ（度）: 約200m間隔
    const CELL_SIZE = 0.002;
    // 半径2km ≒ 約0.018度（緯度）
    const RADIUS_DEG = 0.018;
    const RADIUS_KM = 2.0;

    // グリッドに重ね合わせカウント
    const grid = {};

    origins.forEach(origin => {
      // 半径2km圏のグリッドセルを列挙
      const latSteps = Math.ceil(RADIUS_DEG / CELL_SIZE);
      for (let di = -latSteps; di <= latSteps; di++) {
        for (let dj = -latSteps; dj <= latSteps; dj++) {
          const cellLat = origin.lat + di * CELL_SIZE;
          const cellLng = origin.lng + dj * CELL_SIZE;
          // 実距離で2km以内かチェック
          const dlat = cellLat - origin.lat;
          const dlng = (cellLng - origin.lng) * Math.cos(origin.lat * Math.PI / 180);
          const distKm = Math.sqrt(dlat * dlat + dlng * dlng) * 111.32;
          if (distKm > RADIUS_KM) continue;

          // グリッドキーを丸めて集約
          const key = `${(Math.round(cellLat / CELL_SIZE) * CELL_SIZE).toFixed(4)},${(Math.round(cellLng / CELL_SIZE) * CELL_SIZE).toFixed(4)}`;
          if (!grid[key]) {
            grid[key] = { lat: Math.round(cellLat / CELL_SIZE) * CELL_SIZE, lng: Math.round(cellLng / CELL_SIZE) * CELL_SIZE, count: 0 };
          }
          // 中心に近いほど高いweight（ガウシアン減衰）
          const falloff = Math.exp(-(distKm * distKm) / (2 * 0.8 * 0.8));
          grid[key].count += falloff;
        }
      }
    });

    // グリッドからポイント配列に変換
    const points = Object.values(grid).map(g => ({
      lat: g.lat,
      lng: g.lng,
      weight: g.count,
    }));

    return points;
  }

  // ============================================================
  // 週別集計
  // ============================================================
  function getWeeklyBreakdown(weeks = 12) {
    const entries = getEntries();
    const result = {};

    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - (i * 7));
      const key = getWeekStart(d);
      result[key] = { week: key, amount: 0, count: 0 };
    }

    entries.forEach(e => {
      const key = getWeekStart(new Date(e.timestamp));
      if (result[key]) {
        result[key].amount += e.amount || 0;
        result[key].count += 1;
      }
    });

    return Object.values(result);
  }

  // ============================================================
  // 月別集計
  // ============================================================
  function getMonthlyBreakdown() {
    const entries = getEntries();
    const result = {};

    entries.forEach(e => {
      const key = getMonthStr(e.timestamp);
      if (!result[key]) {
        result[key] = { month: key, amount: 0, count: 0 };
      }
      result[key].amount += e.amount || 0;
      result[key].count += 1;
    });

    return Object.values(result).sort((a, b) => a.month.localeCompare(b.month));
  }

  // ============================================================
  // CSVエクスポート
  // ============================================================
  function exportCSV() {
    const entries = getEntries();
    if (entries.length === 0) return null;

    const header = 'ID,日付,曜日,祝日,日時,天候,金額,支払方法,割引額,割引種別,乗車地,乗車ランドマーク,乗車緯度,乗車経度,乗車時間,待機時間,降車地,降車ランドマーク,降車緯度,降車経度,降車時間,人数,性別,用途,配車方法,メモ';
    const rows = entries.map(e => {
      const entryDate = e.date || toDateStr(e.timestamp);
      const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
      const dayOfWeek = e.dayOfWeek || dateInfo.dayOfWeek;
      const holiday = e.holiday || dateInfo.holiday || '';
      const dateTime = new Date(e.timestamp).toLocaleString('ja-JP');
      const weather = (e.weather || '').replace(/,/g, '、');
      const paymentMethod = e.paymentMethod === 'uncollected' ? '未収' : e.paymentMethod === 'didi' ? 'DIDI決済' : '現金';
      const discountAmount = e.discountAmount || 0;
      const discountTypeMap = { disability: '障害者割引', coupon: 'クーポン', ticket: 'タクシーチケット' };
      const discountType = (e.discounts && Array.isArray(e.discounts) && e.discounts.length > 0)
        ? e.discounts.map(d => d.type === 'coupon' && d.sheets ? `${discountTypeMap[d.type]}(¥${d.unitPrice || d.amount}×${d.sheets}枚=¥${d.amount})` : `${discountTypeMap[d.type] || d.type}(¥${d.amount})`).join('/')
        : discountTypeMap[e.discountType] || (e.discountType || '');
      const pickup = (e.pickup || '').replace(/,/g, '、');
      const pickupTime = e.pickupTime || '';
      const dropoff = (e.dropoff || '').replace(/,/g, '、');
      const dropoffTime = e.dropoffTime || '';
      const passengers = e.passengers || '';
      const gender = e.gender || '';
      const purpose = (e.purpose || '').replace(/,/g, '、');
      const source = e.source || '';
      const memo = (e.memo || '').replace(/,/g, '、');
      const waitingTime = e.waitingTime || '';
      const pickupLat = e.pickupCoords ? e.pickupCoords.lat : '';
      const pickupLng = e.pickupCoords ? e.pickupCoords.lng : '';
      const dropoffLat = e.dropoffCoords ? e.dropoffCoords.lat : '';
      const dropoffLng = e.dropoffCoords ? e.dropoffCoords.lng : '';
      const pickupLandmark = (e.pickupLandmark || '').replace(/,/g, '、');
      const dropoffLandmark = (e.dropoffLandmark || '').replace(/,/g, '、');
      return `${e.id},${entryDate},${dayOfWeek},${holiday},${dateTime},${weather},${e.amount},${paymentMethod},${discountAmount},${discountType},${pickup},${pickupLandmark},${pickupLat},${pickupLng},${pickupTime},${waitingTime},${dropoff},${dropoffLandmark},${dropoffLat},${dropoffLng},${dropoffTime},${passengers},${gender},${purpose},${source},${memo}`;
    });

    const csv = '\uFEFF' + header + '\n' + rows.join('\n'); // BOM付きUTF-8
    return csv;
  }

  function downloadCSV() {
    const csv = exportCSV();
    if (!csv) {
      AppLogger.warn('エクスポート対象のデータがありません');
      return false;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = getLocalDateString();
    link.href = url;
    link.download = `taxi_revenue_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    AppLogger.info(`CSVエクスポート完了: ${getEntries().length}件`);
    return true;
  }

  // ============================================================
  // データバリデーション
  // ============================================================
  function validateEntry(form) {
    const errors = [];
    const amount = parseInt(form.amount);

    if (form.noPassenger) {
      return { valid: true, errors: [] };
    }

    if (!form.amount || isNaN(amount)) {
      errors.push('金額を入力してください');
    } else if (amount <= 0) {
      errors.push('金額は1円以上を入力してください');
    } else if (amount > 1000000) {
      errors.push('金額が大きすぎます（100万円以下にしてください）');
    }

    // 降車時刻が乗車時刻より前でないかチェック
    if (form.pickupTime && form.dropoffTime && form.pickupTime > form.dropoffTime) {
      errors.push('降車時刻が乗車時刻より前になっています');
    }

    return { valid: errors.length === 0, errors };
  }

  // ============================================================
  // データ変更通知ヘルパー
  // ============================================================
  function _notifyDataChanged(type) {
    window.dispatchEvent(new CustomEvent('taxi-data-changed', { detail: { type } }));
  }

  // ============================================================
  // CRUD操作
  // ============================================================
  function addEntry(form) {
    const validation = validateEntry(form);
    if (!validation.valid) return { success: false, errors: validation.errors };

    const entries = getEntries();
    const entryDate = form.date || getLocalDateString();
    const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
    // 割引額を先に計算（クーポン・タクシーチケットは支払方法なので除外）
    const _discountAmt = (() => {
      const d = form.discounts || {};
      return Object.entries(d).filter(([k]) => !k.startsWith('_') && k !== 'ticket' && k !== 'coupon').reduce((sum, [, v]) => sum + (parseInt(v) || 0), 0);
    })();
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      amount: parseInt(form.amount) - _discountAmt,
      date: entryDate,
      dayOfWeek: dateInfo.dayOfWeek,
      holiday: dateInfo.holiday || '',
      weather: form.weather || '',
      pickup: form.pickup || '',
      pickupTime: form.pickupTime || '',
      dropoff: form.dropoff || '',
      dropoffTime: form.dropoffTime || '',
      passengers: form.passengers || '',
      gender: form.gender || '',
      purpose: form.purpose || '送迎',
      memo: form.memo || '',
      source: form.source || '',
      pickupCoords: form.pickupCoords || null,
      dropoffCoords: form.dropoffCoords || null,
      pickupLandmark: form.pickupLandmark || '',
      dropoffLandmark: form.dropoffLandmark || '',
      noPassenger: form.noPassenger || false,
      paymentMethod: form.paymentMethod || 'cash',
      discounts: (() => {
        const d = form.discounts || {};
        return Object.entries(d).filter(([k, v]) => !k.startsWith('_') && v && parseInt(v) > 0).map(([type, amount]) => {
          const item = { type, amount: parseInt(amount) };
          if (type === 'coupon') {
            item.unitPrice = parseInt(d._couponUnitPrice) || parseInt(amount);
            item.sheets = parseInt(d._couponSheets) || 1;
          }
          return item;
        });
      })(),
      discountAmount: _discountAmt,
      discountType: (() => {
        const d = form.discounts || {};
        const types = Object.entries(d).filter(([k, v]) => !k.startsWith('_') && v && parseInt(v) > 0).map(([t]) => t);
        return types.join(',');
      })(),
      waitingTime: '',
      timestamp: new Date().toISOString(),
    };

    entries.unshift(entry);
    saveEntries(entries);
    const holidayStr = dateInfo.holiday ? ` [${dateInfo.holiday}]` : '';
    const paymentStr = entry.paymentMethod === 'uncollected' ? ' [未収]' : entry.paymentMethod === 'didi' ? ' [DIDI決済]' : '';
    const discountStr = entry.discountAmount > 0 ? ` [割引¥${entry.discountAmount}]` : '';
    AppLogger.info(`売上記録追加: ¥${entry.amount}${paymentStr}${discountStr} (${entry.date} ${dateInfo.dayOfWeek}${holidayStr}, ${entry.weather || '天候未設定'})`);
    // 自動ファイル保存
    autoSaveToFile();
    _syncToCloud('revenue', entries);
    _notifyDataChanged('revenue');
    return { success: true, entry };
  }

  function deleteEntry(id) {
    const entries = getEntries();
    const filtered = entries.filter(e => e.id !== id);
    saveEntries(filtered);
    AppLogger.info('売上記録を削除しました');
    autoSaveToFile();
    _syncToCloud('revenue', filtered);
    _notifyDataChanged('revenue');
    return true;
  }

  // ============================================================
  // ゴミ箱機能
  // ============================================================
  function getTrash() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.TRASH);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }

  function saveTrash(items) {
    try {
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.TRASH, JSON.stringify(items));
    } catch (e) { AppLogger.error('ゴミ箱の保存に失敗', e); }
  }

  function moveToTrash(id) {
    const entries = getEntries();
    const entry = entries.find(e => e.id === id);
    if (!entry) return false;
    const trashEntry = { ...entry, _trashType: 'revenue', _deletedAt: new Date().toISOString(), _trashId: Date.now() + '_' + Math.random().toString(36).substr(2, 5) };
    const trash = getTrash();
    trash.unshift(trashEntry);
    // ゴミ箱保存を先に行い、失敗したら元データを削除しない
    try {
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.TRASH, JSON.stringify(trash));
    } catch (e) {
      AppLogger.error('ゴミ箱の保存に失敗。データは削除されません。', e.message);
      return false;
    }
    const filtered = entries.filter(e => e.id !== id);
    saveEntries(filtered);
    AppLogger.info('売上記録をゴミ箱に移動しました');
    autoSaveToFile();
    _syncToCloud('revenue', filtered);
    _notifyDataChanged('revenue');
    return true;
  }

  function moveRivalToTrash(id) {
    const entries = getRivalEntries();
    const entry = entries.find(e => e.id === id);
    if (!entry) return false;
    const trashEntry = { ...entry, _trashType: 'rival', _deletedAt: new Date().toISOString(), _trashId: Date.now() + '_' + Math.random().toString(36).substr(2, 5) };
    const trash = getTrash();
    trash.unshift(trashEntry);
    saveTrash(trash);
    const filtered = entries.filter(e => e.id !== id);
    saveRivalEntries(filtered);
    AppLogger.info('他社乗車記録をゴミ箱に移動しました');
    autoSaveRivalToFile();
    _syncToCloud('rival', filtered);
    _notifyDataChanged('rival');
    return true;
  }

  function restoreFromTrash(trashId) {
    const trash = getTrash();
    const idx = trash.findIndex(e => e._trashId === trashId);
    if (idx === -1) return false;
    const item = { ...trash[idx] };
    const type = item._trashType;
    delete item._trashType;
    delete item._deletedAt;
    delete item._trashId;
    trash.splice(idx, 1);
    saveTrash(trash);
    if (type === 'revenue') {
      const entries = getEntries();
      entries.unshift(item);
      saveEntries(entries);
      autoSaveToFile();
      _syncToCloud('revenue', entries);
      _notifyDataChanged('revenue');
      AppLogger.info('売上記録をゴミ箱から復元しました');
    } else if (type === 'rival') {
      const entries = getRivalEntries();
      entries.unshift(item);
      saveRivalEntries(entries);
      autoSaveRivalToFile();
      _syncToCloud('rival', entries);
      _notifyDataChanged('rival');
      AppLogger.info('他社乗車記録をゴミ箱から復元しました');
    }
    return true;
  }

  function permanentDeleteFromTrash(trashId) {
    const trash = getTrash();
    const filtered = trash.filter(e => e._trashId !== trashId);
    saveTrash(filtered);
    AppLogger.info('ゴミ箱からデータを完全削除しました');
    return true;
  }

  function emptyTrash() {
    saveTrash([]);
    AppLogger.info('ゴミ箱を空にしました');
    return true;
  }

  function cleanupTrash() {
    const trash = getTrash();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const filtered = trash.filter(e => new Date(e._deletedAt) > oneMonthAgo);
    if (filtered.length < trash.length) {
      saveTrash(filtered);
      AppLogger.info(`ゴミ箱の自動クリーンアップ: ${trash.length - filtered.length}件を削除`);
    }
  }

  function updateEntry(id, updates) {
    const entries = getEntries();
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return { success: false, errors: ['記録が見つかりません'] };
    if (updates.amount != null) {
      const amt = parseInt(updates.amount);
      const isNoPassenger = entries[idx].noPassenger || updates.noPassenger;
      if (isNoPassenger) {
        updates.amount = 0;
      } else {
        if (isNaN(amt) || amt < 1 || amt > 1000000) return { success: false, errors: ['金額は1〜1,000,000の範囲で入力してください'] };
        updates.amount = amt;
      }
    }
    entries[idx] = { ...entries[idx], ...updates };
    saveEntries(entries);
    AppLogger.info('売上記録を更新しました');
    autoSaveToFile();
    _syncToCloud('revenue', entries);
    _notifyDataChanged('revenue');
    return { success: true, entry: entries[idx] };
  }

  function clearAllEntries() {
    saveEntries([]);
    _syncToCloud('revenue', []);
    AppLogger.info('全売上データを削除しました');
    _notifyDataChanged('revenue');
    return true;
  }

  // ============================================================
  // 他社乗車データ CRUD
  // ============================================================
  function getRivalEntries() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.RIVAL_RIDES);
      if (saved === _rivalCacheRaw && _rivalCache !== null) return _rivalCache;
      const entries = saved ? JSON.parse(saved) : [];
      entries.forEach(e => {
        if (e.date) {
          const info = JapaneseHolidays.getDateInfo(e.date);
          e.dayOfWeek = info.dayOfWeek;
          e.holiday = info.holiday || '';
        }
      });
      _rivalCacheRaw = saved;
      _rivalCache = _sortByDateTimeDesc(entries, 'date', 'time');
      return _rivalCache;
    } catch {
      return [];
    }
  }

  function saveRivalEntries(entries) {
    try {
      _sortByDateTimeDesc(entries, 'date', 'time');
      const json = JSON.stringify(entries);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.RIVAL_RIDES, json);
      _rivalCacheRaw = json;
      _rivalCache = entries;
      return true;
    } catch (e) {
      AppLogger.error('他社乗車データの保存に失敗しました', e.message);
      return false;
    }
  }

  function addRivalEntry(form) {
    if (!form.location || !form.location.trim()) {
      return { success: false, errors: ['乗車場所を入力してください'] };
    }
    const entries = getRivalEntries();
    const entryDate = form.date || getLocalDateString();
    const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      date: entryDate,
      dayOfWeek: dateInfo.dayOfWeek,
      holiday: dateInfo.holiday || '',
      time: form.time || '',
      weather: form.weather || '',
      location: form.location.trim(),
      locationCoords: form.locationCoords || null,
      memo: form.memo || '',
      timestamp: new Date().toISOString(),
    };
    entries.unshift(entry);
    saveRivalEntries(entries);
    const holidayStr = dateInfo.holiday ? ` [${dateInfo.holiday}]` : '';
    AppLogger.info(`他社乗車記録追加: ${entry.location} (${entry.date} ${dateInfo.dayOfWeek}${holidayStr})`);
    autoSaveRivalToFile();
    _syncToCloud('rival', entries);
    _notifyDataChanged('rival');
    return { success: true, entry };
  }

  function deleteRivalEntry(id) {
    const entries = getRivalEntries();
    const filtered = entries.filter(e => e.id !== id);
    saveRivalEntries(filtered);
    AppLogger.info('他社乗車記録を削除しました');
    autoSaveRivalToFile();
    _syncToCloud('rival', filtered);
    _notifyDataChanged('rival');
    return true;
  }

  function updateRivalEntry(id, updates) {
    const entries = getRivalEntries();
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return { success: false, errors: ['記録が見つかりません'] };
    if (updates.location != null && !updates.location.trim()) return { success: false, errors: ['乗車場所を入力してください'] };
    entries[idx] = { ...entries[idx], ...updates };
    saveRivalEntries(entries);
    AppLogger.info('他社乗車記録を更新しました');
    autoSaveRivalToFile();
    _syncToCloud('rival', entries);
    _notifyDataChanged('rival');
    return { success: true, entry: entries[idx] };
  }

  function clearAllRivalEntries() {
    saveRivalEntries([]);
    _syncToCloud('rival', []);
    AppLogger.info('全他社乗車データを削除しました');
    _notifyDataChanged('rival');
    return true;
  }

  // ============================================================
  // 他社乗車分析
  // ============================================================
  function getRivalHourlyBreakdown() {
    const entries = getRivalEntries();
    const result = [];
    for (let h = 0; h < 24; h++) {
      result.push({ hour: h, label: `${h}時`, count: 0 });
    }
    entries.forEach(e => {
      if (e.time) {
        const hour = parseInt(e.time.split(':')[0], 10);
        if (hour >= 0 && hour < 24) result[hour].count += 1;
      }
    });
    return result;
  }

  function getRivalDayOfWeekBreakdown() {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const result = days.map((name, i) => ({ name, index: i, count: 0 }));
    const entries = getRivalEntries();
    entries.forEach(e => {
      if (e.date) {
        const idx = new Date(e.date).getDay();
        if (idx >= 0 && idx < 7) result[idx].count += 1;
      }
    });
    return result;
  }

  function getRivalLocationBreakdown() {
    const entries = getRivalEntries();
    const locs = {};
    entries.forEach(e => {
      if (e.location) {
        if (!locs[e.location]) locs[e.location] = { name: e.location, count: 0 };
        locs[e.location].count += 1;
      }
    });
    return Object.values(locs).sort((a, b) => b.count - a.count).slice(0, 10);
  }

  function getRivalWeatherBreakdown() {
    const weathers = ['晴れ', '曇り', '雨', '雪', '未設定'];
    const result = {};
    weathers.forEach(w => { result[w] = { name: w, count: 0 }; });
    const entries = getRivalEntries();
    entries.forEach(e => {
      const w = e.weather && weathers.includes(e.weather) ? e.weather : '未設定';
      result[w].count += 1;
    });
    return weathers.map(w => result[w]);
  }

  function downloadRivalCSV() {
    const entries = getRivalEntries();
    if (entries.length === 0) {
      AppLogger.warn('エクスポート対象の他社乗車データがありません');
      return false;
    }
    const header = 'ID,日付,曜日,祝日,時間,天候,乗車場所,緯度,経度,メモ';
    const rows = entries.map(e => {
      const weather = (e.weather || '').replace(/,/g, '、');
      const location = (e.location || '').replace(/,/g, '、');
      const memo = (e.memo || '').replace(/,/g, '、');
      const lat = e.locationCoords ? e.locationCoords.lat : '';
      const lng = e.locationCoords ? e.locationCoords.lng : '';
      return `${e.id},${e.date},${e.dayOfWeek},${e.holiday},${e.time},${weather},${location},${lat},${lng},${memo}`;
    });
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = getLocalDateString();
    link.href = url;
    link.download = `rival_rides_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    AppLogger.info(`他社乗車CSVエクスポート完了: ${entries.length}件`);
    return true;
  }

  // ============================================================
  // 集客メモ CRUD
  // ============================================================
  function getGatheringMemos() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.GATHERING_MEMOS);
      if (saved === _gatheringCacheRaw && _gatheringCache !== null) return _gatheringCache;
      const entries = saved ? JSON.parse(saved) : [];
      entries.forEach(e => {
        if (e.date) {
          const info = JapaneseHolidays.getDateInfo(e.date);
          e.dayOfWeek = info.dayOfWeek;
          e.holiday = info.holiday || '';
        }
      });
      _gatheringCacheRaw = saved;
      _gatheringCache = _sortByDateTimeDesc(entries, 'date', 'time');
      return _gatheringCache;
    } catch {
      return [];
    }
  }

  function saveGatheringMemos(entries) {
    try {
      _sortByDateTimeDesc(entries, 'date', 'time');
      const json = JSON.stringify(entries);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.GATHERING_MEMOS, json);
      _gatheringCacheRaw = json;
      _gatheringCache = entries;
      return true;
    } catch (e) {
      AppLogger.error('集客メモの保存に失敗しました', e.message);
      return false;
    }
  }

  function addGatheringMemo(form) {
    if (!form.location || !form.location.trim())
      return { success: false, errors: ['場所を入力してください'] };
    if (!form.density)
      return { success: false, errors: ['客の多さを選択してください'] };

    const entries = getGatheringMemos();
    const entryDate = form.date || getLocalDateString();
    const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      date: entryDate,
      dayOfWeek: dateInfo.dayOfWeek,
      holiday: dateInfo.holiday || '',
      time: form.time || '',
      location: form.location.trim(),
      locationCoords: form.locationCoords || null,
      density: form.density,
      locationType: form.locationType || 'other',
      weather: form.weather || '',
      stayMinutes: form.stayMinutes ? parseInt(form.stayMinutes, 10) : 0,
      memo: form.memo || '',
      source: form.source || 'manual',
      timestamp: new Date().toISOString(),
    };
    entries.unshift(entry);
    saveGatheringMemos(entries);
    autoSaveGatheringToFile();
    _syncToCloud('gathering', entries);
    _notifyDataChanged('gathering');
    return { success: true, entry };
  }

  function updateGatheringMemo(id, updates) {
    const entries = getGatheringMemos();
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return { success: false, errors: ['記録が見つかりません'] };
    if (updates.location != null && !updates.location.trim())
      return { success: false, errors: ['場所を入力してください'] };
    if (updates.date) {
      const info = JapaneseHolidays.getDateInfo(updates.date);
      updates.dayOfWeek = info.dayOfWeek;
      updates.holiday = info.holiday || '';
    }
    entries[idx] = { ...entries[idx], ...updates };
    saveGatheringMemos(entries);
    autoSaveGatheringToFile();
    _syncToCloud('gathering', entries);
    _notifyDataChanged('gathering');
    return { success: true, entry: entries[idx] };
  }

  function deleteGatheringMemo(id) {
    const entries = getGatheringMemos();
    const filtered = entries.filter(e => e.id !== id);
    saveGatheringMemos(filtered);
    autoSaveGatheringToFile();
    _syncToCloud('gathering', filtered);
    _notifyDataChanged('gathering');
    return true;
  }

  function clearAllGatheringMemos() {
    saveGatheringMemos([]);
    _syncToCloud('gathering', []);
    AppLogger.info('全集客メモを削除しました');
    _notifyDataChanged('gathering');
    return true;
  }

  // ============================================================
  // 集客メモ分析
  // ============================================================
  function getGatheringAnalysis() {
    const entries = getGatheringMemos();
    if (entries.length === 0) return null;

    const densityLabels = { many: '多い', normal: '普通', few: '少ない', none: 'いない' };
    const locationTypeLabels = { station: '駅', hospital: '病院', commercial: '商業施設', office: 'オフィス街', residential: '住宅街', event: 'イベント', other: 'その他' };

    // 場所×時間帯クロス集計
    const locationTimeMap = {};
    entries.forEach(e => {
      if (!e.location || !e.time) return;
      const hour = parseInt(e.time.split(':')[0], 10);
      const timeBand = hour < 6 ? '深夜' : hour < 9 ? '早朝' : hour < 12 ? '午前' : hour < 15 ? '午後早' : hour < 18 ? '午後遅' : hour < 21 ? '夕方' : '夜間';
      if (!locationTimeMap[e.location]) locationTimeMap[e.location] = {};
      if (!locationTimeMap[e.location][timeBand]) locationTimeMap[e.location][timeBand] = [];
      locationTimeMap[e.location][timeBand].push(e.density);
    });

    // 場所×時間帯マトリクス（多さの平均スコア: many=3, normal=2, few=1, none=0）
    const densityScore = { many: 3, normal: 2, few: 1, none: 0 };
    const timeBands = ['早朝', '午前', '午後早', '午後遅', '夕方', '夜間'];
    const locationMatrix = [];
    Object.keys(locationTimeMap).forEach(loc => {
      const row = { location: loc };
      timeBands.forEach(tb => {
        const densities = locationTimeMap[loc][tb] || [];
        if (densities.length === 0) { row[tb] = null; return; }
        const avg = densities.reduce((sum, d) => sum + (densityScore[d] || 0), 0) / densities.length;
        row[tb] = { score: avg, count: densities.length };
      });
      locationMatrix.push(row);
    });
    locationMatrix.sort((a, b) => {
      const scoreA = timeBands.reduce((s, tb) => s + (a[tb]?.score || 0), 0);
      const scoreB = timeBands.reduce((s, tb) => s + (b[tb]?.score || 0), 0);
      return scoreB - scoreA;
    });

    // 密度別集計
    const densityBreakdown = { many: 0, normal: 0, few: 0, none: 0 };
    entries.forEach(e => { if (densityBreakdown[e.density] !== undefined) densityBreakdown[e.density]++; });

    // 場所タイプ別集計
    const typeBreakdown = {};
    entries.forEach(e => {
      const t = e.locationType || 'other';
      if (!typeBreakdown[t]) typeBreakdown[t] = { type: t, label: locationTypeLabels[t] || t, count: 0, densities: { many: 0, normal: 0, few: 0, none: 0 } };
      typeBreakdown[t].count++;
      if (typeBreakdown[t].densities[e.density] !== undefined) typeBreakdown[t].densities[e.density]++;
    });

    // 曜日別集計
    const dayBreakdown = {};
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    days.forEach(d => { dayBreakdown[d] = { day: d, count: 0, densities: { many: 0, normal: 0, few: 0, none: 0 } }; });
    entries.forEach(e => {
      if (e.dayOfWeek && dayBreakdown[e.dayOfWeek]) {
        dayBreakdown[e.dayOfWeek].count++;
        if (dayBreakdown[e.dayOfWeek].densities[e.density] !== undefined) dayBreakdown[e.dayOfWeek].densities[e.density]++;
      }
    });

    return {
      total: entries.length,
      densityBreakdown,
      typeBreakdown: Object.values(typeBreakdown).sort((a, b) => b.count - a.count),
      dayBreakdown: days.map(d => dayBreakdown[d]),
      locationMatrix,
      timeBands,
      densityLabels,
      locationTypeLabels,
    };
  }

  function downloadGatheringCSV() {
    const entries = getGatheringMemos();
    if (entries.length === 0) {
      AppLogger.warn('エクスポート対象の集客メモがありません');
      return false;
    }
    const densityLabels = { many: '多い', normal: '普通', few: '少ない', none: 'いない' };
    const typeLabels = { station: '駅', hospital: '病院', commercial: '商業施設', office: 'オフィス街', residential: '住宅街', event: 'イベント', other: 'その他' };
    const header = 'ID,日付,曜日,祝日,時刻,場所,緯度,経度,客の多さ,場所タイプ,天気,滞在分,メモ,入力方法';
    const rows = entries.map(e => {
      const esc = (s) => (s || '').replace(/,/g, '、');
      const lat = e.locationCoords ? e.locationCoords.lat : '';
      const lng = e.locationCoords ? e.locationCoords.lng : '';
      return `${e.id},${e.date},${e.dayOfWeek},${e.holiday},${e.time},${esc(e.location)},${lat},${lng},${densityLabels[e.density] || e.density},${typeLabels[e.locationType] || e.locationType},${esc(e.weather)},${e.stayMinutes || 0},${esc(e.memo)},${e.source || 'manual'}`;
    });
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = getLocalDateString();
    link.href = url;
    link.download = `gathering_memos_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    AppLogger.info(`集客メモCSVエクスポート完了: ${entries.length}件`);
    return true;
  }

  async function autoSaveGatheringToFile() {
    await _handleReady;
    if (!_dirHandle) return;
    const entries = getGatheringMemos();
    if (entries.length === 0) return;
    const dateStr = getLocalDateString();
    await _saveToSubFolder('集客メモ', `集客メモ_${dateStr}.json`, entries, APP_CONSTANTS.VERSION);
  }

  async function manualSaveGatheringToFile() {
    await _handleReady;
    const entries = getGatheringMemos();
    if (entries.length === 0) { AppLogger.warn('保存する集客メモがありません'); return; }
    if (_dirHandle) {
      const dateStr = getLocalDateString();
      await _saveToSubFolder('集客メモ', `集客メモ_${dateStr}.json`, entries, APP_CONSTANTS.VERSION);
      AppLogger.info('集客メモを手動保存しました');
    } else {
      const data = JSON.stringify({ version: APP_CONSTANTS.VERSION, exportedAt: new Date().toISOString(), count: entries.length, entries }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `集客メモ_${getLocalDateString()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  // ============================================================
  // イベントデータ CRUD
  // ============================================================
  function getEvents() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.EVENTS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  function saveEvents(entries) {
    try {
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.EVENTS, JSON.stringify(entries));
      return true;
    } catch (e) {
      AppLogger.error('イベントデータの保存に失敗しました', e.message);
      return false;
    }
  }

  function addEvent(form) {
    if (!form.name || !form.name.trim()) {
      return { success: false, errors: ['イベント名を入力してください'] };
    }
    const entries = getEvents();
    const entryDate = form.date || getLocalDateString();
    const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: form.name.trim(),
      date: entryDate,
      dayOfWeek: dateInfo.dayOfWeek,
      holiday: dateInfo.holiday || '',
      startTime: form.startTime || '',
      endTime: form.endTime || '',
      location: form.location || '',
      locationCoords: form.locationCoords || null,
      scale: form.scale || '',
      impact: form.impact || '',
      memo: form.memo || '',
      timestamp: new Date().toISOString(),
    };
    entries.unshift(entry);
    saveEvents(entries);
    const holidayStr = dateInfo.holiday ? ` [${dateInfo.holiday}]` : '';
    AppLogger.info(`イベント記録追加: ${entry.name} (${entry.date} ${dateInfo.dayOfWeek}${holidayStr})`);
    return { success: true, entry };
  }

  function deleteEvent(id) {
    const entries = getEvents();
    const filtered = entries.filter(e => e.id !== id);
    saveEvents(filtered);
    AppLogger.info('イベント記録を削除しました');
    return true;
  }

  function clearAllEvents() {
    saveEvents([]);
    AppLogger.info('全イベントデータを削除しました');
    return true;
  }

  // 公共交通機関情報の自動保存（サブフォルダ「公共交通機関情報」）
  async function autoSaveTransitToFile(transitData) {
    await _handleReady;
    if (!_dirHandle) return;
    if (!transitData || Object.keys(transitData).length === 0) return;
    const now = new Date();
    const dateTimeStr = now.getFullYear()
      + '-' + String(now.getMonth() + 1).padStart(2, '0')
      + '-' + String(now.getDate()).padStart(2, '0')
      + '_' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0');
    await _saveToSubFolder('公共交通機関情報', `交通情報_${dateTimeStr}.json`, [transitData], '0.6.0');
  }

  // ============================================================
  // 売上向上機能
  // ============================================================

  function _timeToMinutes(t) {
    if (!t || !t.includes(':')) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function getUtilizationRate() {
    const entries = getEntries();
    const today = toDateStr(new Date().toISOString());
    const todayEntries = entries
      .filter(e => toDateStr(e.timestamp) === today && e.pickupTime && e.dropoffTime)
      .sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''));
    let occupied = 0, vacant = 0;
    todayEntries.forEach((e, i) => {
      const p = _timeToMinutes(e.pickupTime);
      const d = _timeToMinutes(e.dropoffTime);
      if (p !== null && d !== null && d > p) occupied += d - p;
      if (i < todayEntries.length - 1) {
        const nextP = _timeToMinutes(todayEntries[i + 1].pickupTime);
        if (d !== null && nextP !== null && nextP > d) vacant += nextP - d;
      }
    });
    const total = occupied + vacant;
    return {
      occupiedMin: occupied,
      vacantMin: vacant,
      rate: total > 0 ? Math.round((occupied / total) * 100) : 0,
      rideCount: todayEntries.length,
    };
  }

  function getTopPickupAreasForNow() {
    const entries = getEntries();
    const now = new Date();
    const currentHour = now.getHours();
    const currentDow = ['日','月','火','水','木','金','土'][now.getDay()];
    const areas = {};
    entries.forEach(e => {
      if (!e.pickup || !e.amount) return;
      const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : null;
      if (hr === null) return;
      if (Math.abs(hr - currentHour) > 1 && Math.abs(hr - currentHour) < 23) return;
      if (e.dayOfWeek !== currentDow) return;
      if (!areas[e.pickup]) areas[e.pickup] = { name: e.pickup, total: 0, count: 0 };
      areas[e.pickup].total += e.amount;
      areas[e.pickup].count += 1;
    });
    // 奇数日は駅前エリアを除外
    const isOddDay = now.getDate() % 2 !== 0;
    const stPat = /駅前|旭川駅/;
    return Object.values(areas)
      .filter(a => a.count >= 2)
      .filter(a => !isOddDay || !stPat.test(a.name))
      .map(a => ({ ...a, avg: Math.round(a.total / a.count) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
  }

  function getGoalProgress() {
    const settings = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}');
    const dailyGoal = Number(settings.dailyGoal) || 0;
    if (!dailyGoal) return null;
    const todayAmount = getTodaySummary().totalAmount;
    const entries = getEntries();
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthAmount = entries
      .filter(e => (e.date || toDateStr(e.timestamp)).startsWith(monthKey))
      .reduce((s, e) => s + (e.amount || 0), 0);
    const monthDays = new Set(
      entries
        .filter(e => (e.date || toDateStr(e.timestamp)).startsWith(monthKey))
        .map(e => e.date || toDateStr(e.timestamp))
    ).size;
    const monthlyGoalCalc = dailyGoal * monthDays;
    return {
      dailyGoal,
      todayAmount,
      dailyRate: Math.round((todayAmount / dailyGoal) * 100),
      monthAmount,
      monthDays,
      monthlyGoal: monthlyGoalCalc,
      monthlyRate: monthlyGoalCalc > 0 ? Math.round((monthAmount / monthlyGoalCalc) * 100) : 0,
    };
  }

  function getUpcomingEventAlerts() {
    const events = getEvents();
    const today = toDateStr(new Date().toISOString());
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return events
      .filter(e => {
        if (e.date !== today || !e.endTime) return false;
        const endMin = _timeToMinutes(e.endTime);
        if (endMin === null) return false;
        return nowMin >= endMin - 30 && nowMin <= endMin;
      })
      .map(e => ({
        name: e.name,
        endTime: e.endTime,
        location: e.location,
        scale: e.scale,
        minutesLeft: _timeToMinutes(e.endTime) - nowMin,
      }));
  }

  // ============================================================
  // よく乗車される場所の自動検出（座標クラスタリング）
  // 機能1: 時間帯・曜日フィルタ (forNow=true)
  // 機能2: 時間減衰（直近30日=重み2, それ以前=重み1）
  // 機能3: 隣接セル統合（0.001°以内のセルをマージ）
  // 機能4: 金額帯分布（short/mid/long）
  // 機能5: 24時間ヒストグラム
  // 機能6: 曜日×時間帯クロス集計
  // 機能7: イベント相関（イベント日の需要倍率）
  // 機能9: 行き先パターン分析
  // ============================================================
  function getFrequentPickupSpots(options) {
    options = options || {};
    const forNow = !!options.forNow;
    const entries = getEntries();
    const now = new Date();
    const currentHour = now.getHours();
    const currentDow = ['日','月','火','水','木','金','土'][now.getDay()];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 機能7: イベント日セットを構築
    const events = getEvents();
    const eventDates = new Set(events.map(ev => ev.date).filter(Boolean));
    // イベント日の座標セット(locationCoords)
    const eventCoordsByDate = {};
    events.forEach(ev => {
      if (ev.date && ev.locationCoords && ev.locationCoords.lat) {
        if (!eventCoordsByDate[ev.date]) eventCoordsByDate[ev.date] = [];
        eventCoordsByDate[ev.date].push(ev.locationCoords);
      }
    });

    const grid = {};

    entries.forEach(e => {
      if (!e.pickupCoords || !e.pickupCoords.lat || !e.pickupCoords.lng || !e.amount) return;

      // 機能1: 時間帯・曜日フィルタ
      if (forNow) {
        const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : null;
        if (hr === null) return;
        if (Math.abs(hr - currentHour) > 1 && Math.abs(hr - currentHour) < 23) return;
        if (e.dayOfWeek !== currentDow) return;
      }

      const gLat = Math.round(e.pickupCoords.lat * 1000) / 1000;
      const gLng = Math.round(e.pickupCoords.lng * 1000) / 1000;
      const key = `${gLat},${gLng}`;
      if (!grid[key]) {
        grid[key] = {
          gLat, gLng, lat: 0, lng: 0, count: 0, weightedCount: 0,
          totalAmount: 0, names: {}, hours: {}, days: {},
          tiers: { short: 0, mid: 0, long: 0 },
          dayHours: {},  // 機能6: "月_22" 形式
          dropoffs: {},  // 機能9: 行き先集計
          eventCount: 0, nonEventCount: 0,  // 機能7
        };
      }
      const cell = grid[key];
      cell.lat += e.pickupCoords.lat;
      cell.lng += e.pickupCoords.lng;
      cell.count += 1;
      cell.totalAmount += e.amount;

      // 機能2: 時間減衰
      const entryDate = e.date || (e.timestamp ? e.timestamp.slice(0, 10) : '');
      const isRecent = entryDate ? new Date(entryDate) >= thirtyDaysAgo : false;
      cell.weightedCount += isRecent ? 2 : 1;

      // 名前集計
      if (e.pickup) cell.names[e.pickup] = (cell.names[e.pickup] || 0) + 1;

      // 機能5: 時間帯ヒストグラム
      const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : NaN;
      if (!isNaN(hr)) cell.hours[hr] = (cell.hours[hr] || 0) + 1;

      // 曜日集計
      if (e.dayOfWeek) cell.days[e.dayOfWeek] = (cell.days[e.dayOfWeek] || 0) + 1;

      // 機能4: 金額帯
      const tier = e.amount <= 1000 ? 'short' : e.amount <= 1999 ? 'mid' : 'long';
      cell.tiers[tier] += 1;

      // 機能6: 曜日×時間帯クロス
      if (e.dayOfWeek && !isNaN(hr)) {
        const dhKey = `${e.dayOfWeek}_${hr}`;
        cell.dayHours[dhKey] = (cell.dayHours[dhKey] || 0) + 1;
      }

      // 機能7: イベント日判定
      if (entryDate && eventDates.has(entryDate)) {
        cell.eventCount += 1;
      } else {
        cell.nonEventCount += 1;
      }

      // 機能9: 行き先パターン
      if (e.dropoff) {
        cell.dropoffs[e.dropoff] = (cell.dropoffs[e.dropoff] || 0) + 1;
      }
    });

    // 機能3: 隣接セル統合
    const cells = Object.values(grid);
    const merged = [];
    const used = new Set();
    for (let i = 0; i < cells.length; i++) {
      if (used.has(i)) continue;
      const base = cells[i];
      used.add(i);
      for (let j = i + 1; j < cells.length; j++) {
        if (used.has(j)) continue;
        const other = cells[j];
        if (Math.abs(base.gLat - other.gLat) <= 0.001 && Math.abs(base.gLng - other.gLng) <= 0.001) {
          // マージ
          base.lat += other.lat;
          base.lng += other.lng;
          base.count += other.count;
          base.weightedCount += other.weightedCount;
          base.totalAmount += other.totalAmount;
          base.eventCount += other.eventCount;
          base.nonEventCount += other.nonEventCount;
          Object.entries(other.names).forEach(([k, v]) => base.names[k] = (base.names[k] || 0) + v);
          Object.entries(other.hours).forEach(([k, v]) => base.hours[k] = (base.hours[k] || 0) + v);
          Object.entries(other.days).forEach(([k, v]) => base.days[k] = (base.days[k] || 0) + v);
          Object.keys(other.tiers).forEach(k => base.tiers[k] += other.tiers[k]);
          Object.entries(other.dayHours).forEach(([k, v]) => base.dayHours[k] = (base.dayHours[k] || 0) + v);
          Object.entries(other.dropoffs).forEach(([k, v]) => base.dropoffs[k] = (base.dropoffs[k] || 0) + v);
          used.add(j);
        }
      }
      merged.push(base);
    }

    const minCount = forNow ? 2 : 3;
    return merged
      .filter(c => c.count >= minCount)
      .map(c => {
        const topName = Object.entries(c.names).sort((a, b) => b[1] - a[1])[0];
        const topHour = Object.entries(c.hours).sort((a, b) => b[1] - a[1])[0];
        const topDay = Object.entries(c.days).sort((a, b) => b[1] - a[1])[0];

        // 機能5: 24時間ヒストグラム
        const hourly = [];
        for (let h = 0; h < 24; h++) hourly.push(c.hours[h] || 0);

        // 機能6: 曜日×時間帯 TOP3
        const topDayHours = Object.entries(c.dayHours)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => { const [d, h] = k.split('_'); return { day: d, hour: parseInt(h, 10), count: v }; });

        // 機能7: イベント需要倍率
        let eventMultiplier = null;
        if (c.eventCount >= 1 && c.nonEventCount >= 1) {
          // イベント日数 vs 非イベント日数で正規化
          const totalDays = new Set(entries.filter(e => e.date).map(e => e.date)).size || 1;
          const eDays = eventDates.size || 1;
          const neDays = totalDays - eDays || 1;
          const eventRate = c.eventCount / eDays;
          const nonEventRate = c.nonEventCount / neDays;
          if (nonEventRate > 0) eventMultiplier = Math.round(eventRate / nonEventRate * 10) / 10;
        }

        // 機能9: 行き先TOP3
        const topDropoffs = Object.entries(c.dropoffs)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, count]) => ({ name, count }));

        return {
          name: TaxiApp.utils.applyPlaceAlias(topName ? topName[0] : '不明な場所'),
          count: c.count,
          weightedCount: c.weightedCount,
          avgAmount: Math.round(c.totalAmount / c.count),
          centroid: { lat: c.lat / c.count, lng: c.lng / c.count },
          peakHour: topHour ? parseInt(topHour[0], 10) : null,
          peakDay: topDay ? topDay[0] : null,
          tiers: c.tiers,
          hourly,
          topDayHours,
          eventMultiplier,
          topDropoffs,
        };
      })
      .sort((a, b) => b.weightedCount - a.weightedCount)
      .slice(0, 10);
  }

  // 機能8: 逆ジオコーディング（Nominatim）キャッシュ付き
  const _geocodeCache = {};
  async function reverseGeocodeSpot(lat, lng) {
    const key = `${Math.round(lat * 1000)},${Math.round(lng * 1000)}`;
    if (_geocodeCache[key]) return _geocodeCache[key];
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&accept-language=ja`,
        { headers: { 'User-Agent': 'TaxiSupportApp/1.0' } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const name = data.name || (data.address && (data.address.building || data.address.amenity || data.address.shop || data.address.tourism || data.address.road)) || null;
      _geocodeCache[key] = name;
      return name;
    } catch {
      return null;
    }
  }

  async function getFrequentPickupSpotsWithNames(options) {
    const spots = getFrequentPickupSpots(options);
    const results = [];
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      // Nominatim利用規約: 1リクエスト/秒以下（2件目以降に1秒待機）
      if (i > 0) await new Promise(r => setTimeout(r, 1100));
      const geoName = await reverseGeocodeSpot(spot.centroid.lat, spot.centroid.lng);
      results.push({ ...spot, geoName: geoName || null });
    }
    return results;
  }

  // チェーン提案: 降車地付近の過去乗車地を推薦
  function getChainSuggestion(dropoffLocation, dropoffCoords) {
    const result = { suggestions: [], nearbyPickupHistory: [] };
    if (!dropoffCoords || !dropoffCoords.lat) return result;

    const entries = getEntries();
    const now = new Date();
    const currentHour = now.getHours();

    // 降車地の1km以内（≒0.009度）の過去乗車地を検索
    const nearbyPickups = {};
    entries.forEach(e => {
      if (!e.pickupCoords || !e.pickupCoords.lat) return;
      const dLat = Math.abs(e.pickupCoords.lat - dropoffCoords.lat);
      const dLng = Math.abs(e.pickupCoords.lng - dropoffCoords.lng);
      if (dLat > 0.009 || dLng > 0.012) return; // 約1km
      const name = e.pickup || `${e.pickupCoords.lat.toFixed(4)},${e.pickupCoords.lng.toFixed(4)}`;
      if (!nearbyPickups[name]) nearbyPickups[name] = { name, count: 0, totalAmount: 0, coords: e.pickupCoords };
      nearbyPickups[name].count++;
      nearbyPickups[name].totalAmount += e.amount || 0;
    });

    const history = Object.values(nearbyPickups)
      .map(p => ({ name: p.name, count: p.count, avgAmount: p.count > 0 ? Math.round(p.totalAmount / p.count) : 0 }))
      .sort((a, b) => b.count - a.count);
    result.nearbyPickupHistory = history.slice(0, 5);

    // 待機スポット需要指数とクロス
    const waitingData = getWaitingSpotDemandIndex();
    const cruisingData = getCruisingAreaDemandIndex();

    const candidates = [];
    waitingData.spots.forEach(spot => {
      if (spot.currentDisabled) return;
      const dLat = Math.abs(spot.lat - dropoffCoords.lat);
      const dLng = Math.abs(spot.lng - dropoffCoords.lng);
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
      if (distKm > 3) return;
      const histMatch = history.find(h => h.name.includes(spot.name) || spot.name.includes(h.name));
      candidates.push({
        name: spot.name, distance: `${distKm.toFixed(1)}km`,
        demandScore: spot.currentIndex,
        avgWaitMin: 15, avgFare: histMatch ? histMatch.avgAmount : 1500,
        reason: spot.currentIndex >= 60 ? '高需要スポット' : histMatch ? '過去実績あり' : '近距離',
      });
    });

    candidates.sort((a, b) => b.demandScore - a.demandScore);
    result.suggestions = candidates.slice(0, 3);
    return result;
  }

  // 時間帯・曜日対応ヒートマップデータ
  // mode: 'all' | 'timeAware' | 'transit' | 'combined'
  function getSmartHeatmapData(mode) {
    mode = mode || 'all';

    // transit: 交通需要ポイントのみ
    if (mode === 'transit') {
      const transitPoints = getTransitHeatmapData();
      return {
        points: transitPoints,
        stats: { totalRides: 0, timeFiltered: transitPoints.length, mode: 'transit' },
      };
    }

    const entries = getEntries();
    const rivals = getRivalEntries();
    const now = new Date();
    const currentHour = now.getHours();
    const currentDow = now.getDay();
    const nowMs = now.getTime();
    const DAY_MS = 86400000;

    const origins = [];

    entries.forEach(e => {
      if (!e.pickupCoords || !e.pickupCoords.lat || !e.pickupCoords.lng) return;
      let weight = 1;
      if (mode === 'timeAware') {
        // 時間帯マッチ: ±2時間以内なら高weight
        const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : null;
        const hourDiff = hr !== null ? Math.min(Math.abs(hr - currentHour), 24 - Math.abs(hr - currentHour)) : 12;
        const hourFactor = hourDiff <= 2 ? (1 - hourDiff * 0.2) : 0.2;

        // 曜日マッチ: 同じ曜日なら高weight
        const entryDate = new Date(e.timestamp || e.date);
        const entryDow = entryDate.getDay();
        const dowFactor = entryDow === currentDow ? 1.5 : 1.0;

        // 鮮度: 直近30日以内は高weight、古いデータは減衰
        const ageDays = (nowMs - entryDate.getTime()) / DAY_MS;
        const recencyFactor = ageDays <= 7 ? 1.5 : ageDays <= 30 ? 1.0 : ageDays <= 90 ? 0.6 : 0.3;

        weight = hourFactor * dowFactor * recencyFactor;
      }
      origins.push({ lat: e.pickupCoords.lat, lng: e.pickupCoords.lng, weight: weight, amount: e.amount || 0 });
    });

    rivals.forEach(r => {
      if (!r.locationCoords || !r.locationCoords.lat || !r.locationCoords.lng) return;
      let weight = 0.8;
      if (mode === 'timeAware') {
        const hr = r.time ? parseInt(r.time.split(':')[0], 10) : null;
        const hourDiff = hr !== null ? Math.min(Math.abs(hr - currentHour), 24 - Math.abs(hr - currentHour)) : 12;
        weight = (hourDiff <= 2 ? (1 - hourDiff * 0.2) : 0.2) * 0.8;
        const entryDate = new Date(r.timestamp || r.date);
        const ageDays = (nowMs - entryDate.getTime()) / DAY_MS;
        weight *= ageDays <= 7 ? 1.5 : ageDays <= 30 ? 1.0 : ageDays <= 90 ? 0.6 : 0.3;
      }
      origins.push({ lat: r.locationCoords.lat, lng: r.locationCoords.lng, weight: weight, amount: 0 });
    });

    if (origins.length === 0) return { points: [], stats: { totalRides: 0, timeFiltered: 0 } };

    const CELL_SIZE = 0.002;
    const RADIUS_DEG = 0.018;
    const RADIUS_KM = 2.0;
    const grid = {};

    origins.forEach(origin => {
      const latSteps = Math.ceil(RADIUS_DEG / CELL_SIZE);
      for (let di = -latSteps; di <= latSteps; di++) {
        for (let dj = -latSteps; dj <= latSteps; dj++) {
          const cellLat = origin.lat + di * CELL_SIZE;
          const cellLng = origin.lng + dj * CELL_SIZE;
          const dlat = cellLat - origin.lat;
          const dlng = (cellLng - origin.lng) * Math.cos(origin.lat * Math.PI / 180);
          const distKm = Math.sqrt(dlat * dlat + dlng * dlng) * 111.32;
          if (distKm > RADIUS_KM) continue;
          const key = `${(Math.round(cellLat / CELL_SIZE) * CELL_SIZE).toFixed(4)},${(Math.round(cellLng / CELL_SIZE) * CELL_SIZE).toFixed(4)}`;
          if (!grid[key]) {
            grid[key] = { lat: Math.round(cellLat / CELL_SIZE) * CELL_SIZE, lng: Math.round(cellLng / CELL_SIZE) * CELL_SIZE, count: 0 };
          }
          const falloff = Math.exp(-(distKm * distKm) / (2 * 0.8 * 0.8));
          grid[key].count += falloff * origin.weight;
        }
      }
    });

    let points = Object.values(grid).map(g => ({ lat: g.lat, lng: g.lng, weight: g.count }));
    const timeFilteredCount = mode === 'timeAware'
      ? entries.filter(e => {
          if (!e.pickupCoords || !e.pickupTime) return false;
          const hr = parseInt(e.pickupTime.split(':')[0], 10);
          return Math.min(Math.abs(hr - currentHour), 24 - Math.abs(hr - currentHour)) <= 2;
        }).length
      : origins.length;

    // combined: 乗車データ + 交通需要を統合
    if (mode === 'combined') {
      const transitPoints = getTransitHeatmapData();
      points = points.concat(transitPoints);
    }

    return {
      points: points,
      stats: {
        totalRides: entries.filter(e => e.pickupCoords && e.pickupCoords.lat).length,
        timeFiltered: timeFilteredCount,
        mode: mode,
      },
    };
  }

  // 場所名→座標の変換ヘルパー
  function _resolveLocationCoords(locationName) {
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    if (!locationName) return null;
    const name = locationName.toLowerCase();
    if (name.includes('旭川駅') || name.includes('駅前') || name.includes('駅')) {
      return { lat: locs.station.lat, lng: locs.station.lng };
    }
    for (const h of locs.hospitals) {
      if (name.includes(h.name) || h.name.includes(locationName)) {
        return { lat: h.lat, lng: h.lng };
      }
    }
    // ホテル名での座標解決
    for (const hotel of (locs.hotels || [])) {
      if (name.includes(hotel.name) || hotel.name.includes(locationName)) {
        return { lat: hotel.lat, lng: hotel.lng };
      }
    }
    // ホテル部分一致フォールバック
    if (name.includes('アートホテル')) return { lat: locs.hotels[0].lat, lng: locs.hotels[0].lng };
    if (name.includes('omo7') || name.includes('omo')) return { lat: locs.hotels[1].lat, lng: locs.hotels[1].lng };
    if (name.includes('トーヨー')) return { lat: locs.hotels[2].lat, lng: locs.hotels[2].lng };
    if (name.includes('ドーミーイン')) return { lat: locs.hotels[3].lat, lng: locs.hotels[3].lng };
    if (name.includes('クレッセント')) return { lat: locs.hotels[4].lat, lng: locs.hotels[4].lng };
    if (name.includes('cabin') || name.includes('プレミアホテル')) return { lat: locs.hotels[5].lat, lng: locs.hotels[5].lng };
    if (name.includes('アマネク')) return { lat: locs.hotels[6].lat, lng: locs.hotels[6].lng };
    if (name.includes('ルートイングランド') || name.includes('ルートインgrand')) return { lat: locs.hotels[7].lat, lng: locs.hotels[7].lng };
    if (name.includes('jrイン')) return { lat: locs.hotels[8].lat, lng: locs.hotels[8].lng };
    // 部分一致でフォールバック（病院）
    if (name.includes('医大') || name.includes('医科大')) return { lat: locs.hospitals[0].lat, lng: locs.hospitals[0].lng };
    if (name.includes('赤十字')) return { lat: locs.hospitals[1].lat, lng: locs.hospitals[1].lng };
    if (name.includes('市立')) return { lat: locs.hospitals[2].lat, lng: locs.hospitals[2].lng };
    if (name.includes('厚生')) return { lat: locs.hospitals[3].lat, lng: locs.hospitals[3].lng };
    return null;
  }

  // 病院外来スケジュールデータ（リアルタイム状態判定）
  function getHospitalScheduleData() {
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const schedules = locs.hospitalSchedules || [];
    if (schedules.length === 0) return { hospitals: [], timestamp: new Date().toISOString() };

    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    function timeToMin(hhmm) {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    }

    const hospitals = schedules.map(hosp => {
      const isClosed = hosp.closedDays.includes(dayOfWeek);
      if (isClosed) {
        return { id: hosp.id, name: hosp.name, lat: hosp.lat, lng: hosp.lng,
          currentStatus: 'closed', nextEvent: null, demandWeight: 0 };
      }

      // 退院ピーク中かチェック
      let inDischargePeak = null;
      for (const dp of hosp.dischargePeaks) {
        const dpStart = timeToMin(dp.start);
        const dpEnd = timeToMin(dp.end);
        if (currentMin >= dpStart && currentMin <= dpEnd) {
          inDischargePeak = dp;
          break;
        }
      }
      if (inDischargePeak) {
        const dpEnd = timeToMin(inDischargePeak.end);
        return { id: hosp.id, name: hosp.name, lat: hosp.lat, lng: hosp.lng,
          currentStatus: 'discharge_peak', nextEvent: { type: 'peak_end', minutesLeft: dpEnd - currentMin, label: inDischargePeak.label },
          demandWeight: inDischargePeak.weight };
      }

      // 受付中かチェック
      let inReception = null;
      for (const rec of hosp.reception) {
        if (!rec.days.includes(dayOfWeek)) continue;
        const rStart = timeToMin(rec.start);
        const rEnd = timeToMin(rec.end);
        if (currentMin >= rStart && currentMin <= rEnd) {
          inReception = rec;
          break;
        }
      }
      if (inReception) {
        // 次の退院ピークを探す
        let nextPeak = null;
        for (const dp of hosp.dischargePeaks) {
          const dpStart = timeToMin(dp.start);
          if (dpStart > currentMin) { nextPeak = { type: 'discharge_peak', minutesLeft: dpStart - currentMin, label: dp.label }; break; }
        }
        return { id: hosp.id, name: hosp.name, lat: hosp.lat, lng: hosp.lng,
          currentStatus: 'reception_open', nextEvent: nextPeak, demandWeight: 0.3 };
      }

      // 受付前かチェック
      let nextReception = null;
      for (const rec of hosp.reception) {
        if (!rec.days.includes(dayOfWeek)) continue;
        const rStart = timeToMin(rec.start);
        if (rStart > currentMin) { nextReception = { type: 'reception_start', minutesLeft: rStart - currentMin, label: '受付開始' }; break; }
      }
      if (nextReception) {
        return { id: hosp.id, name: hosp.name, lat: hosp.lat, lng: hosp.lng,
          currentStatus: 'before_reception', nextEvent: nextReception, demandWeight: 0 };
      }

      // 次の退院ピークを探す
      let nextDP = null;
      for (const dp of hosp.dischargePeaks) {
        const dpStart = timeToMin(dp.start);
        if (dpStart > currentMin) { nextDP = { type: 'discharge_peak', minutesLeft: dpStart - currentMin, label: dp.label }; break; }
      }
      if (nextDP) {
        return { id: hosp.id, name: hosp.name, lat: hosp.lat, lng: hosp.lng,
          currentStatus: 'between_sessions', nextEvent: nextDP, demandWeight: 0 };
      }

      return { id: hosp.id, name: hosp.name, lat: hosp.lat, lng: hosp.lng,
        currentStatus: 'closed', nextEvent: null, demandWeight: 0 };
    });

    return { hospitals, timestamp: now.toISOString() };
  }

  // 旭川駅前バスターミナル到着便の構造化データ（実時刻表ベース）
  function getBusArrivalsData() {
    const now = new Date();
    const isWeekend = [0, 6].includes(now.getDay());
    function addMin(hhmm, min) {
      const [h, m] = hhmm.split(':').map(Number);
      const t = h * 60 + m + min;
      return String(Math.floor(t / 60)).padStart(2,'0') + ':' + String(t % 60).padStart(2,'0');
    }

    const arrivals = [];

    // 高速あさひかわ号（札幌→旭川 冬ダイヤ2時間25分）
    const sapporoDep = [
      '07:00','08:00','08:30','09:00','09:50','10:30','11:00','11:30',
      '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30',
      '16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:40','20:20','20:50','21:30',
    ];
    const sappWeekend = ['13:45','19:20'];
    let allSap = [...sapporoDep];
    if (isWeekend) allSap = allSap.concat(sappWeekend);
    allSap.forEach(dep => {
      arrivals.push({ type: '高速バス', line: '高速あさひかわ号', arrivalTime: addMin(dep, 145), origin: '札幌', demandDelay: 5, peakWeight: 0.8 });
    });

    // 特急オホーツク号（紋別→旭川）
    arrivals.push({ type: '都市間バス', line: '特急オホーツク号', arrivalTime: '09:45', origin: '紋別', demandDelay: 5, peakWeight: 0.6 });
    arrivals.push({ type: '都市間バス', line: '特急オホーツク号', arrivalTime: '14:45', origin: '紋別', demandDelay: 5, peakWeight: 0.6 });

    // ノースライナー号（帯広→旭川）
    ['12:00','13:30','15:10','19:55','21:10'].forEach(t => {
      arrivals.push({ type: '都市間バス', line: 'ノースライナー号', arrivalTime: t, origin: '帯広', demandDelay: 5, peakWeight: 0.7 });
    });

    // サンライズ号（北見→旭川）
    arrivals.push({ type: '都市間バス', line: 'サンライズ号', arrivalTime: '15:15', origin: '北見', demandDelay: 5, peakWeight: 0.6 });
    arrivals.push({ type: '都市間バス', line: 'サンライズ号', arrivalTime: '20:30', origin: '北見', demandDelay: 5, peakWeight: 0.6 });

    // 名寄線（名寄→旭川）
    ['09:07','11:59','13:14','14:49','17:34','20:09'].forEach(t => {
      arrivals.push({ type: '路線バス', line: '名寄線', arrivalTime: t, origin: '名寄', demandDelay: 3, peakWeight: 0.4 });
    });

    // 特急天北号（鬼志別→旭川）
    arrivals.push({ type: '都市間バス', line: '特急天北号', arrivalTime: '11:10', origin: '鬼志別', demandDelay: 5, peakWeight: 0.5 });

    // 旭川空港連絡バス（空港→旭川駅）
    ['09:19','10:09','13:49','14:49','15:09','16:39','19:49','19:59'].forEach(t => {
      arrivals.push({ type: '空港バス', line: '空港連絡バス', arrivalTime: t, origin: '旭川空港', demandDelay: 3, peakWeight: 0.9 });
    });

    // 旭山動物園線（動物園→旭川駅）
    ['11:40','12:10','13:10','14:10','15:40','16:10'].forEach(t => {
      arrivals.push({ type: '路線バス', line: '旭山動物園線', arrivalTime: t, origin: '旭山動物園', demandDelay: 3, peakWeight: 0.5 });
    });

    // 時刻順ソート
    arrivals.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
    return arrivals;
  }

  // 当日の需要プランを取得（バス実データ + Geminiプラン + イベントデータをマージ）
  function getDailyDemandSchedule() {
    const stored = AppStorage.get(APP_CONSTANTS.STORAGE_KEYS.DAILY_DEMAND_PLAN, null);
    const today = new Date().toISOString().slice(0, 10);

    // バス到着データは常に利用可能（ハードコード）
    const busArrivals = getBusArrivalsData();

    // Geminiデータがなくてもバスデータだけで「available」にする
    const hasGemini = stored && stored.date === today && stored.data;
    const geminiData = hasGemini ? stored.data : {};

    // transitArrivals: バス実データ + Gemini（JR特急等）をマージ、重複排除
    const geminiArrivals = geminiData.transitArrivals || [];
    const mergedArrivals = [...busArrivals];
    geminiArrivals.forEach(ga => {
      // バスデータと同時刻・同路線名の重複を排除
      const isDup = mergedArrivals.some(ba =>
        ba.arrivalTime === ga.arrivalTime && ba.line === ga.line
      );
      if (!isDup) mergedArrivals.push(ga);
    });
    mergedArrivals.sort((a, b) => (a.arrivalTime || '').localeCompare(b.arrivalTime || ''));

    // イベントアラートをマージ
    const eventAlerts = getUpcomingEventAlerts();
    const mergedPlan = [...(geminiData.dailyPlan || [])];

    eventAlerts.forEach(evt => {
      mergedPlan.push({
        startTime: evt.endTime ? evt.endTime.replace(/^(\d{1,2}):(\d{2})$/, (m, h, min) => {
          const hh = parseInt(h, 10);
          return `${String(hh).padStart(2,'0')}:${min}`;
        }) : '18:00',
        endTime: evt.endTime || '19:00',
        location: evt.location || 'イベント会場周辺',
        action: `${evt.name} 終了 → 周辺で需要増`,
        demandLevel: 'high',
      });
    });

    // ホテルピーク時間帯をdailyPlanに自動挿入
    const hotelLocs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const hotelPeaks = hotelLocs.hotelPeakWindows || {};
    const hotels = hotelLocs.hotels || [];
    const veryHighHotels = hotels.filter(h => h.demandLevel === 'very_high').map(h => h.name);
    const highHotels = hotels.filter(h => h.demandLevel === 'high').map(h => h.name);

    // 各ピーク時間帯をプランに追加（重複回避）
    Object.entries(hotelPeaks).forEach(([key, win]) => {
      const isDup = mergedPlan.some(p =>
        p.startTime === win.start && p.location && p.location.includes('ホテル')
      );
      if (isDup) return;
      const topHotels = key === 'checkout' || key === 'checkin'
        ? veryHighHotels.slice(0, 2).join('・')
        : highHotels.slice(0, 2).join('・');
      mergedPlan.push({
        startTime: win.start,
        endTime: win.end,
        location: `${topHotels}周辺`,
        action: `ホテル${win.label} → 周辺で需要増`,
        demandLevel: key === 'checkout' ? 'high' : 'medium',
        source: 'hotel',
      });
    });

    // ホテルの現在のピーク状態を算出
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    function _timeToMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
    const hotelWindows = [];
    Object.entries(hotelPeaks).forEach(([key, win]) => {
      const startMin = _timeToMin(win.start);
      const endMin = _timeToMin(win.end);
      const isActive = currentMinutes >= startMin - 15 && currentMinutes <= endMin + 15;
      const isCurrent = currentMinutes >= startMin && currentMinutes <= endMin;
      if (isActive) {
        const activeHotels = hotels
          .filter(h => h.demandLevel === 'very_high' || h.demandLevel === 'high')
          .map(h => ({ name: h.name, rooms: h.rooms, distKm: h.distKm, demandLevel: h.demandLevel }));
        hotelWindows.push({
          key: key,
          label: win.label,
          start: win.start,
          end: win.end,
          isCurrent: isCurrent,
          hotels: activeHotels,
        });
      }
    });

    // 時間順ソート
    mergedPlan.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    // 奇数日フィルタ: 駅前待機不可の日は駅関連ブロックを除外
    const isOddDay = now.getDate() % 2 !== 0;
    const stationPattern = /駅前|旭川駅/;
    const filteredPlan = isOddDay
      ? mergedPlan.filter(block => !stationPattern.test(block.location || '') || /病院|医大|商業|イオン|ホテル/.test(block.action || ''))
      : mergedPlan;
    const filteredDemandWindows = isOddDay
      ? (geminiData.demandWindows || []).filter(w => !stationPattern.test(w.location || ''))
      : (geminiData.demandWindows || []);

    return {
      available: true,  // バスデータは常にあるのでtrue
      date: today,
      transitArrivals: mergedArrivals,
      hospitalWindows: geminiData.hospitalWindows || [],
      demandWindows: filteredDemandWindows,
      hotelWindows: hotelWindows,
      dailyPlan: filteredPlan,
      isOddDay: isOddDay,
      hasGeminiPlan: hasGemini,
    };
  }

  // 日勤タイムライン: 7-17時のイベントを時系列でマージ
  function getDayShiftTimeline(weatherImpact) {
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const events = [];
    let eventId = 0;

    function timeToMin(hhmm) {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    }
    function minToTime(m) {
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }

    // バス到着 (7-17時のみ)
    const busData = getBusArrivalsData();
    busData.forEach(arr => {
      if (!arr.arrivalTime) return;
      const arrMin = timeToMin(arr.arrivalTime);
      if (arrMin < 420 || arrMin > 1020) return; // 7:00-17:00
      events.push({
        id: `bus-${eventId++}`, time: arr.arrivalTime, timeMin: arrMin,
        endTime: minToTime(arrMin + 15), type: 'bus',
        title: `${arr.line || arr.type}`, subtitle: `${arr.origin || ''} → 旭川駅`,
        demandLevel: arr.peakWeight >= 0.8 ? 'high' : arr.peakWeight >= 0.5 ? 'medium' : 'low',
        icon: 'directions_bus', color: '#3b82f6',
        isCurrent: currentMin >= arrMin && currentMin <= arrMin + 15,
        isPast: currentMin > arrMin + 15,
      });
    });

    // 病院退院ピーク
    const hospSchedules = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.hospitalSchedules || [];
    const dayOfWeek = now.getDay();
    hospSchedules.forEach(hosp => {
      if (hosp.closedDays.includes(dayOfWeek)) return;
      hosp.dischargePeaks.forEach(dp => {
        const dpStartMin = timeToMin(dp.start);
        const dpEndMin = timeToMin(dp.end);
        if (dpStartMin < 420 || dpStartMin > 1020) return;
        events.push({
          id: `hosp-${eventId++}`, time: dp.start, timeMin: dpStartMin,
          endTime: dp.end, type: 'hospital',
          title: hosp.name.replace('旭川', ''), subtitle: dp.label,
          demandLevel: dp.weight >= 0.9 ? 'high' : 'medium',
          icon: 'local_hospital', color: '#ef4444',
          isCurrent: currentMin >= dpStartMin && currentMin <= dpEndMin,
          isPast: currentMin > dpEndMin,
        });
      });
    });

    // ホテルCO/CI
    const hotelPeaks = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.hotelPeakWindows || {};
    Object.entries(hotelPeaks).forEach(([key, pw]) => {
      const pwStartMin = timeToMin(pw.start);
      const pwEndMin = timeToMin(pw.end);
      if (pwStartMin < 420 || pwStartMin > 1020) return;
      events.push({
        id: `hotel-${eventId++}`, time: pw.start, timeMin: pwStartMin,
        endTime: pw.end, type: 'hotel',
        title: pw.label || key, subtitle: `需要weight: ${pw.weight}`,
        demandLevel: pw.weight >= 0.8 ? 'high' : 'medium',
        icon: 'hotel', color: '#8b5cf6',
        isCurrent: currentMin >= pwStartMin && currentMin <= pwEndMin,
        isPast: currentMin > pwEndMin,
      });
    });

    // イベント
    const eventAlerts = getUpcomingEventAlerts();
    eventAlerts.forEach(a => {
      const endMin = a.endTime ? timeToMin(a.endTime) : currentMin + a.minutesLeft;
      const startMin = endMin - 120; // 推定2時間前
      if (endMin < 420 || startMin > 1020) return;
      events.push({
        id: `event-${eventId++}`, time: minToTime(Math.max(startMin, 420)), timeMin: Math.max(startMin, 420),
        endTime: a.endTime || minToTime(endMin), type: 'event',
        title: a.name, subtitle: a.location || '',
        demandLevel: 'high', icon: 'event', color: '#f59e0b',
        isCurrent: currentMin >= startMin && currentMin <= endMin,
        isPast: currentMin > endMin,
      });
    });

    // 天気変化
    if (weatherImpact && weatherImpact.alerts) {
      weatherImpact.alerts.forEach(alert => {
        const alertMin = timeToMin(alert.time);
        if (alertMin < 420 || alertMin > 1020) return;
        events.push({
          id: `weather-${eventId++}`, time: alert.time, timeMin: alertMin,
          endTime: minToTime(alertMin + 60), type: 'weather',
          title: alert.message.split('→')[0] || alert.message, subtitle: alert.message.split('→')[1] || '',
          demandLevel: alert.severity === 'high' ? 'high' : 'medium',
          icon: 'cloud', color: '#06b6d4',
          isCurrent: false, isPast: currentMin > alertMin + 60,
        });
      });
    }

    // 時間順ソート
    events.sort((a, b) => a.timeMin - b.timeMin);

    // 次のイベント
    const nextEventIndex = events.findIndex(e => !e.isPast && !e.isCurrent);
    const nextEvent = nextEventIndex >= 0 ? events[nextEventIndex] : null;
    const countdown = nextEvent ? { minutes: nextEvent.timeMin - currentMin, event: nextEvent } : null;

    // 現在位置（0.0〜1.0）
    const nowPosition = Math.max(0, Math.min(1, (currentMin - 420) / 600));

    return {
      events, nextEventIndex, countdown, nowPosition,
      timelineRange: { start: 7, end: 17 },
    };
  }

  // 次の最適行動を提案
  function getNextOptimalAction(currentCoords, weatherImpact) {
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const isEvenDay = now.getDate() % 2 === 0;

    const hospitalData = getHospitalScheduleData();
    const waitingData = getWaitingSpotDemandIndex();
    const cruisingData = getCruisingAreaDemandIndex();
    const busData = getBusArrivalsData();
    const hotelPeaks = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.hotelPeakWindows || {};

    const candidates = [];

    // 1. バス到着15分以内 && 偶数日 → 駅前待機
    if (isEvenDay) {
      busData.forEach(arr => {
        if (!arr.arrivalTime) return;
        const [h, m] = arr.arrivalTime.split(':').map(Number);
        const arrMin = h * 60 + m;
        const diff = arrMin - currentMin;
        if (diff > 0 && diff <= 15) {
          const stationSpot = waitingData.spots.find(s => s.id === 'station');
          const score = stationSpot ? stationSpot.currentIndex : 50;
          if (score > 30) {
            candidates.push({
              action: '駅前で待機', reason: `${arr.line || arr.type}が${arr.arrivalTime}着（あと${diff}分）`,
              urgency: 'now', demandScore: score, estimatedRevenue: 2000,
              estimatedWaitMin: diff + 5, priority: 100,
            });
          }
        }
      });
    }

    // 2. 病院退院ピーク中
    hospitalData.hospitals.forEach(hosp => {
      if (hosp.currentStatus === 'discharge_peak' && hosp.demandWeight > 0) {
        candidates.push({
          action: `${hosp.name.replace('旭川', '')}で待機`,
          reason: `退院ピーク中（需要weight ${hosp.demandWeight}）`,
          urgency: 'now', demandScore: Math.round(hosp.demandWeight * 80),
          estimatedRevenue: 2500, estimatedWaitMin: 10, priority: 90,
        });
      } else if (hosp.nextEvent && hosp.nextEvent.type === 'discharge_peak' && hosp.nextEvent.minutesLeft <= 30) {
        candidates.push({
          action: `${hosp.name.replace('旭川', '')}へ移動`,
          reason: `退院ピークまであと${hosp.nextEvent.minutesLeft}分`,
          urgency: 'soon', demandScore: 60,
          estimatedRevenue: 2500, estimatedWaitMin: hosp.nextEvent.minutesLeft, priority: 70,
        });
      }
    });

    // 3. ホテルCO/CI中
    Object.values(hotelPeaks).forEach(pw => {
      const pwStartMin = parseInt(pw.start.split(':')[0], 10) * 60 + parseInt(pw.start.split(':')[1] || '0', 10);
      const pwEndMin = parseInt(pw.end.split(':')[0], 10) * 60 + parseInt(pw.end.split(':')[1] || '0', 10);
      if (currentMin >= pwStartMin && currentMin <= pwEndMin) {
        candidates.push({
          action: `ホテル周辺で待機`,
          reason: `${pw.label || ''}ピーク中 (${pw.start}-${pw.end})`,
          urgency: 'now', demandScore: Math.round(pw.weight * 70),
          estimatedRevenue: 2000, estimatedWaitMin: 15, priority: 75,
        });
      } else if (pwStartMin - currentMin > 0 && pwStartMin - currentMin <= 30) {
        candidates.push({
          action: `ホテル周辺へ移動`,
          reason: `${pw.label || ''}まであと${pwStartMin - currentMin}分`,
          urgency: 'soon', demandScore: 50,
          estimatedRevenue: 2000, estimatedWaitMin: pwStartMin - currentMin, priority: 60,
        });
      }
    });

    // 4. 天気変化1時間以内
    if (weatherImpact && weatherImpact.alerts && weatherImpact.alerts.length > 0) {
      const nextAlert = weatherImpact.alerts[0];
      candidates.push({
        action: '高需要スポットへ移動',
        reason: nextAlert.message,
        urgency: 'soon', demandScore: 55,
        estimatedRevenue: 1800, estimatedWaitMin: 20, priority: 55,
      });
    }

    // 5. フォールバック: 最高スコアの待機or流し
    const allSpots = [
      ...waitingData.spots.filter(s => !s.currentDisabled).map(s => ({ name: s.name, score: s.currentIndex, type: '待機' })),
      ...cruisingData.areas.map(a => ({ name: a.name, score: a.currentIndex, type: '流し' })),
    ].sort((a, b) => b.score - a.score);

    if (allSpots.length > 0) {
      candidates.push({
        action: allSpots[0].type === '待機' ? `${allSpots[0].name}で待機` : `${allSpots[0].name}で流し`,
        reason: `需要スコア${allSpots[0].score}（現在最高）`,
        urgency: 'plan', demandScore: allSpots[0].score,
        estimatedRevenue: 1500, estimatedWaitMin: 20, priority: 40,
      });
    }

    // 優先度ソート
    candidates.sort((a, b) => b.priority - a.priority);

    const best = candidates[0] || {
      action: '待機継続', reason: '特に大きな変動なし',
      urgency: 'plan', demandScore: 30, estimatedRevenue: 1000, estimatedWaitMin: 30,
    };

    const alternatives = candidates.slice(1, 3).map(c => ({
      action: c.action, reason: c.reason, demandScore: c.demandScore,
    }));

    // 次の遷移ポイント
    let nextTransition = null;
    const futureCandidate = candidates.find(c => c.urgency === 'soon');
    if (futureCandidate) {
      nextTransition = { time: `あと${futureCandidate.estimatedWaitMin}分`, action: futureCandidate.action };
    }

    return {
      action: best.action, reason: best.reason, urgency: best.urgency,
      demandScore: best.demandScore, estimatedRevenue: best.estimatedRevenue,
      estimatedWaitMin: best.estimatedWaitMin, alternatives, nextTransition,
    };
  }

  // ホテル需要データを算出（時間帯×客室数×駅距離からウェイト計算）
  function getHotelDemandData() {
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const hotels = locs.hotels || [];
    const peaks = locs.hotelPeakWindows || {};
    if (hotels.length === 0) return [];

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const origins = [];

    function timeToMin(hhmm) {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    }

    const maxRooms = 355; // プレミアホテルCABIN旭川を基準に正規化

    hotels.forEach(hotel => {
      Object.values(peaks).forEach(window => {
        const startMin = timeToMin(window.start);
        const endMin = timeToMin(window.end);

        // ウィンドウ内 → フルweight、ウィンドウ外30分以内 → 線形減衰
        let timeWeight = 0;
        if (currentMinutes >= startMin && currentMinutes <= endMin) {
          timeWeight = 1.0;
        } else if (currentMinutes >= startMin - 30 && currentMinutes < startMin) {
          timeWeight = (currentMinutes - (startMin - 30)) / 30;
        } else if (currentMinutes > endMin && currentMinutes <= endMin + 30) {
          timeWeight = 1.0 - (currentMinutes - endMin) / 30;
        }
        if (timeWeight <= 0) return;

        // 駅距離ファクター: 遠いほどタクシー需要が高い
        const distanceFactor = hotel.distKm >= 0.8 ? 1.0 : hotel.distKm >= 0.4 ? 0.6 : 0.3;
        // 客室数ファクター: 多いほど需要ボリュームが大きい
        const roomFactor = hotel.rooms / maxRooms;

        const weight = window.weight * timeWeight * distanceFactor * roomFactor;
        if (weight > 0.01) {
          origins.push({ lat: hotel.lat, lng: hotel.lng, weight: weight });
        }
      });
    });

    return origins;
  }

  // 天候需要インパクト分析（時間別天気予報から需要変動を算出）
  // 注意: forecastDataは非同期で取得済みのデータを外部から渡す
  function getWeatherDemandImpact(forecastData) {
    const result = {
      current: { weather: '不明', temp: null, multiplier: 1.0 },
      upcoming: [],
      alerts: [],
      overallShiftImpact: 1.0,
    };
    if (!forecastData || !forecastData.hours || forecastData.hours.length === 0) return result;

    const now = new Date();
    const currentHour = now.getHours();

    function getMultiplier(weather, temp, windSpeed) {
      let m = 1.0;
      if (weather === '雨' || weather === 'にわか雨' || weather === '霧雨') m = Math.max(m, 1.25);
      if (weather === '雪' || weather === 'にわか雪' || weather === '霧雪' || weather === '凍雨') m = Math.max(m, 1.35);
      if (weather === '雷雨') m = Math.max(m, 1.35);
      if (temp != null && temp <= -5) m *= 1.15;
      if (windSpeed != null && windSpeed > 10) m *= 1.10;
      return Math.round(m * 100) / 100;
    }

    // 現在時間のデータ
    const currentData = forecastData.hours.find(h => h.hour === currentHour);
    if (currentData) {
      result.current = {
        weather: currentData.weather,
        temp: currentData.temperature,
        multiplier: getMultiplier(currentData.weather, currentData.temperature, currentData.windSpeed),
      };
    }

    // 7-17時の時間帯別データ
    let prevWeather = currentData ? currentData.weather : null;
    let shiftMultipliers = [];

    forecastData.hours.forEach(h => {
      if (h.hour < 7 || h.hour > 17) return;
      const mult = getMultiplier(h.weather, h.temperature, h.windSpeed);
      const changeAlert = prevWeather && h.weather !== prevWeather
        ? `${h.hour}時頃から${h.weather}` : null;
      result.upcoming.push({
        hour: h.hour, weather: h.weather, temp: h.temperature,
        multiplier: mult, changeAlert,
      });
      if (changeAlert && mult > 1.0) {
        const pctStr = Math.round((mult - 1) * 100);
        result.alerts.push({
          time: `${h.hour}:00`,
          message: `${h.hour}時頃から${h.weather}予報 → 需要+${pctStr}%見込み`,
          severity: mult >= 1.3 ? 'high' : 'medium',
        });
      }
      if (h.hour >= currentHour) shiftMultipliers.push(mult);
      prevWeather = h.weather;
    });

    if (shiftMultipliers.length > 0) {
      result.overallShiftImpact = Math.round(shiftMultipliers.reduce((s, m) => s + m, 0) / shiftMultipliers.length * 100) / 100;
    }

    return result;
  }

  // 待機スポット需要指数を算出（全スポット×24時間）
  function getWaitingSpotDemandIndex() {
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const spots = locs.waitingSpots || [];
    if (spots.length === 0) return { spots: [], timestamp: new Date().toISOString() };

    const now = new Date();
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay(); // 0=Sun
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isOddDay = now.getDate() % 2 !== 0;

    // 曜日係数
    const dayFactor = (() => {
      if (dayOfWeek === 5 && currentHour >= 17) return 1.2; // 金夜
      if (dayOfWeek === 6 && currentHour >= 10 && currentHour <= 18) return 1.15; // 土昼
      return 1.0;
    })();

    // 天気係数: GPSキャッシュ優先 → 直近エントリーフォールバック
    const weatherFactor = (() => {
      // GPSキャッシュ天気を最優先使用
      const gpsWeather = GpsLogService.getCurrentWeather();
      let weather = gpsWeather ? gpsWeather.weather : '';
      // フォールバック: 直近エントリーから天気取得
      if (!weather) {
        const entries = getEntries();
        const today = now.toISOString().slice(0, 10);
        const todayEntries = entries.filter(e => e.date === today && e.weather);
        if (todayEntries.length > 0) weather = todayEntries[todayEntries.length - 1].weather;
      }
      if (weather === '雨') return 1.25;
      if (weather === '雪') return 1.35;
      return 1.0;
    })();

    // スポットマッチング共通ヘルパー
    const spotKeywords = {
      station: /駅前|駅/, asahikawa_medical: /医大|医科大/, red_cross: /赤十字/,
      kosei: /厚生/, shiritsu: /市立/, aeon: /イオン/,
    };
    function _matchesSpot(spotId, text, coords, spotDef) {
      const kw = spotKeywords[spotId];
      if (kw && kw.test(text)) return true;
      if (coords && Math.abs(coords.lat - spotDef.lat) < 0.003 && Math.abs(coords.lng - spotDef.lng) < 0.003) return true;
      return false;
    }

    // 履歴データ集計: 各スポットの時間帯別平均需要
    const entries = getEntries();
    const historyBySpot = {};
    spots.forEach(spot => {
      historyBySpot[spot.id] = new Array(24).fill(null).map(() => ({ total: 0, count: 0 }));
    });
    entries.forEach(e => {
      if (!e.pickup || !e.pickupTime) return;
      const hour = parseInt(e.pickupTime.split(':')[0], 10);
      if (isNaN(hour) || hour < 0 || hour > 23) return;
      spots.forEach(spot => {
        if (_matchesSpot(spot.id, e.pickup, e.pickupCoords, spot)) {
          historyBySpot[spot.id][hour].total += (e.amount || 0);
          historyBySpot[spot.id][hour].count += 1;
        }
      });
    });

    // 集客メモ密度集計: 場所×時間帯のスコア
    const gatheringBySpot = {};
    spots.forEach(spot => {
      gatheringBySpot[spot.id] = new Array(24).fill(null).map(() => ({ totalScore: 0, count: 0 }));
    });
    const densityScoreMap = { many: 3, normal: 2, few: 1, none: 0 };
    const gatheringMemos = getGatheringMemos();
    gatheringMemos.forEach(m => {
      if (!m.time || !m.density) return;
      const hour = parseInt(m.time.split(':')[0], 10);
      if (isNaN(hour) || hour < 0 || hour > 23) return;
      spots.forEach(spot => {
        const matched = _matchesSpot(spot.id, m.location || '', m.locationCoords, spot);
        if (matched) {
          gatheringBySpot[spot.id][hour].totalScore += (densityScoreMap[m.density] || 0);
          gatheringBySpot[spot.id][hour].count += 1;
        }
      });
    });

    // 他社乗車密度集計: 場所×時間帯の目撃回数
    const rivalBySpot = {};
    spots.forEach(spot => {
      rivalBySpot[spot.id] = new Array(24).fill(null).map(() => 0);
    });
    const rivalEntries = getRivalEntries();
    rivalEntries.forEach(r => {
      if (!r.time) return;
      const hour = parseInt(r.time.split(':')[0], 10);
      if (isNaN(hour) || hour < 0 || hour > 23) return;
      spots.forEach(spot => {
        if (_matchesSpot(spot.id, r.location || '', r.locationCoords, spot)) {
          rivalBySpot[spot.id][hour] += 1;
        }
      });
    });

    // 交通機関到着データ（駅ブースト用）
    const busArrivals = getBusArrivalsData();

    // ホテル需要ウィンドウ（駅・イオンブースト用）
    const peaks = locs.hotelPeakWindows || {};

    function timeToMin(hhmm) {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    }

    // スポットごとに24時間分の指数を算出
    const result = spots.map(spot => {
      const hourlyIndex = [];
      for (let h = 0; h < 24; h++) {
        // 奇数日ルール: 駅前は待機不可
        if (spot.hasOddDayRule && isOddDay) {
          hourlyIndex.push({ hour: h, index: 0, disabled: true });
          continue;
        }

        const basePattern = isWeekend ? spot.basePatternWeekend : spot.basePatternWeekday;
        let base = basePattern[h] || 0;

        // 履歴データとのブレンド
        const hist = historyBySpot[spot.id][h];
        if (hist.count >= 3) {
          // 履歴十分: 60%履歴 40%ベース
          const histAvg = Math.min(100, hist.count * 8); // 件数ベースの需要推定
          base = histAvg * 0.6 + base * 0.4;
        }

        // 交通機関到着ブースト（駅のみ）
        let transitBoost = 0;
        if (spot.id === 'station') {
          busArrivals.forEach(arr => {
            if (!arr.arrivalTime) return;
            const arrMin = timeToMin(arr.arrivalTime) + (arr.demandDelay || 5);
            const hStart = h * 60;
            const hEnd = (h + 1) * 60;
            // この時間帯に到着便があればブースト
            if (arrMin >= hStart && arrMin < hEnd) {
              transitBoost += (arr.peakWeight || 0.5) * 10;
            }
          });
          transitBoost = Math.min(transitBoost, 30);
        }

        // ホテル需要ブースト（駅・イオン）
        let hotelBoost = 0;
        if (spot.id === 'station' || spot.id === 'aeon') {
          Object.values(peaks).forEach(pw => {
            const pwStart = parseInt(pw.start.split(':')[0], 10);
            const pwEnd = parseInt(pw.end.split(':')[0], 10);
            if (h >= pwStart && h <= pwEnd) {
              hotelBoost += pw.weight * 10;
            }
          });
          hotelBoost = Math.min(hotelBoost, 15);
        }

        // ピーク時間帯ブースト（病院 — hospitalSchedulesからリアルタイム判定）
        let peakBoost = 0;
        const hospSchedules = locs.hospitalSchedules || [];
        hospSchedules.forEach(hosp => {
          if (hosp.closedDays.includes(dayOfWeek)) return;
          // スポットが病院対応ならブースト
          const isNearHosp = spot.lat && hosp.lat && Math.abs(spot.lat - hosp.lat) < 0.01 && Math.abs(spot.lng - hosp.lng) < 0.01;
          const isHospSpot = spot.id && hosp.id && spot.id.includes(hosp.id.split('_')[0]);
          if (!isNearHosp && !isHospSpot && !spot.peakBoost) return;
          hosp.dischargePeaks.forEach(dp => {
            const dpStartH = parseInt(dp.start.split(':')[0], 10);
            const dpEndH = parseInt(dp.end.split(':')[0], 10);
            if (h >= dpStartH && h <= dpEndH) {
              peakBoost = Math.max(peakBoost, dp.weight * 20);
            }
          });
        });
        // フォールバック: 旧式peakBoost定義
        if (peakBoost === 0 && spot.peakBoost && h >= spot.peakBoost.startHour && h <= spot.peakBoost.endHour) {
          peakBoost = spot.peakBoost.boost;
        }

        // 集客メモ密度ブレンド: メモ2件以上の時間帯で30%メモ密度+70%既存値
        const gath = gatheringBySpot[spot.id][h];
        if (gath.count >= 2) {
          const avgDensity = gath.totalScore / gath.count; // 0-3スケール
          const memoDemand = (avgDensity / 3) * 100; // 0-100にスケール
          base = memoDemand * 0.3 + base * 0.7;
        }

        // 他社乗車ペナルティ: 2件以上で-5pt/件、最大-25pt
        const rivalCount = rivalBySpot[spot.id][h];
        let rivalPenalty = 0;
        if (rivalCount >= 2) {
          rivalPenalty = Math.min(rivalCount * 5, 25);
        }

        // 合算して係数適用
        let index = (base + transitBoost + hotelBoost + peakBoost) * dayFactor * weatherFactor - rivalPenalty;
        index = Math.round(Math.max(0, Math.min(100, index)));
        hourlyIndex.push({ hour: h, index: index, disabled: false });
      }

      return {
        id: spot.id,
        name: spot.name,
        shortName: spot.shortName,
        lat: spot.lat,
        lng: spot.lng,
        hourlyIndex: hourlyIndex,
        currentIndex: hourlyIndex[currentHour].index,
        currentDisabled: hourlyIndex[currentHour].disabled,
      };
    });

    // currentIndexの降順でソート
    result.sort((a, b) => b.currentIndex - a.currentIndex);

    return {
      spots: result,
      timestamp: now.toISOString(),
      currentHour: currentHour,
      isOddDay: isOddDay,
      weatherFactor: weatherFactor,
      dayFactor: dayFactor,
    };
  }

  // ============================================================
  // 流しエリア需要指数を算出（全エリア×24時間）
  // ============================================================
  function getCruisingAreaDemandIndex() {
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const areas = locs.cruisingAreas || [];
    if (areas.length === 0) return { areas: [], timestamp: new Date().toISOString() };

    const now = new Date();
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const dayFactor = (() => {
      if (dayOfWeek === 5 && currentHour >= 17) return 1.2;
      if (dayOfWeek === 6 && currentHour >= 10 && currentHour <= 18) return 1.15;
      return 1.0;
    })();

    // 天気係数: GPSキャッシュ優先 → 直近エントリーフォールバック
    const weatherFactor = (() => {
      const gpsWeather = GpsLogService.getCurrentWeather();
      let weather = gpsWeather ? gpsWeather.weather : '';
      if (!weather) {
        const entries = getEntries();
        const today = now.toISOString().slice(0, 10);
        const todayEntries = entries.filter(e => e.date === today && e.weather);
        if (todayEntries.length > 0) weather = todayEntries[todayEntries.length - 1].weather;
      }
      if (weather === '雨') return 1.25;
      if (weather === '雪') return 1.35;
      return 1.0;
    })();

    // エリアマッチングヘルパー
    function _matchesArea(area, text, coords) {
      const kw = area.keywords.join('|');
      if (new RegExp(kw).test(text)) return true;
      if (coords) {
        const dist = Math.sqrt(Math.pow(coords.lat - area.lat, 2) + Math.pow(coords.lng - area.lng, 2));
        if (dist < 0.015) return true;
      }
      return false;
    }

    // 履歴データ集計
    const entries = getEntries();
    const historyByArea = {};
    areas.forEach(area => {
      historyByArea[area.id] = new Array(24).fill(null).map(() => ({ total: 0, count: 0 }));
    });
    entries.forEach(e => {
      if (!e.pickup || !e.pickupTime) return;
      const hour = parseInt(e.pickupTime.split(':')[0], 10);
      if (isNaN(hour) || hour < 0 || hour > 23) return;
      areas.forEach(area => {
        if (_matchesArea(area, e.pickup, e.pickupCoords)) {
          historyByArea[area.id][hour].total += (e.amount || 0);
          historyByArea[area.id][hour].count += 1;
        }
      });
    });

    // 集客メモ密度集計
    const gatheringByArea = {};
    areas.forEach(area => {
      gatheringByArea[area.id] = new Array(24).fill(null).map(() => ({ totalScore: 0, count: 0 }));
    });
    const densityScoreMap2 = { many: 3, normal: 2, few: 1, none: 0 };
    const gatheringMemos2 = getGatheringMemos();
    gatheringMemos2.forEach(m => {
      if (!m.time || !m.density) return;
      const hour = parseInt(m.time.split(':')[0], 10);
      if (isNaN(hour) || hour < 0 || hour > 23) return;
      areas.forEach(area => {
        if (_matchesArea(area, m.location || '', m.locationCoords)) {
          gatheringByArea[area.id][hour].totalScore += (densityScoreMap2[m.density] || 0);
          gatheringByArea[area.id][hour].count += 1;
        }
      });
    });

    // 他社乗車密度集計
    const rivalByArea = {};
    areas.forEach(area => {
      rivalByArea[area.id] = new Array(24).fill(null).map(() => 0);
    });
    const rivalEntries2 = getRivalEntries();
    rivalEntries2.forEach(r => {
      if (!r.time) return;
      const hour = parseInt(r.time.split(':')[0], 10);
      if (isNaN(hour) || hour < 0 || hour > 23) return;
      areas.forEach(area => {
        if (_matchesArea(area, r.location || '', r.locationCoords)) {
          rivalByArea[area.id][hour] += 1;
        }
      });
    });

    const result = areas.map(area => {
      const hourlyIndex = [];
      for (let h = 0; h < 24; h++) {
        const basePattern = isWeekend ? area.basePatternWeekend : area.basePatternWeekday;
        let base = basePattern[h] || 0;

        const hist = historyByArea[area.id][h];
        if (hist.count >= 3) {
          const histAvg = Math.min(100, hist.count * 8);
          base = histAvg * 0.6 + base * 0.4;
        }

        // 集客メモ密度ブレンド
        const gath = gatheringByArea[area.id][h];
        if (gath.count >= 2) {
          const avgDensity = gath.totalScore / gath.count;
          const memoDemand = (avgDensity / 3) * 100;
          base = memoDemand * 0.3 + base * 0.7;
        }

        // 他社乗車ペナルティ
        const rivalCount = rivalByArea[area.id][h];
        let rivalPenalty = 0;
        if (rivalCount >= 2) {
          rivalPenalty = Math.min(rivalCount * 5, 25);
        }

        let index = base * dayFactor * weatherFactor - rivalPenalty;
        index = Math.round(Math.max(0, Math.min(100, index)));
        hourlyIndex.push({ hour: h, index: index });
      }

      return {
        id: area.id,
        name: area.name,
        shortName: area.shortName,
        lat: area.lat,
        lng: area.lng,
        hourlyIndex: hourlyIndex,
        currentIndex: hourlyIndex[currentHour].index,
      };
    });

    result.sort((a, b) => b.currentIndex - a.currentIndex);

    return {
      areas: result,
      timestamp: now.toISOString(),
      currentHour: currentHour,
      weatherFactor: weatherFactor,
      dayFactor: dayFactor,
    };
  }

  // ============================================================
  // 待機スポット売上シミュレーション
  // ============================================================
  function getWaitingSpotRevenueForecast() {
    const demandData = getWaitingSpotDemandIndex();
    if (!demandData.spots || demandData.spots.length === 0) {
      return { spots: [], assumptions: {}, timestamp: new Date().toISOString() };
    }

    const entries = getEntries();
    const memos = getGatheringMemos();
    const unitPrice = getUnitPriceAnalysis();
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const spots = locs.waitingSpots || [];

    const OPERATING_START = 6;
    const OPERATING_END = 22; // 6:00〜21:59
    const DEFAULT_RIDE_DURATION = 15; // 分

    // スポット別のマッチング関数（getWaitingSpotDemandIndexと同じロジック）
    function matchSpot(spotId, pickup, pickupCoords, spot) {
      if (spotId === 'station' && (/駅前|駅/.test(pickup) || (pickupCoords && Math.abs(pickupCoords.lat - spot.lat) < 0.003 && Math.abs(pickupCoords.lng - spot.lng) < 0.003))) return true;
      if (spotId === 'asahikawa_medical' && (/医大|医科大/.test(pickup) || (pickupCoords && Math.abs(pickupCoords.lat - spot.lat) < 0.003 && Math.abs(pickupCoords.lng - spot.lng) < 0.003))) return true;
      if (spotId === 'red_cross' && (/赤十字/.test(pickup) || (pickupCoords && Math.abs(pickupCoords.lat - spot.lat) < 0.003 && Math.abs(pickupCoords.lng - spot.lng) < 0.003))) return true;
      if (spotId === 'kosei' && (/厚生/.test(pickup) || (pickupCoords && Math.abs(pickupCoords.lat - spot.lat) < 0.003 && Math.abs(pickupCoords.lng - spot.lng) < 0.003))) return true;
      if (spotId === 'shiritsu' && (/市立/.test(pickup) || (pickupCoords && Math.abs(pickupCoords.lat - spot.lat) < 0.003 && Math.abs(pickupCoords.lng - spot.lng) < 0.003))) return true;
      if (spotId === 'aeon' && (/イオン/.test(pickup) || (pickupCoords && Math.abs(pickupCoords.lat - spot.lat) < 0.003 && Math.abs(pickupCoords.lng - spot.lng) < 0.003))) return true;
      return false;
    }

    // スポット別の実績データ集計
    const spotStats = {};
    spots.forEach(spot => {
      spotStats[spot.id] = {
        waitTimes: [],        // 待ち時間(分)の配列
        rideDurations: [],    // 乗車所要時間(分)の配列
        fares: [],            // 運賃の配列
        faresByHour: {},      // 時間帯別運賃
        waitByHour: {},       // 時間帯別待ち時間
      };
      for (let h = 0; h < 24; h++) {
        spotStats[spot.id].faresByHour[h] = [];
        spotStats[spot.id].waitByHour[h] = [];
      }
    });

    // 売上記録から実績集計
    entries.forEach(e => {
      if (!e.pickup || !e.pickupTime) return;
      const hour = parseInt(e.pickupTime.split(':')[0], 10);
      if (isNaN(hour)) return;
      spots.forEach(spot => {
        if (!matchSpot(spot.id, e.pickup, e.pickupCoords, spot)) return;
        if (e.amount > 0) {
          spotStats[spot.id].fares.push(e.amount);
          spotStats[spot.id].faresByHour[hour].push(e.amount);
        }
        if (e.waitingTime && !isNaN(Number(e.waitingTime)) && Number(e.waitingTime) > 0) {
          spotStats[spot.id].waitTimes.push(Number(e.waitingTime));
          spotStats[spot.id].waitByHour[hour].push(Number(e.waitingTime));
        }
        // 乗車所要時間: pickupTime→dropoffTimeの差
        if (e.pickupTime && e.dropoffTime) {
          const [ph, pm] = e.pickupTime.split(':').map(Number);
          const [dh, dm] = e.dropoffTime.split(':').map(Number);
          const dur = (dh * 60 + dm) - (ph * 60 + pm);
          if (dur > 0 && dur < 120) spotStats[spot.id].rideDurations.push(dur);
        }
      });
    });

    // 集客メモからも待ち時間を集計
    memos.forEach(m => {
      if (!m.location || !m.stayMinutes) return;
      const stay = Number(m.stayMinutes);
      if (isNaN(stay) || stay <= 0) return;
      const hour = m.time ? parseInt(m.time.split(':')[0], 10) : -1;
      spots.forEach(spot => {
        let match = false;
        if (spot.id === 'station' && /駅/.test(m.location)) match = true;
        if (spot.id === 'asahikawa_medical' && /医大|医科大/.test(m.location)) match = true;
        if (spot.id === 'red_cross' && /赤十字/.test(m.location)) match = true;
        if (spot.id === 'kosei' && /厚生/.test(m.location)) match = true;
        if (spot.id === 'shiritsu' && /市立/.test(m.location)) match = true;
        if (spot.id === 'aeon' && /イオン/.test(m.location)) match = true;
        if (match) {
          spotStats[spot.id].waitTimes.push(stay);
          if (hour >= 0 && hour <= 23) spotStats[spot.id].waitByHour[hour].push(stay);
        }
      });
    });

    // 需要指数→待ち時間推定のフォールバック
    function indexToWaitMin(index) {
      if (index >= 80) return 10;
      if (index >= 60) return 20;
      if (index >= 40) return 35;
      if (index >= 20) return 50;
      return 60;
    }

    // 時間帯別全体平均客単価
    const globalByHour = unitPrice.byHour; // [{hour, avg, count, ...}]

    let totalDataPoints = 0;

    // 各スポットのシミュレーション
    const forecastSpots = demandData.spots.map(dSpot => {
      const spot = spots.find(s => s.id === dSpot.id);
      const stats = spotStats[dSpot.id];

      // 全体平均乗車所要時間
      const avgRideDur = stats.rideDurations.length >= 3
        ? Math.round(stats.rideDurations.reduce((a, b) => a + b, 0) / stats.rideDurations.length)
        : DEFAULT_RIDE_DURATION;

      // 全体平均客単価(このスポット)
      const spotAvgFare = stats.fares.length > 0
        ? Math.round(stats.fares.reduce((a, b) => a + b, 0) / stats.fares.length)
        : 0;

      totalDataPoints += stats.fares.length + stats.waitTimes.length;

      const hourlyDetail = [];
      let dailyRevenue = 0;
      let dailyRides = 0;

      for (let h = 0; h < 24; h++) {
        const hd = dSpot.hourlyIndex[h];
        const disabled = hd ? hd.disabled : false;
        const index = hd ? hd.index : 0;

        if (h < OPERATING_START || h >= OPERATING_END || disabled) {
          hourlyDetail.push({ hour: h, rides: 0, revenue: 0, waitMin: 0, fare: 0, index: index, disabled: disabled });
          continue;
        }

        // 待ち時間: 時間帯別実績 → 全体実績 → 需要指数推定
        let waitMin;
        const hourWaits = stats.waitByHour[h];
        if (hourWaits && hourWaits.length >= 2) {
          waitMin = Math.round(hourWaits.reduce((a, b) => a + b, 0) / hourWaits.length);
        } else if (stats.waitTimes.length >= 3) {
          waitMin = Math.round(stats.waitTimes.reduce((a, b) => a + b, 0) / stats.waitTimes.length);
        } else {
          waitMin = indexToWaitMin(index);
        }
        waitMin = Math.max(5, waitMin); // 最低5分

        // 客単価: 時間帯別スポット実績 → スポット全体 → 全体時間帯別
        let fare;
        const hourFares = stats.faresByHour[h];
        if (hourFares && hourFares.length >= 2) {
          fare = Math.round(hourFares.reduce((a, b) => a + b, 0) / hourFares.length);
        } else if (spotAvgFare > 0) {
          fare = spotAvgFare;
        } else if (globalByHour[h] && globalByHour[h].avg > 0) {
          fare = globalByHour[h].avg;
        } else {
          fare = 1500; // 最終フォールバック
        }

        // 1時間あたり乗車回数
        const cycleMin = waitMin + avgRideDur;
        const rides = 60 / cycleMin;

        // 時間帯売上
        const revenue = Math.round(rides * fare);

        hourlyDetail.push({
          hour: h, rides: Math.round(rides * 100) / 100,
          revenue: revenue, waitMin: waitMin, fare: fare, index: index, disabled: false,
        });

        dailyRevenue += revenue;
        dailyRides += rides;
      }

      // dayFactor・weatherFactor適用
      dailyRevenue = Math.round(dailyRevenue * demandData.dayFactor * demandData.weatherFactor);

      // ピーク時間帯top3（営業時間内、売上降順）
      const opHours = hourlyDetail.filter(hd => hd.hour >= OPERATING_START && hd.hour < OPERATING_END && !hd.disabled && hd.revenue > 0);
      opHours.sort((a, b) => b.revenue - a.revenue);
      const peakHours = opHours.slice(0, 3).map(hd => hd.hour);

      return {
        id: dSpot.id,
        name: dSpot.name,
        shortName: dSpot.shortName,
        disabled: dSpot.currentDisabled,
        dailyRevenue: dailyRevenue,
        dailyRides: Math.round(dailyRides * 10) / 10,
        avgFare: spotAvgFare > 0 ? spotAvgFare : (globalByHour.find(h => h.avg > 0) || { avg: 1500 }).avg,
        avgWaitMin: stats.waitTimes.length > 0
          ? Math.round(stats.waitTimes.reduce((a, b) => a + b, 0) / stats.waitTimes.length)
          : Math.round(hourlyDetail.filter(h => h.waitMin > 0).reduce((s, h) => s + h.waitMin, 0) / Math.max(1, hourlyDetail.filter(h => h.waitMin > 0).length)),
        hourlyDetail: hourlyDetail,
        peakHours: peakHours,
      };
    });

    // dailyRevenue降順ソート
    forecastSpots.sort((a, b) => b.dailyRevenue - a.dailyRevenue);

    return {
      spots: forecastSpots,
      assumptions: {
        operatingStart: OPERATING_START,
        operatingEnd: OPERATING_END,
        defaultRideDuration: DEFAULT_RIDE_DURATION,
        dataPoints: totalDataPoints,
        dayFactor: demandData.dayFactor,
        weatherFactor: demandData.weatherFactor,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // 日勤需要スコア（7-17時特化の複合スコア）
  function getDayShiftDemandScore(weatherImpact) {
    const now = new Date();
    const currentHour = now.getHours();

    const hospitalData = getHospitalScheduleData();
    const hotelData = getHotelDemandData();
    const waitingData = getWaitingSpotDemandIndex();
    const cruisingData = getCruisingAreaDemandIndex();
    const busData = getBusArrivalsData();

    // 7-17の各時間帯スコアを計算
    const hourlyScores = [];
    for (let h = 7; h <= 17; h++) {
      // 履歴スコア: 待機+流しの平均
      let historyScore = 0;
      const waitScores = waitingData.spots.map(s => (s.hourlyIndex[h] || {}).index || 0);
      const cruiseScores = cruisingData.areas.map(a => (a.hourlyIndex[h] || {}).index || 0);
      if (waitScores.length + cruiseScores.length > 0) {
        historyScore = [...waitScores, ...cruiseScores].reduce((s, v) => s + v, 0) / (waitScores.length + cruiseScores.length);
      }

      // 病院スコア（実態ベース: 1台で回れるのは1病院のみ → 最高スコアの病院を採用）
      // 休診日は除外、ピーク中心からの距離でガウス減衰
      let hospitalScore = 0;
      const dayOfWeekForScore = now.getDay();
      const hospScheds = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.hospitalSchedules || [];
      hospScheds.forEach(sched => {
        if (sched.closedDays && sched.closedDays.includes(dayOfWeekForScore)) return;
        sched.dischargePeaks.forEach(dp => {
          const dpStartMin = parseInt(dp.start.split(':')[0], 10) * 60 + parseInt(dp.start.split(':')[1] || '0', 10);
          const dpEndMin = parseInt(dp.end.split(':')[0], 10) * 60 + parseInt(dp.end.split(':')[1] || '0', 10);
          const hMid = h * 60 + 30; // この時間帯の中央（例: 11時台なら11:30）
          if (hMid < dpStartMin - 30 || hMid > dpEndMin + 30) return;
          // ピーク中心からの距離でガウス減衰
          const peakCenter = (dpStartMin + dpEndMin) / 2;
          const distMin = Math.abs(hMid - peakCenter);
          const peakHalfWidth = (dpEndMin - dpStartMin) / 2;
          const sigma = Math.max(peakHalfWidth, 30);
          const gaussian = Math.exp(-(distMin * distMin) / (2 * sigma * sigma));
          const thisScore = dp.weight * 35 * gaussian; // 最大35pt（weight=1.0のピーク中心時）
          hospitalScore = Math.max(hospitalScore, thisScore); // 最高スコアの病院を採用
        });
      });
      hospitalScore = Math.min(hospitalScore, 60); // 病院単独で支配しないよう上限60

      // ホテルスコア
      let hotelScore = 0;
      const peaks = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.hotelPeakWindows || {};
      Object.values(peaks).forEach(pw => {
        const pwStart = parseInt(pw.start.split(':')[0], 10);
        const pwEnd = parseInt(pw.end.split(':')[0], 10);
        if (h >= pwStart && h <= pwEnd) hotelScore += pw.weight * 40;
      });
      hotelScore = Math.min(hotelScore, 100);

      // 交通スコア
      let transitScore = 0;
      busData.forEach(arr => {
        if (!arr.arrivalTime) return;
        const arrH = parseInt(arr.arrivalTime.split(':')[0], 10);
        if (arrH === h) transitScore += (arr.peakWeight || 0.5) * 25;
      });
      transitScore = Math.min(transitScore, 100);

      // 天気スコア
      let weatherScore = 0;
      if (weatherImpact && weatherImpact.upcoming) {
        const wh = weatherImpact.upcoming.find(u => u.hour === h);
        if (wh) weatherScore = (wh.multiplier - 1) * 200; // 1.25 → 50pt
      }
      weatherScore = Math.max(0, Math.min(100, weatherScore));

      // 時間帯スコア（需要パターン）
      const timePatterns = { 7: 30, 8: 55, 9: 65, 10: 70, 11: 60, 12: 40, 13: 45, 14: 50, 15: 55, 16: 60, 17: 50 };
      const timeScore = timePatterns[h] || 40;

      // 複合スコア（履歴重視: 実績データを最も信頼）
      const score = Math.round(
        historyScore * 0.35 + hospitalScore * 0.12 + hotelScore * 0.15 +
        transitScore * 0.15 + weatherScore * 0.10 + timeScore * 0.13
      );

      const topFactors = [];
      if (hospitalScore > 20) topFactors.push('病院');
      if (hotelScore > 30) topFactors.push('ホテル');
      if (transitScore > 30) topFactors.push('交通');
      if (weatherScore > 30) topFactors.push('天気');
      if (historyScore > 50) topFactors.push('履歴');

      hourlyScores.push({
        hour: h, score: Math.max(0, Math.min(100, score)), topFactors,
        breakdown: { hospital: Math.round(hospitalScore), hotel: Math.round(hotelScore),
          transit: Math.round(transitScore), weather: Math.round(weatherScore),
          history: Math.round(historyScore), time: timeScore },
      });
    }

    // 現在スコア
    const currentEntry = hourlyScores.find(hs => hs.hour === currentHour) || hourlyScores[0] || { score: 0, breakdown: {} };
    const currentScore = currentEntry ? currentEntry.score : 0;

    // ピーク時間
    const sorted = [...hourlyScores].sort((a, b) => b.score - a.score);
    const peakHours = sorted.slice(0, 3).map(hs => ({
      hour: hs.hour, score: hs.score, reason: hs.topFactors.join('+') || '総合',
    }));

    // ベストスポット
    let bestSpot = { name: '---', score: 0, reason: '' };
    const allSpots = [
      ...waitingData.spots.filter(s => !s.currentDisabled).map(s => ({ name: s.name, score: s.currentIndex, type: '待機' })),
      ...cruisingData.areas.map(a => ({ name: a.name, score: a.currentIndex, type: '流し' })),
    ].sort((a, b) => b.score - a.score);
    if (allSpots.length > 0) {
      bestSpot = { name: allSpots[0].name, score: allSpots[0].score, reason: allSpots[0].type };
    }

    // 総合レーティング
    const rating = currentScore > 70 ? 'excellent' : currentScore > 50 ? 'good' : currentScore > 30 ? 'normal' : 'slow';

    return {
      currentScore,
      scoreBreakdown: currentEntry.breakdown,
      hourlyScores,
      peakHours,
      bestSpot,
      overallShiftRating: rating,
    };
  }

  // 戦略シミュレーション: 指定時間帯の各スポット/エリアを比較
  function getStrategySimulation(targetHour) {
    targetHour = targetHour || new Date().getHours();
    const waitingData = getWaitingSpotDemandIndex();
    const cruisingData = getCruisingAreaDemandIndex();
    const revForecast = getWaitingSpotRevenueForecast();

    const strategies = [];

    // 待機スポット戦略
    waitingData.spots.forEach(spot => {
      const hourData = spot.hourlyIndex[targetHour] || {};
      const revSpot = revForecast.spots.find(r => r.id === spot.id);
      const hourlyRevDetail = revSpot && revSpot.hourlyDetail[targetHour];
      const hourlyRev = hourlyRevDetail ? hourlyRevDetail.revenue : 0;
      const waitMin = revSpot ? revSpot.avgWaitMin : 20;
      const avgFare = revSpot ? revSpot.avgFare : 1500;
      const ridesPerHour = waitMin > 0 ? Math.round(60 / (waitMin + 15) * 10) / 10 : 0;

      // リスクレベル: 需要指数の変動から推定
      const indices = Array.from({ length: 3 }, (_, i) => {
        const h = targetHour - 1 + i;
        return h >= 0 && h < 24 ? (spot.hourlyIndex[h] || {}).index || 0 : 0;
      });
      const avg = indices.reduce((s, v) => s + v, 0) / indices.length;
      const variance = indices.reduce((s, v) => s + (v - avg) * (v - avg), 0) / indices.length;
      const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
      const riskLevel = cv > 0.5 ? 'high' : cv > 0.25 ? 'medium' : 'low';

      strategies.push({
        type: 'waiting', location: spot.name, shortName: spot.shortName || spot.name,
        expectedHourlyRevenue: hourlyRev,
        expectedRidesPerHour: ridesPerHour,
        expectedWaitMin: waitMin, avgFare,
        riskLevel, demandScore: hourData.index || 0, disabled: spot.currentDisabled,
        factors: spot.currentDisabled ? ['待機不可'] : [],
      });
    });

    // 流しエリア戦略
    cruisingData.areas.forEach(area => {
      const hourData = area.hourlyIndex[targetHour] || {};
      const demandIdx = hourData.index || 0;
      const avgFare = 1200; // 流しは短距離中心の想定
      const ridesPerHour = demandIdx >= 60 ? 3 : demandIdx >= 40 ? 2 : 1;
      const hourlyRev = avgFare * ridesPerHour;

      strategies.push({
        type: 'cruising', location: area.name, shortName: area.shortName || area.name,
        expectedHourlyRevenue: hourlyRev,
        expectedRidesPerHour: ridesPerHour,
        expectedWaitMin: 0, avgFare,
        riskLevel: demandIdx < 30 ? 'high' : demandIdx < 50 ? 'medium' : 'low',
        demandScore: demandIdx, disabled: false,
        factors: [],
      });
    });

    // ソート: disabled以外を時給降順
    strategies.sort((a, b) => {
      if (a.disabled && !b.disabled) return 1;
      if (!a.disabled && b.disabled) return -1;
      return b.expectedHourlyRevenue - a.expectedHourlyRevenue;
    });

    const bestStrategy = strategies.find(s => !s.disabled) || null;

    return {
      strategies,
      bestStrategy: bestStrategy ? bestStrategy.location : '---',
      targetHour,
      comparison: {
        labels: strategies.filter(s => !s.disabled).slice(0, 5).map(s => s.shortName),
        revenues: strategies.filter(s => !s.disabled).slice(0, 5).map(s => s.expectedHourlyRevenue),
      },
    };
  }

  // 閑散期流しルート提案
  function getSlowPeriodCruisingRoutes() {
    const now = new Date();
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    // 需要スコア取得
    const demandScore = getDayShiftDemandScore(null);
    const currentScore = demandScore.currentScore || 0;

    // 売上目標達成率取得
    const goalProgress = getGoalProgress();
    const dailyRate = goalProgress ? goalProgress.dailyRate : 100;

    // 勤務時間判定
    const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
    const activeShift = shifts.find(s => !s.endTime);
    const hoursWorked = activeShift ? (Date.now() - new Date(activeShift.startTime).getTime()) / 3600000 : 0;

    // 閑散期判定
    const isLowDemand = currentScore <= 30;
    const isLowRevenue = hoursWorked >= 3 && dailyRate < 40;
    const isSlowPeriod = isLowDemand || isLowRevenue;

    if (!isSlowPeriod) {
      return { isSlowPeriod: false, trigger: null, currentScore, dailyRate, routes: [], generalTips: [] };
    }

    const trigger = isLowDemand && isLowRevenue ? '両方' : isLowDemand ? '需要低' : '売上不足';
    const routes = [];
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const hospSchedules = locs.hospitalSchedules || [];
    const hotelPeaks = locs.hotelPeakWindows || {};
    const cruisingAreas = locs.cruisingAreas || [];

    // --- ルート1: 病院帰宅ルート（平日のみ、退院ピーク時間帯） ---
    if (isWeekday) {
      const activeHospitals = hospSchedules.filter(sched => {
        if (sched.closedDays && sched.closedDays.includes(dayOfWeek)) return false;
        return sched.dischargePeaks.some(dp => {
          const startH = parseInt(dp.start.split(':')[0], 10);
          const endH = parseInt(dp.end.split(':')[0], 10);
          return currentHour >= startH - 1 && currentHour <= endH + 1;
        });
      });

      if (activeHospitals.length > 0) {
        // 最もウェイトの高い病院を選択
        let bestHosp = activeHospitals[0];
        let bestWeight = 0;
        activeHospitals.forEach(h => {
          h.dischargePeaks.forEach(dp => {
            if (dp.weight > bestWeight) { bestWeight = dp.weight; bestHosp = h; }
          });
        });

        const residentialAreas = cruisingAreas.filter(a =>
          ['toyooka', 'touko', 'kagura', 'midorimachi', 'shunko'].includes(a.id)
        );
        // 需要指数で上位2エリアを選択
        const rankedResidential = residentialAreas.map(a => {
          const hourData = (getCruisingAreaDemandIndex().areas.find(ca => ca.id === a.id) || {});
          const idx = hourData.hourlyIndex ? (hourData.hourlyIndex[currentHour] || {}).index || 0 : 0;
          return { ...a, demandIdx: idx };
        }).sort((a, b) => b.demandIdx - a.demandIdx).slice(0, 2);

        if (rankedResidential.length > 0) {
          const areaNames = [bestHosp.name.replace('旭川', ''), ...rankedResidential.map(a => a.shortName)];
          routes.push({
            id: 'hospital_return',
            label: '病院帰宅ルート',
            areas: areaNames,
            stayMinutes: [15, 20, 20],
            expectedRevenue: Math.round(1800 * 1.5),
            factor: '退院・通院終了の帰宅需要（長距離が多い）',
            tip: `${bestHosp.name.replace('旭川', '')}周辺で待機後、流しながら住宅街へ移動`,
          });
        }
      }
    }

    // --- ルート2: ホテル周辺ルート（CO/CI時間帯） ---
    const isCheckoutTime = currentHour >= 9 && currentHour <= 11;
    const isCheckinTime = currentHour >= 15 && currentHour <= 17;
    if (isCheckoutTime || isCheckinTime) {
      const timeLabel = isCheckoutTime ? 'チェックアウト' : 'チェックイン';
      const downtown = cruisingAreas.find(a => a.id === 'downtown');
      const hotelArea = '駅周辺ホテル';
      const areaNames = isCheckoutTime
        ? [hotelArea, downtown ? downtown.shortName : '中心地', '旭川駅']
        : ['旭川駅', downtown ? downtown.shortName : '中心地', hotelArea];

      routes.push({
        id: 'hotel_route',
        label: 'ホテル周辺ルート',
        areas: areaNames,
        stayMinutes: [15, 15, 20],
        expectedRevenue: Math.round(1400 * 1.8),
        factor: `${timeLabel}時間帯の観光客・ビジネス客需要`,
        tip: isCheckoutTime
          ? '駅遠方ホテル（アートホテル・OMO7）周辺から開始し駅方面へ'
          : '駅前で到着客を拾い、ホテル密集エリアへ',
      });
    }

    // --- ルート3: 需要探索ルート（常時、残りエリア） ---
    const usedAreaIds = new Set();
    routes.forEach(r => {
      if (r.id === 'hospital_return') usedAreaIds.add('idai');
      if (r.id === 'hotel_route') usedAreaIds.add('downtown');
    });

    const cruisingIndex = getCruisingAreaDemandIndex();
    const availableAreas = cruisingAreas
      .filter(a => !usedAreaIds.has(a.id))
      .map(a => {
        const areaData = cruisingIndex.areas.find(ca => ca.id === a.id) || {};
        const idx = areaData.hourlyIndex ? (areaData.hourlyIndex[currentHour] || {}).index || 0 : 0;
        return { ...a, demandIdx: idx };
      })
      .sort((a, b) => b.demandIdx - a.demandIdx)
      .slice(0, 3);

    if (availableAreas.length >= 2) {
      const avgDemand = availableAreas.reduce((s, a) => s + a.demandIdx, 0) / availableAreas.length;
      routes.push({
        id: 'demand_explore',
        label: '需要探索ルート',
        areas: availableAreas.map(a => a.shortName),
        stayMinutes: availableAreas.map(() => 15),
        expectedRevenue: Math.round(1200 * (avgDemand >= 30 ? 2 : 1.2)),
        factor: '相対的に需要が高いエリアを巡回',
        tip: `${availableAreas[0].shortName}から開始し、反応がなければ${availableAreas.length >= 2 ? availableAreas[1].shortName : '次'}へ移動`,
      });
    }

    // --- 一般アドバイス ---
    const generalTips = [];
    if (currentHour >= 7 && currentHour <= 9) {
      generalTips.push('朝は通勤・通院需要が中心。病院方面と駅周辺を重点的に');
    } else if (currentHour >= 10 && currentHour <= 14) {
      generalTips.push('昼間は需要が分散。移動距離を抑え、中心地周辺で効率重視');
    } else if (currentHour >= 15 && currentHour <= 17) {
      generalTips.push('午後はホテルCI・買物帰りが増加。駅周辺〜中心地が有望');
    }
    if (!isWeekday) {
      generalTips.push('土日は病院需要激減。ホテル・観光スポット周辺にシフト');
    }
    if (isLowRevenue) {
      generalTips.push('売上ペース低下中。1回の長距離より回転数重視で中心部を流す');
    }

    return { isSlowPeriod: true, trigger, currentScore, dailyRate, routes, generalTips };
  }

  // 交通到着データ + 病院ピークからヒートマップポイントを生成
  function getTransitHeatmapData() {
    const schedule = getDailyDemandSchedule();
    if (!schedule.available) return [];

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const origins = [];

    // 交通到着データからポイント生成
    (schedule.transitArrivals || []).forEach(arr => {
      if (!arr.arrivalTime) return;
      const parts = arr.arrivalTime.split(':');
      const arrMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      const delayMin = arr.demandDelay || 5;
      const peakMin = arrMin + delayMin;
      const diff = Math.abs(currentMinutes - peakMin);
      // 15分以内=1.0、60分で0に線形減衰
      if (diff > 60) return;
      const weight = diff <= 15 ? 1.0 : Math.max(0, 1.0 - (diff - 15) / 45);
      origins.push({
        lat: locs.station.lat,
        lng: locs.station.lng,
        weight: weight * (arr.peakWeight || 0.8),
      });
    });

    // 病院ピーク時間帯からポイント生成
    locs.hospitals.forEach(hosp => {
      const peaks = [hosp.peakMorning, hosp.peakAfternoon].filter(Boolean);
      peaks.forEach(peakStr => {
        const [start, end] = peakStr.split('-');
        const startParts = start.split(':');
        const endParts = end.split(':');
        const startMin = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
        const endMin = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);

        if (currentMinutes < startMin - 30 || currentMinutes > endMin + 30) return;
        let weight = 0.6;
        if (currentMinutes >= startMin && currentMinutes <= endMin) {
          weight = 1.0;
        } else {
          const dist = currentMinutes < startMin ? startMin - currentMinutes : currentMinutes - endMin;
          weight = Math.max(0.2, 1.0 - dist / 30);
        }
        origins.push({ lat: hosp.lat, lng: hosp.lng, weight: weight * 0.7 });
      });
    });

    // 需要ウィンドウからもポイント生成
    (schedule.demandWindows || []).forEach(dw => {
      if (!dw.startTime || !dw.endTime) return;
      const sp = dw.startTime.split(':');
      const ep = dw.endTime.split(':');
      const startMin = parseInt(sp[0], 10) * 60 + parseInt(sp[1], 10);
      const endMin = parseInt(ep[0], 10) * 60 + parseInt(ep[1], 10);
      if (currentMinutes < startMin - 15 || currentMinutes > endMin + 15) return;

      const coords = _resolveLocationCoords(dw.location);
      if (!coords) return;
      const levelWeight = dw.level === 'high' ? 1.0 : dw.level === 'medium' ? 0.7 : 0.4;
      origins.push({ lat: coords.lat, lng: coords.lng, weight: levelWeight });
    });

    // ホテル需要ポイントをマージ（静的データのためAPIキー不要）
    const hotelOrigins = getHotelDemandData();
    hotelOrigins.forEach(hp => origins.push(hp));

    if (origins.length === 0) return [];

    // 500m半径の細かいグリッド
    const CELL_SIZE = 0.001;
    const RADIUS_KM = 0.5;
    const RADIUS_DEG = RADIUS_KM / 111.32;
    const grid = {};

    origins.forEach(origin => {
      const latSteps = Math.ceil(RADIUS_DEG / CELL_SIZE);
      for (let di = -latSteps; di <= latSteps; di++) {
        for (let dj = -latSteps; dj <= latSteps; dj++) {
          const cellLat = origin.lat + di * CELL_SIZE;
          const cellLng = origin.lng + dj * CELL_SIZE;
          const dlat = cellLat - origin.lat;
          const dlng = (cellLng - origin.lng) * Math.cos(origin.lat * Math.PI / 180);
          const distKm = Math.sqrt(dlat * dlat + dlng * dlng) * 111.32;
          if (distKm > RADIUS_KM) continue;
          const key = `${cellLat.toFixed(4)},${cellLng.toFixed(4)}`;
          if (!grid[key]) {
            grid[key] = { lat: cellLat, lng: cellLng, count: 0 };
          }
          const falloff = Math.exp(-(distKm * distKm) / (2 * 0.2 * 0.2));
          grid[key].count += falloff * origin.weight;
        }
      }
    });

    return Object.values(grid).map(g => ({ lat: g.lat, lng: g.lng, weight: g.count }));
  }

  // ============================================================
  // ホテル価格蓄積・分析
  // ============================================================
  function getHotelPriceHistory() {
    const raw = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.HOTEL_PRICES);
    return raw ? JSON.parse(raw) : [];
  }

  function saveHotelPrices(pricesArray) {
    // pricesArray: [{ name, price, estimated, fetchedAt }]
    const history = getHotelPriceHistory();
    const now = new Date().toISOString();
    const record = { fetchedAt: now, prices: pricesArray };
    history.push(record);
    // 最大90日分（1日2回想定で180レコード）
    const maxRecords = 180;
    const trimmed = history.length > maxRecords ? history.slice(-maxRecords) : history;
    localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.HOTEL_PRICES, JSON.stringify(trimmed));
    return trimmed;
  }

  function analyzeHotelPrices() {
    const history = getHotelPriceHistory();
    if (history.length === 0) return { hotels: [], hasData: false, recordCount: 0 };

    // ホテル名ごとに価格履歴を集約
    const byHotel = {};
    history.forEach(record => {
      (record.prices || []).forEach(p => {
        if (!byHotel[p.name]) byHotel[p.name] = [];
        byHotel[p.name].push({ price: p.price, date: record.fetchedAt, estimated: p.estimated });
      });
    });

    const results = Object.entries(byHotel).map(([name, entries]) => {
      const prices = entries.map(e => e.price).filter(p => p > 0);
      if (prices.length === 0) return { name, avg: 0, min: 0, max: 0, latest: 0, trend: 'stable', occupancyEstimate: 'unknown', priceCount: 0 };

      const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const latest = prices[prices.length - 1];

      // 最新価格と平均の比較でトレンド判定
      const ratio = latest / avg;
      let trend = 'stable';
      if (ratio >= 1.15) trend = 'high';      // 15%以上高い → 高い
      else if (ratio >= 1.05) trend = 'rising'; // 5%以上高い → やや高い
      else if (ratio <= 0.85) trend = 'low';    // 15%以上安い → 安い
      else if (ratio <= 0.95) trend = 'falling'; // 5%以上安い → やや安い

      // 稼働率推定（価格高騰=高稼働率）
      let occupancyEstimate = 'normal';
      if (ratio >= 1.2) occupancyEstimate = 'very_high';
      else if (ratio >= 1.1) occupancyEstimate = 'high';
      else if (ratio <= 0.9) occupancyEstimate = 'low';

      return { name, avg, min, max, latest, trend, occupancyEstimate, priceCount: prices.length, ratio };
    });

    return {
      hotels: results.sort((a, b) => (b.ratio || 0) - (a.ratio || 0)),
      hasData: true,
      recordCount: history.length,
      latestFetch: history[history.length - 1]?.fetchedAt || null,
    };
  }

  // ============================================================
  // シフト生産性分析
  // ============================================================
  function getShiftProductivity() {
    const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
    const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
    const entries = getEntries();
    if (shifts.length === 0) return { shifts: [], totals: null };

    const results = [];
    shifts.forEach(s => {
      if (!s.startTime || !s.endTime) return; // 未完了シフトは除外
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      const shiftDate = toDateStr(s.startTime);
      const dateInfo = JapaneseHolidays.getDateInfo(shiftDate);

      // 勤務時間（分）
      const workMinutesGross = Math.round((end - start) / 60000);

      // 休憩時間（分）
      let breakMinutes = 0;
      breaks.forEach(b => {
        if (!b.startTime || !b.endTime) return;
        const bStart = new Date(b.startTime);
        const bEnd = new Date(b.endTime);
        // このシフト時間内の休憩のみ
        if (bStart >= start && bEnd <= end) {
          breakMinutes += Math.round((bEnd - bStart) / 60000);
        }
      });
      const actualMinutes = Math.max(0, workMinutesGross - breakMinutes);

      // シフト内売上エントリをマッチング
      const shiftEntries = entries.filter(e => {
        if (!e.timestamp) return false;
        const t = new Date(e.timestamp);
        return t >= start && t <= end;
      });
      const totalAmount = shiftEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
      const rideCount = shiftEntries.length;
      const hourlyRate = actualMinutes > 0 ? Math.round(totalAmount / (actualMinutes / 60)) : 0;
      const avgPrice = rideCount > 0 ? Math.round(totalAmount / rideCount) : 0;

      results.push({
        date: shiftDate,
        dayOfWeek: dateInfo.dayOfWeek,
        holiday: dateInfo.holiday || '',
        startTime: start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        endTime: end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        workMinutesGross,
        breakMinutes,
        actualMinutes,
        totalAmount,
        rideCount,
        hourlyRate,
        avgPrice,
      });
    });

    // ソート: 日付降順
    results.sort((a, b) => b.date.localeCompare(a.date));

    // 合計/平均
    const totals = results.length > 0 ? {
      shiftCount: results.length,
      totalWorkMinutes: results.reduce((s, r) => s + r.workMinutesGross, 0),
      totalBreakMinutes: results.reduce((s, r) => s + r.breakMinutes, 0),
      totalActualMinutes: results.reduce((s, r) => s + r.actualMinutes, 0),
      totalAmount: results.reduce((s, r) => s + r.totalAmount, 0),
      totalRides: results.reduce((s, r) => s + r.rideCount, 0),
      avgHourlyRate: Math.round(results.reduce((s, r) => s + r.hourlyRate, 0) / results.length),
      avgPrice: Math.round(results.reduce((s, r) => s + r.avgPrice, 0) / results.length),
    } : null;

    return { shifts: results, totals };
  }

  // ============================================================
  // 天気×売上相関
  // ============================================================
  function getWeatherRevenueCorrelation() {
    const entries = getEntries();
    const weathers = ['晴れ', '曇り', '雨', '雪'];
    const byWeather = {};
    weathers.forEach(w => { byWeather[w] = { name: w, totalAmount: 0, totalRides: 0, days: new Set() }; });

    entries.forEach(e => {
      const w = e.weather && weathers.includes(e.weather) ? e.weather : null;
      if (!w) return;
      byWeather[w].totalAmount += (e.amount || 0);
      byWeather[w].totalRides += 1;
      byWeather[w].days.add(e.date || toDateStr(e.timestamp));
    });

    return weathers.map(w => {
      const d = byWeather[w];
      const dayCount = d.days.size;
      return {
        name: w,
        dailyAvgAmount: dayCount > 0 ? Math.round(d.totalAmount / dayCount) : 0,
        avgPrice: d.totalRides > 0 ? Math.round(d.totalAmount / d.totalRides) : 0,
        dailyAvgRides: dayCount > 0 ? Math.round(d.totalRides / dayCount * 10) / 10 : 0,
        dayCount,
        totalRides: d.totalRides,
        totalAmount: d.totalAmount,
      };
    });
  }

  // ============================================================
  // 集客メモ×売上検証
  // ============================================================
  function getGatheringRevenueCorrelation() {
    const memos = getGatheringMemos();
    const entries = getEntries();
    if (memos.length === 0) return [];

    // 場所別に集約
    const byLocation = {};
    memos.forEach(m => {
      if (!m.location) return;
      if (!byLocation[m.location]) {
        byLocation[m.location] = { location: m.location, memoCount: 0, totalDensityScore: 0, coords: m.locationCoords || null, matchedRides: 0, matchedAmount: 0 };
      }
      byLocation[m.location].memoCount += 1;
      const ds = { many: 3, normal: 2, few: 1, none: 0 };
      byLocation[m.location].totalDensityScore += (ds[m.density] || 0);
      if (!byLocation[m.location].coords && m.locationCoords) byLocation[m.location].coords = m.locationCoords;
    });

    // 各集客メモ場所について同日同エリア（300m以内）の売上エントリをマッチング
    Object.values(byLocation).forEach(loc => {
      // テキストマッチング + 座標マッチング
      entries.forEach(e => {
        let matched = false;
        // テキストで部分一致
        if (e.pickup && loc.location && e.pickup.includes(loc.location)) matched = true;
        if (!matched && e.pickup && loc.location && loc.location.includes(e.pickup) && e.pickup.length >= 3) matched = true;
        // 座標で300m以内
        if (!matched && loc.coords && e.pickupCoords) {
          const dLat = loc.coords.lat - e.pickupCoords.lat;
          const dLng = loc.coords.lng - e.pickupCoords.lng;
          const approxDist = Math.sqrt(dLat * dLat + dLng * dLng) * 111000; // 概算メートル
          if (approxDist < 300) matched = true;
        }
        if (matched) {
          loc.matchedRides += 1;
          loc.matchedAmount += (e.amount || 0);
        }
      });
    });

    return Object.values(byLocation).map(loc => ({
      location: loc.location,
      memoCount: loc.memoCount,
      avgDensity: loc.memoCount > 0 ? Math.round(loc.totalDensityScore / loc.memoCount * 10) / 10 : 0,
      matchedRides: loc.matchedRides,
      matchedAmount: loc.matchedAmount,
      verdict: loc.matchedRides >= 3 && loc.avgDensity >= 2 ? '行く価値あり' : loc.matchedRides >= 1 ? '要検討' : 'データ不足',
    })).sort((a, b) => b.matchedAmount - a.matchedAmount);
  }

  // ============================================================
  // 公開API
  // ============================================================
  return {
    // データ取得
    getEntries,
    saveEntries,

    // サマリー
    getTodaySummary,
    getOverallSummary,

    // 分析
    getDailyBreakdown,
    getDayOfWeekBreakdown,
    getHourlyBreakdown,
    getAreaBreakdown,
    getWeeklyBreakdown,
    getMonthlyBreakdown,
    getWeatherBreakdown,
    getWeatherRevenueCorrelation,
    getShiftProductivity,
    getGatheringRevenueCorrelation,
    getSourceBreakdown,
    getPurposeBreakdown,
    getPurposeDayAnalysis,
    getAreaTimeBreakdown,
    getUnitPriceAnalysis,
    getBusinessRecommendation,
    getSourceAreaPriceBreakdown,
    getPriceTierHeatmapData,
    getNearbyEstimate,
    getHeatmapData,

    // CRUD
    addEntry,
    updateEntry,
    deleteEntry,
    clearAllEntries,
    validateEntry,

    // ゴミ箱
    getTrash,
    saveTrash,
    moveToTrash,
    moveRivalToTrash,
    restoreFromTrash,
    permanentDeleteFromTrash,
    emptyTrash,
    cleanupTrash,

    // エクスポート
    exportCSV,
    downloadCSV,

    // ファイル保存・復元
    autoSaveToFile,
    manualSaveToFile,
    selectSaveFolder,
    importFromFile,
    hasSaveFolder,

    // 他社乗車
    getRivalEntries,
    saveRivalEntries,
    addRivalEntry,
    updateRivalEntry,
    deleteRivalEntry,
    clearAllRivalEntries,
    downloadRivalCSV,
    autoSaveRivalToFile,
    manualSaveRivalToFile,
    getRivalHourlyBreakdown,
    getRivalDayOfWeekBreakdown,
    getRivalLocationBreakdown,
    getRivalWeatherBreakdown,

    // 集客メモ
    getGatheringMemos,
    saveGatheringMemos,
    addGatheringMemo,
    updateGatheringMemo,
    deleteGatheringMemo,
    clearAllGatheringMemos,
    getGatheringAnalysis,
    downloadGatheringCSV,
    autoSaveGatheringToFile,
    manualSaveGatheringToFile,

    // クラウド同期
    loadFromCloud,
    syncFromCloud,
    autoSync,
    syncWorkStatusToCloud,
    syncWorkStatusFromCloud,
    syncShiftsToCloud,
    syncBreaksToCloud,
    syncShiftsFromCloud,
    syncBreaksFromCloud,

    // イベント
    getEvents,
    saveEvents,
    addEvent,
    deleteEvent,
    clearAllEvents,

    // 公共交通機関情報
    autoSaveTransitToFile,

    // 売上向上機能
    getUtilizationRate,
    getTopPickupAreasForNow,
    getFrequentPickupSpots,
    getFrequentPickupSpotsWithNames,
    reverseGeocodeSpot,
    applyPlaceAliasesToExistingData,
    getGoalProgress,
    getUpcomingEventAlerts,
    getSmartHeatmapData,

    // 交通需要連動
    getDailyDemandSchedule,
    getTransitHeatmapData,
    getHotelDemandData,
    getBusArrivalsData,

    // 待機スポット需要指数
    getWaitingSpotDemandIndex,

    // 流しエリア需要指数
    getCruisingAreaDemandIndex,

    // 待機スポット売上シミュレーション
    getWaitingSpotRevenueForecast,

    // 日勤集客強化 (v1.5.0)
    getHospitalScheduleData,
    getWeatherDemandImpact,
    getDayShiftDemandScore,
    getDayShiftTimeline,
    getNextOptimalAction,
    getChainSuggestion,
    getStrategySimulation,
    getSlowPeriodCruisingRoutes,

    // ホテル価格
    getHotelPriceHistory,
    saveHotelPrices,
    analyzeHotelPrices,
  };
})();

})();
