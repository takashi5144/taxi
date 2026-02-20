// dataService.js - データ処理層（ビジネスロジック）
//
// 売上データの集計・分析・エクスポートを一元管理するサービス層。
// Dashboard, Analytics, Revenue の全ページがこのサービスを通じてデータにアクセスする。

window.DataService = (() => {
  // ============================================================
  // データ取得
  // ============================================================
  function getEntries() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  function saveEntries(entries) {
    try {
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA, JSON.stringify(entries));
      return true;
    } catch (e) {
      AppLogger.error('売上データの保存に失敗しました', e.message);
      return false;
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
      const dateStr = new Date().toISOString().split('T')[0];
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
      const dateStr = new Date().toISOString().split('T')[0];
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
  // フォルダ未設定時はスキップ（ダウンロードは手動保存時のみ）
  async function autoSaveToFile() {
    await _handleReady;
    if (!_dirHandle) return;
    const entries = getEntries();
    if (entries.length === 0) return;
    const dateStr = new Date().toISOString().split('T')[0];
    await _saveToSubFolder('売上記録', `売上記録_${dateStr}.json`, entries, APP_CONSTANTS.VERSION);
  }

  // 他社乗車記録の自動保存（サブフォルダ「他社乗車」）
  // フォルダ未設定時はスキップ（ダウンロードは手動保存時のみ）
  async function autoSaveRivalToFile() {
    await _handleReady;
    if (!_dirHandle) return;
    const entries = getRivalEntries();
    if (entries.length === 0) return;
    const dateStr = new Date().toISOString().split('T')[0];
    await _saveToSubFolder('他社乗車', `他社乗車記録_${dateStr}.json`, entries, APP_CONSTANTS.VERSION);
  }

  // 手動JSON保存（ボタン押下時）— フォルダ未設定時はダウンロード
  async function manualSaveToFile() {
    await _handleReady;
    const entries = getEntries();
    if (entries.length === 0) return;
    if (_dirHandle) {
      const dateStr = new Date().toISOString().split('T')[0];
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
      const dateStr = new Date().toISOString().split('T')[0];
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
      AppLogger.info('保存先フォルダを設定・永続化: ' + _dirHandle.name);
      return { success: true, folderName: _dirHandle.name };
    } catch (e) {
      if (e.name === 'AbortError') return { success: false, message: 'フォルダ選択がキャンセルされました' };
      return { success: false, message: 'フォルダ選択に失敗: ' + e.message };
    }
  }

  // JSONファイルから復元
  async function importFromFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { resolve({ success: false, message: 'ファイルが選択されませんでした' }); return; }
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
            // 既存データとマージ（IDで重複排除）
            const existing = getEntries();
            const existingIds = new Set(existing.map(e => e.id));
            let newCount = 0;
            entries.forEach(entry => {
              if (!existingIds.has(entry.id) && entry.amount) {
                existing.push(entry);
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

  async function _syncToCloud(type, entries) {
    try {
      const res = await fetch(`/api/data?type=${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(_getSyncSecret() ? { 'Authorization': 'Bearer ' + _getSyncSecret() } : {}),
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
      } else {
        AppLogger.warn(`クラウド同期失敗: ${res.status}`);
      }
    } catch (e) {
      AppLogger.warn('クラウド同期エラー: ' + e.message);
    }
  }

  async function loadFromCloud(type) {
    try {
      const res = await fetch(`/api/data?type=${type}`, {
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.entries || [];
    } catch (e) {
      AppLogger.warn('クラウド読込エラー: ' + e.message);
      return null;
    }
  }

  async function syncFromCloud(type) {
    const cloudEntries = await loadFromCloud(type);
    if (!cloudEntries || cloudEntries.length === 0) return { merged: 0 };

    const local = type === 'revenue' ? getEntries() : getRivalEntries();
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
      else saveRivalEntries(local);
    }
    return { merged, total: local.length };
  }

  async function autoSync() {
    try {
      const [r1, r2] = await Promise.all([
        syncFromCloud('revenue'),
        syncFromCloud('rival'),
      ]);
      const totalMerged = (r1.merged || 0) + (r2.merged || 0);
      if (totalMerged > 0) {
        AppLogger.info(`自動同期完了: 売上+${r1.merged}件, 他社+${r2.merged}件`);
      } else {
        AppLogger.debug('自動同期: 新規データなし');
      }
      return { revenue: r1, rival: r2 };
    } catch (e) {
      AppLogger.warn('自動同期エラー: ' + e.message);
      return null;
    }
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

    // 稼働時間の計算（最初の記録〜最後の記録）
    let workMinutes = 0;
    if (todayEntries.length >= 2) {
      const sorted = [...todayEntries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const first = new Date(sorted[0].timestamp);
      const last = new Date(sorted[sorted.length - 1].timestamp);
      workMinutes = Math.round((last - first) / 60000);
    }
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
      const key = toDateStr(e.timestamp);
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
      const idx = getDayOfWeekIndex(e.timestamp);
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
      const h = toHour(e.timestamp);
      result[h].amount += e.amount || 0;
      result[h].count += 1;
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

    const header = 'ID,日付,曜日,祝日,日時,天候,金額,乗車地,乗車時間,降車地,降車時間,人数,性別,用途,配車方法,メモ';
    const rows = entries.map(e => {
      const entryDate = e.date || toDateStr(e.timestamp);
      const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
      const dayOfWeek = e.dayOfWeek || dateInfo.dayOfWeek;
      const holiday = e.holiday || dateInfo.holiday || '';
      const dateTime = new Date(e.timestamp).toLocaleString('ja-JP');
      const weather = (e.weather || '').replace(/,/g, '、');
      const pickup = (e.pickup || '').replace(/,/g, '、');
      const pickupTime = e.pickupTime || '';
      const dropoff = (e.dropoff || '').replace(/,/g, '、');
      const dropoffTime = e.dropoffTime || '';
      const passengers = e.passengers || '';
      const gender = e.gender || '';
      const purpose = (e.purpose || '').replace(/,/g, '、');
      const source = e.source || '';
      const memo = (e.memo || '').replace(/,/g, '、');
      return `${e.id},${entryDate},${dayOfWeek},${holiday},${dateTime},${weather},${e.amount},${pickup},${pickupTime},${dropoff},${dropoffTime},${passengers},${gender},${purpose},${source},${memo}`;
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
    const dateStr = new Date().toISOString().split('T')[0];
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

    if (!form.amount || isNaN(amount)) {
      errors.push('金額を入力してください');
    } else if (amount <= 0) {
      errors.push('金額は1円以上を入力してください');
    } else if (amount > 1000000) {
      errors.push('金額が大きすぎます（100万円以下にしてください）');
    }

    return { valid: errors.length === 0, errors };
  }

  // ============================================================
  // CRUD操作
  // ============================================================
  function addEntry(form) {
    const validation = validateEntry(form);
    if (!validation.valid) return { success: false, errors: validation.errors };

    const entries = getEntries();
    const entryDate = form.date || new Date().toISOString().split('T')[0];
    const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      amount: parseInt(form.amount),
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
      purpose: form.purpose || '',
      memo: form.memo || '',
      source: form.source || '',
      pickupCoords: form.pickupCoords || null,
      dropoffCoords: form.dropoffCoords || null,
      timestamp: new Date().toISOString(),
    };

    entries.unshift(entry);
    saveEntries(entries);
    const holidayStr = dateInfo.holiday ? ` [${dateInfo.holiday}]` : '';
    AppLogger.info(`売上記録追加: ¥${entry.amount} (${entry.date} ${dateInfo.dayOfWeek}${holidayStr}, ${entry.weather || '天候未設定'})`);
    // 自動ファイル保存
    autoSaveToFile();
    _syncToCloud('revenue', entries);

    return { success: true, entry };
  }

  function deleteEntry(id) {
    const entries = getEntries();
    const filtered = entries.filter(e => e.id !== id);
    saveEntries(filtered);
    AppLogger.info('売上記録を削除しました');
    autoSaveToFile();
    _syncToCloud('revenue', filtered);

    return true;
  }

  function clearAllEntries() {
    saveEntries([]);
    _syncToCloud('revenue', []);
    AppLogger.info('全売上データを削除しました');
    return true;
  }

  // ============================================================
  // 他社乗車データ CRUD
  // ============================================================
  function getRivalEntries() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.RIVAL_RIDES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  function saveRivalEntries(entries) {
    try {
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.RIVAL_RIDES, JSON.stringify(entries));
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
    const entryDate = form.date || new Date().toISOString().split('T')[0];
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

    return { success: true, entry };
  }

  function deleteRivalEntry(id) {
    const entries = getRivalEntries();
    const filtered = entries.filter(e => e.id !== id);
    saveRivalEntries(filtered);
    AppLogger.info('他社乗車記録を削除しました');
    autoSaveRivalToFile();
    _syncToCloud('rival', filtered);

    return true;
  }

  function clearAllRivalEntries() {
    saveRivalEntries([]);
    _syncToCloud('rival', []);
    AppLogger.info('全他社乗車データを削除しました');
    return true;
  }

  function downloadRivalCSV() {
    const entries = getRivalEntries();
    if (entries.length === 0) {
      AppLogger.warn('エクスポート対象の他社乗車データがありません');
      return false;
    }
    const header = 'ID,日付,曜日,祝日,時間,天候,乗車場所,メモ';
    const rows = entries.map(e => {
      const weather = (e.weather || '').replace(/,/g, '、');
      const location = (e.location || '').replace(/,/g, '、');
      const memo = (e.memo || '').replace(/,/g, '、');
      return `${e.id},${e.date},${e.dayOfWeek},${e.holiday},${e.time},${weather},${location},${memo}`;
    });
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
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
    const entryDate = form.date || new Date().toISOString().split('T')[0];
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

  function updateEntry(id, updates) {
    const entries = getEntries();
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return { success: false, errors: ['記録が見つかりません'] };
    if (updates.amount != null) {
      const amt = parseInt(updates.amount);
      if (isNaN(amt) || amt < 1 || amt > 1000000) return { success: false, errors: ['金額は1〜1,000,000の範囲で入力してください'] };
      updates.amount = amt;
    }
    entries[idx] = { ...entries[idx], ...updates };
    saveEntries(entries);
    AppLogger.info('売上記録を更新しました');
    autoSaveToFile();
    _syncToCloud('revenue', entries);
    return { success: true, entry: entries[idx] };
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
    return { success: true, entry: entries[idx] };
  }

  function getWeatherBreakdown() {
    const entries = getEntries();
    const weathers = ['晴れ', '曇り', '雨', '雪', '未設定'];
    return weathers.map(w => {
      const matched = entries.filter(e => (w === '未設定') ? (!e.weather) : (e.weather === w));
      const amount = matched.reduce((s, e) => s + (e.amount || 0), 0);
      return { weather: w, count: matched.length, amount, avg: matched.length > 0 ? Math.round(amount / matched.length) : 0 };
    });
  }

  function getHeatmapData() {
    const entries = getEntries();
    const rival = getRivalEntries();
    const points = [];
    entries.forEach(e => {
      if (e.pickupCoords) points.push({ lat: e.pickupCoords.lat, lng: e.pickupCoords.lng, weight: 1 });
      if (e.dropoffCoords) points.push({ lat: e.dropoffCoords.lat, lng: e.dropoffCoords.lng, weight: 0.5 });
    });
    rival.forEach(e => {
      if (e.locationCoords) points.push({ lat: e.locationCoords.lat, lng: e.locationCoords.lng, weight: 0.7 });
    });
    return points;
  }

  function getRivalHourlyBreakdown() {
    const entries = getRivalEntries();
    const result = [];
    for (let h = 0; h < 24; h++) result.push({ hour: h, label: h + '時', count: 0 });
    entries.forEach(e => {
      if (e.time) {
        const hour = parseInt(e.time.split(':')[0], 10);
        if (hour >= 0 && hour < 24) result[hour].count += 1;
      }
    });
    return result;
  }

  function getRivalDayOfWeekBreakdown() {
    const entries = getRivalEntries();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const result = days.map((name, i) => ({ name, index: i, count: 0 }));
    entries.forEach(e => {
      const idx = getDayOfWeekIndex(e.timestamp);
      result[idx].count += 1;
    });
    return result;
  }

  function getRivalLocationBreakdown() {
    const entries = getRivalEntries();
    const map = {};
    entries.forEach(e => {
      const loc = e.location || '不明';
      map[loc] = (map[loc] || 0) + 1;
    });
    return Object.entries(map).map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }

  function getRivalWeatherBreakdown() {
    const entries = getRivalEntries();
    const weathers = ['晴れ', '曇り', '雨', '雪', '未設定'];
    return weathers.map(w => {
      const count = entries.filter(e => (w === '未設定') ? (!e.weather) : (e.weather === w)).length;
      return { weather: w, count };
    });
  }

  function autoSaveTransitToFile(transitData) {
    if (!_dirHandle) return;
    try {
      const json = JSON.stringify(transitData, null, 2);
      _dirHandle.getFileHandle('transit_info.json', { create: true })
        .then(fh => fh.createWritable())
        .then(w => { w.write(json); return w; })
        .then(w => w.close())
        .catch(() => {});
    } catch {}
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
    getHeatmapData,

    // CRUD
    addEntry,
    updateEntry,
    deleteEntry,
    clearAllEntries,
    validateEntry,

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

    // クラウド同期
    loadFromCloud,
    syncFromCloud,
    autoSync,

    // イベント
    getEvents,
    saveEvents,
    addEvent,
    deleteEvent,
    clearAllEvents,

    // トランジット
    autoSaveTransitToFile,
  };
})();
