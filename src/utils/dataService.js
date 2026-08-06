(function() {
// dataService.js - データ処理層（ビジネスロジック）
//
// 売上データの集計・分析・エクスポートを一元管理するサービス層。
// Dashboard, Analytics, Revenue の全ページがこのサービスを通じてデータにアクセスする。

window.DataService = (() => {
  // ============================================================
  // 日種別判定（平日/休日/大型連休）— 全分析関数から共有
  // ============================================================
  const _dayTypeCache = {};
  function classifyDayType(dateStr) {
    if (!dateStr) return 'weekday';
    if (_dayTypeCache[dateStr]) return _dayTypeCache[dateStr];
    try {
      const info = JapaneseHolidays.getDateInfo(dateStr);
      const type = (info.isHoliday || info.isSunday || info.isSaturday) ? 'holiday' : 'weekday';
      _dayTypeCache[dateStr] = type;
      return type;
    } catch {
      return 'weekday';
    }
  }

  function getTodayDayType() {
    return classifyDayType(getLocalDateString());
  }


  // 駅前除外パターン（奇数日チェック用）
  const _stationPattern = /駅前|旭川駅/;

  // dayTypeフィルタ: 'weekday'=平日のみ, 'holiday'=土日祝(longHoliday含む), null/undefined=全て
  function _filterByDayType(entries, dayType) {
    if (!dayType) return entries;
    return entries.filter(e => {
      const dateStr = e.date || toDateStr(e.timestamp);
      if (!dateStr) return true;
      const dt = classifyDayType(dateStr);
      if (dayType === 'weekday') return dt === 'weekday';
      return dt === 'holiday' || dt === 'longHoliday';
    });
  }

  // ============================================================
  // データ取得（キャッシュ付き）
  // ============================================================
  let _entriesCache = null;
  let _entriesCacheRaw = null;
  let _rivalCache = null;
  let _rivalCacheRaw = null;
  let _gatheringCache = null;
  let _gatheringCacheRaw = null;
  let _rawEntriesCache = null;
  let _rawEntriesCacheKey = null;

  // クーポン未収サブエントリ判定（メイン売上とは別に自動生成されるエントリ）
  const _isCouponSub = (e) => e.paymentMethod === 'uncollected' && e.memo && e.memo.includes('クーポン未収');
  // メーター金額（amount + discountAmount + couponAmount）
  const _meterAmount = (e) => (e.amount || 0) + (e.discountAmount || 0) + (e.couponAmount || 0);
  // 遠距離割の金額取得（discounts配列 → discountType/discountAmountフォールバック）
  const _longDistanceAmt = (e) => {
    if (e.discounts && Array.isArray(e.discounts)) {
      const ld = e.discounts.filter(d => d.type === 'longDistance');
      if (ld.length > 0) return ld.reduce((s, d) => s + (d.amount || 0), 0);
    }
    if (e.discountType && e.discountType.includes('longDistance') && e.discountAmount) {
      const types = e.discountType.split(',').filter(t => t && t !== 'longDistance');
      if (types.length === 0) return e.discountAmount;
    }
    return 0;
  };
  // 売上金額（メーター金額から遠距離割を除外 = 実際の売上）
  const _salesAmount = (e) => _meterAmount(e) - _longDistanceAmt(e);

  // 全エントリ（空車含む）を生データとして取得（内部CRUD用）
  // キャッシュ付き: localStorageの値が変わらなければJSON.parseをスキップ
  function _getRawEntries() {
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA);
      if (saved === _rawEntriesCacheKey && _rawEntriesCache !== null) {
        return _rawEntriesCache.map(e => Object.assign({}, e));
      }
      const entries = saved ? JSON.parse(saved) : [];
      entries.forEach(e => {
        if (e.date) {
          const info = JapaneseHolidays.getDateInfo(e.date);
          e.dayOfWeek = info.dayOfWeek;
          e.holiday = info.holiday || '';
        }
      });
      _rawEntriesCacheKey = saved;
      _rawEntriesCache = entries;
      return entries.map(e => Object.assign({}, e));
    } catch {
      return [];
    }
  }

  // 旧フォーマットのクーポンデータを新フォーマットに移行
  // 旧: amount = meter - discountAmount（couponAmountは引かれていない）
  // 新: amount = meter - discountAmount - couponAmount + クーポンサブエントリ生成
  let _migrationDone = false;
  function _migrateCouponEntries() {
    if (_migrationDone) return;
    _migrationDone = true;
    try {
      const entries = _getRawEntries();
      let changed = false;
      const newEntries = [];
      entries.forEach(e => {
        if (e.couponAmount > 0 && !_isCouponSub(e)) {
          // クーポンサブエントリが存在するか確認
          const hasSub = entries.some(s =>
            s.id !== e.id && _isCouponSub(s) && s.date === e.date && s.pickup === e.pickup && s.pickupTime === e.pickupTime
          );
          if (!hasSub) {
            // 旧フォーマット: amountからcouponAmountを引いてサブエントリを作成
            AppLogger.info('クーポンデータ移行: ' + e.id + ' amount ' + e.amount + ' -> ' + (e.amount - e.couponAmount));
            e.amount = e.amount - e.couponAmount;
            changed = true;
            newEntries.push({
              id: e.id + '_coupon_migrated',
              couponParentId: e.id,
              amount: e.couponAmount,
              date: e.date,
              dayOfWeek: e.dayOfWeek || '',
              holiday: e.holiday || '',
              weather: e.weather || '',
              temperature: e.temperature != null ? e.temperature : null,
              pickup: e.pickup || '',
              pickupTime: e.pickupTime || '',
              dropoff: e.dropoff || '',
              dropoffTime: e.dropoffTime || '',
              passengers: '', gender: '', purpose: '',
              memo: 'クーポン未収（移行データ）',
              source: e.source || '',
              pickupCoords: e.pickupCoords || null,
              dropoffCoords: e.dropoffCoords || null,
              pickupLandmark: e.pickupLandmark || '',
              dropoffLandmark: e.dropoffLandmark || '',
              noPassenger: false,
              paymentMethod: 'uncollected',
              discounts: [],
              discountAmount: 0,
              discountType: '',
              couponAmount: 0,
              waitingTime: '',
              timestamp: e.timestamp,
            });
          }
        }
      });
      if (changed) {
        const allEntries = [...entries, ...newEntries];
        saveEntries(allEntries);
        AppLogger.info('クーポンデータ移行完了: ' + newEntries.length + '件のサブエントリを作成');
      }
      // 既存クーポンサブエントリにcouponParentIdが未設定なら自動付与
      const allData = changed ? [...entries, ...newEntries] : entries;
      let linkedCount = 0;
      allData.forEach(sub => {
        if (_isCouponSub(sub) && !sub.couponParentId) {
          // 同日・同乗車地・同乗車時刻でcouponAmount>0のメインエントリを探す
          const parent = allData.find(p =>
            p.id !== sub.id && !_isCouponSub(p) && p.couponAmount > 0 &&
            p.date === sub.date && p.pickup === sub.pickup && p.pickupTime === sub.pickupTime
          );
          if (parent) {
            sub.couponParentId = parent.id;
            linkedCount++;
          }
        }
      });
      if (linkedCount > 0) {
        saveEntries(allData);
        AppLogger.info('クーポン紐付け修復: ' + linkedCount + '件');
      }
    } catch (err) {
      AppLogger.warn('クーポンデータ移行エラー: ' + err.message);
    }
  }

  function getEntries() {
    _migrateCouponEntries();
    try {
      const saved = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA);
      if (saved === _entriesCacheRaw && _entriesCache !== null) return _entriesCache;
      const entries = _getRawEntries();
      _entriesCacheRaw = saved;
      _entriesCache = _sortByDateTimeDesc(entries.filter(e => !e.noPassenger), 'date', 'dropoffTime');
      return _entriesCache;
    } catch {
      return [];
    }
  }

  // 分析用エントリ取得（クーポンサブエントリ除外）
  function _getAnalyticsEntries(dayType) {
    return _filterByDayType(getEntries(), dayType).filter(e => !_isCouponSub(e));
  }

  // 空車記録のみ取得（待機を除く）
  function getVacantEntries() {
    try {
      const entries = _getRawEntries();
      return _sortByDateTimeDesc(entries.filter(e => e.noPassenger && e.purpose !== '待機'), 'date', 'dropoffTime');
    } catch {
      return [];
    }
  }

  // 待機記録のみ取得
  function getStandbyEntries() {
    try {
      const entries = _getRawEntries();
      return _sortByDateTimeDesc(entries.filter(e => e.noPassenger && e.purpose === '待機'), 'date', 'dropoffTime');
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

  // 90日より古いログデータを削除してlocalStorage容量を確保する
  function _cleanOldDataForQuota() {
    let freed = false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // GPSログ（localStorage内の古いキー）を削除
    const keysToCheck = [];
    for (let i = 0; i < localStorage.length; i++) {
      keysToCheck.push(localStorage.key(i));
    }
    for (const key of keysToCheck) {
      if (key && key.match(/^gps_log_\d{4}-\d{2}-\d{2}$/) && key.slice(8) < cutoffStr) {
        localStorage.removeItem(key);
        freed = true;
      }
    }

    // rival/gathering の90日以上古いエントリを削減
    try {
      const rivalKey = APP_CONSTANTS.STORAGE_KEYS.RIVAL_DATA;
      if (rivalKey) {
        const rivals = JSON.parse(localStorage.getItem(rivalKey) || '[]');
        const filtered = rivals.filter(e => !e.date || e.date >= cutoffStr);
        if (filtered.length < rivals.length) {
          localStorage.setItem(rivalKey, JSON.stringify(filtered));
          freed = true;
        }
      }
    } catch (_) { /* ignore */ }

    return freed;
  }

  function saveEntries(entries) {
    try {
      const sorted = _sortByDateTimeDesc([...entries], 'date', 'dropoffTime');
      const json = JSON.stringify(sorted);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA, json);
      _entriesCacheRaw = json;
      _entriesCache = sorted.filter(e => !e.noPassenger);
      _rawEntriesCache = null;
      _rawEntriesCacheKey = null;
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        // 古いデータを削除して容量を確保し、再試行
        AppLogger.warn('ストレージ容量不足: 古いデータを削除して再試行します...');
        const cleaned = _cleanOldDataForQuota();
        if (cleaned) {
          try {
            const sorted = _sortByDateTimeDesc([...entries], 'date', 'dropoffTime');
            const json = JSON.stringify(sorted);
            localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA, json);
            _entriesCacheRaw = json;
            _entriesCache = sorted.filter(e => !e.noPassenger);
            _rawEntriesCache = null;
            _rawEntriesCacheKey = null;
            AppLogger.info('古いデータ削除後、保存に成功しました');
            return true;
          } catch (retryErr) {
            AppLogger.error('ストレージ容量が不足しています。設定画面から不要なデータを手動で削除してください。');
            return false;
          }
        }
        AppLogger.error('ストレージ容量が不足しています。設定画面から不要なデータを手動で削除してください。');
      } else {
        AppLogger.error('売上データの保存に失敗しました', e.message);
      }
      return false;
    }
  }

  // 既存データの場所名をエイリアス・座標マッチで統一 + ランドマーク補完
  function applyPlaceAliasesToExistingData() {
    // 毎回全件スキャンすると起動が重いため、一度だけ実行
    const FLAG = 'taxi_migration_place_aliases_v1';
    if (localStorage.getItem(FLAG)) return;
    const alias = TaxiApp.utils.applyPlaceAlias;
    const matchKnown = TaxiApp.utils.matchKnownPlace;
    let changed = false;

    const entries = _getRawEntries();
    entries.forEach(e => {
      // pickup テキスト自体をエイリアス/座標で統一
      if (e.pickupCoords && e.pickupCoords.lat) {
        const known = matchKnown(e.pickupCoords.lat, e.pickupCoords.lng);
        if (known && e.pickup !== known) { e.pickup = known; changed = true; }
        if (!e.pickupLandmark && known) { e.pickupLandmark = known; changed = true; }
      }
      if (e.pickup) {
        const aliased = alias(e.pickup);
        if (aliased !== e.pickup) { e.pickup = aliased; changed = true; }
        if (!e.pickupLandmark) { e.pickupLandmark = aliased; changed = true; }
      }
      // dropoff テキスト自体をエイリアス/座標で統一
      if (e.dropoffCoords && e.dropoffCoords.lat) {
        const known = matchKnown(e.dropoffCoords.lat, e.dropoffCoords.lng);
        if (known && e.dropoff !== known) { e.dropoff = known; changed = true; }
        if (!e.dropoffLandmark && known) { e.dropoffLandmark = known; changed = true; }
      }
      if (e.dropoff) {
        const aliased = alias(e.dropoff);
        if (aliased !== e.dropoff) { e.dropoff = aliased; changed = true; }
        if (!e.dropoffLandmark) { e.dropoffLandmark = aliased; changed = true; }
      }
    });
    if (changed) {
      saveEntries(entries);
      AppLogger.info(`場所名を統一しました（エイリアス・座標マッチ適用）`);
    }

    // 他社乗車記録: 場所名統一 + ランドマーク補完
    let rivalChanged = false;
    const rivals = getRivalEntries();
    rivals.forEach(e => {
      // location テキスト自体もエイリアス/座標で統一
      if (e.locationCoords && e.locationCoords.lat) {
        const known = matchKnown(e.locationCoords.lat, e.locationCoords.lng);
        if (known && e.location !== known) { e.location = known; rivalChanged = true; }
        if (!e.locationLandmark && known) { e.locationLandmark = known; rivalChanged = true; }
      }
      if (e.location) {
        const aliased = alias(e.location);
        if (aliased !== e.location) { e.location = aliased; rivalChanged = true; }
        if (!e.locationLandmark) { e.locationLandmark = aliased; rivalChanged = true; }
      }
    });
    if (rivalChanged) {
      saveRivalEntries(rivals);
      AppLogger.info(`他社乗車データの場所名を統一しました`);
    }
    try { localStorage.setItem(FLAG, '1'); } catch (e) { /* ignore */ }
  }

  // 一回限りマイグレーション: 降車地「旭川駅前北口」→ 用途「駅移動」
  function migrateStationDropoffPurpose() {
    const KEY = 'taxi_migration_station_dropoff_purpose';
    if (localStorage.getItem(KEY)) return;
    const entries = _getRawEntries();
    let count = 0;
    entries.forEach(e => {
      if (e.dropoff === '旭川駅前北口' && e.purpose !== '駅移動') {
        e.purpose = '駅移動';
        count++;
      }
    });
    if (count > 0) {
      saveEntries(entries);
      AppLogger.info(`${count}件の降車地「旭川駅前北口」の用途を「駅移動」に更新しました`);
    }
    localStorage.setItem(KEY, '1');
  }

  // ============================================================
  // 売上記録: 現行フォーム項目以外のフィールドを削除
  // 残す: id/金額/日付/合算日/曜日祝日/乗車降車時間/人数/支払/割引/システム用
  // 消す: 天候/性別/用途/メモ(クーポン以外)/配車/地点/GPS/リピーター/待機 等
  // ============================================================
  const REVENUE_KEEP_KEYS = [
    'id', 'amount', 'date', 'dayOfWeek', 'holiday', 'shiftDate',
    'pickupTime', 'dropoffTime', 'passengers',
    'paymentMethod', 'discounts', 'discountAmount', 'discountType', 'couponAmount',
    'couponParentId', 'timestamp', 'noPassenger',
  ];

  function _slimRevenueEntry(e) {
    if (!e || typeof e !== 'object') return e;
    const slim = {};
    REVENUE_KEEP_KEYS.forEach((k) => {
      if (e[k] !== undefined) slim[k] = e[k];
    });
    // クーポン未収サブエントリ判定に memo が必要なため、該当時のみ残す
    if (e.memo && String(e.memo).includes('クーポン未収')) {
      slim.memo = e.memo;
    }
    return slim;
  }

  /**
   * 既存売上データから、削除済みフォーム項目のフィールドだけを除去する。
   * @param {{ force?: boolean }} opts force=true で再実行可能
   * @returns {{ cleaned: number, fieldsRemoved: number, alreadyDone: boolean }}
   */
  function cleanRemovedRevenueFields(opts) {
    const force = !!(opts && opts.force);
    const KEY = 'taxi_migration_slim_revenue_fields_v1';
    if (!force && localStorage.getItem(KEY)) {
      return { cleaned: 0, fieldsRemoved: 0, alreadyDone: true };
    }

    const entries = _getRawEntries();
    let cleaned = 0;
    let fieldsRemoved = 0;
    const next = entries.map((e) => {
      const beforeKeys = Object.keys(e || {});
      const slim = _slimRevenueEntry(e);
      const afterKeys = Object.keys(slim);
      const removed = beforeKeys.length - afterKeys.length;
      if (removed > 0) {
        cleaned += 1;
        fieldsRemoved += removed;
      }
      return slim;
    });

    if (cleaned > 0) {
      saveEntries(next);
      AppLogger.info(`売上記録フィールド整理: ${cleaned}件から不要項目を削除（計${fieldsRemoved}フィールド）`);
    } else {
      AppLogger.info('売上記録フィールド整理: 削除対象なし');
    }
    try { localStorage.setItem(KEY, '1'); } catch (err) { /* ignore */ }
    _notifyDataChanged('revenue');
    return { cleaned, fieldsRemoved, alreadyDone: false };
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

  // ダウンロードヘルパー（JSON/CSV共通）
  function _downloadFile(filename, blob, logMessage) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    AppLogger.info(logMessage);
  }

  // ダウンロード方式でJSON保存（フォールバック）
  function _downloadBackup(entries) {
    try {
      const dateStr = getLocalDateString();
      const data = JSON.stringify({ version: APP_CONSTANTS.VERSION, exportedAt: new Date().toISOString(), count: entries.length, entries: entries }, null, 2);
      const blob = new Blob([data], { type: 'application/json;charset=utf-8;' });
      _downloadFile(`売上記録_${dateStr}.json`, blob, `バックアップダウンロード: ${entries.length}件`);
      return true;
    } catch (e) {
      AppLogger.warn('バックアップ失敗: ' + e.message);
      return false;
    }
  }

    function _downloadRivalBackup() { return null; }


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
    const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
    return {
      id: stripHtml(entry.id),
      amount: typeof entry.amount === 'number' && isFinite(entry.amount) ? Math.max(0, Math.min(entry.amount, 1000000)) : 0,
      date: validDate(entry.date),
      shiftDate: validDate(entry.shiftDate) || validDate(entry.date),
      dayOfWeek: stripHtml(entry.dayOfWeek),
      holiday: stripHtml(entry.holiday),
      weather: stripHtml(entry.weather),
      temperature: entry.temperature != null && isFinite(entry.temperature) ? entry.temperature : null,
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
      noPassenger: !!entry.noPassenger,
      paymentMethod: stripHtml(entry.paymentMethod) || 'cash',
      discounts: Array.isArray(entry.discounts) ? entry.discounts.map(d => ({ type: stripHtml(d.type), amount: parseInt(d.amount) || 0, unitPrice: d.unitPrice ? parseInt(d.unitPrice) : undefined, sheets: d.sheets ? parseInt(d.sheets) : undefined })) : [],
      discountAmount: parseInt(entry.discountAmount) || 0,
      discountType: stripHtml(entry.discountType),
      couponAmount: parseInt(entry.couponAmount) || 0,
      couponParentId: stripHtml(entry.couponParentId),
      waitingTime: stripHtml(entry.waitingTime),
      isRegisteredUser: !!entry.isRegisteredUser,
      customerName: stripHtml(entry.customerName),
      standbyInfo: entry.standbyInfo && typeof entry.standbyInfo === 'object' ? {
        locationName: stripHtml(entry.standbyInfo.locationName),
        startTime: stripHtml(entry.standbyInfo.startTime),
        endTime: stripHtml(entry.standbyInfo.endTime),
        category: stripHtml(entry.standbyInfo.category),
        lat: typeof entry.standbyInfo.lat === 'number' ? entry.standbyInfo.lat : undefined,
        lng: typeof entry.standbyInfo.lng === 'number' ? entry.standbyInfo.lng : undefined,
      } : null,
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
            // インポートデータのバリデーション
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            const timeRegex = /^\d{2}:\d{2}$/;
            let skippedCount = 0;
            const validEntries = entries.filter(entry => {
              if (typeof entry.amount !== 'number' || !isFinite(entry.amount) || entry.amount < 0) { skippedCount++; return false; }
              if (typeof entry.date !== 'string' || !dateRegex.test(entry.date)) { skippedCount++; return false; }
              if (entry.pickupTime && (typeof entry.pickupTime !== 'string' || !timeRegex.test(entry.pickupTime))) { skippedCount++; return false; }
              if (entry.dropoffTime && (typeof entry.dropoffTime !== 'string' || !timeRegex.test(entry.dropoffTime))) { skippedCount++; return false; }
              return true;
            });
            if (skippedCount > 0) {
              AppLogger.info(`インポート: ${skippedCount}件のデータがバリデーションで除外されました`);
            }
            // 既存データとマージ（IDで重複排除 + サニタイズ）
            const existing = _getRawEntries();
            const existingIds = new Set(existing.map(e => e.id));
            let newCount = 0;
            validEntries.forEach(entry => {
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

  // バッチ同期モード: trueの場合、_syncToCloudを即座に実行せず終業時にまとめて同期
  let _batchSyncMode = true; // デフォルトでバッチモード有効
  const _batchSyncDirty = new Set(); // 変更があったタイプを記録

  function _markDirtyForSync(type) {
    _batchSyncDirty.add(type);
  }

  // 全ダーティタイプを一括同期（終業時に呼ぶ）
  async function syncAllToCloud() {
    const types = [..._batchSyncDirty];
    _batchSyncDirty.clear();
    // 常にshiftsとbreaksも同期
    if (!types.includes('shifts')) types.push('shifts');
    if (!types.includes('breaks')) types.push('breaks');

    for (const type of types) {
      try {
        let entries = [];
        if (type === 'revenue') entries = _getRawEntries();
        else if (type === 'rival') entries = getRivalEntries();
        else if (type === 'gathering') entries = getGatheringMemos();
        else if (type === 'shifts') entries = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
        else if (type === 'breaks') entries = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
        else continue;
        await _syncToCloud(type, entries, 0);
      } catch (e) {
        AppLogger.warn('一括同期エラー (' + type + '): ' + e.message);
      }
    }
    AppLogger.info('終業時クラウド一括同期完了: ' + types.join(', '));
  }

  // オフライン同期キュー: ネットワーク障害時に後で再試行
  const _pendingSyncQueue = [];
  let _pendingSyncProcessing = false;

  function _enqueuePendingSync(type, entries) {
    // 同じタイプのキューが既にあれば上書き（最新データを使う）
    const idx = _pendingSyncQueue.findIndex(q => q.type === type);
    if (idx >= 0) {
      _pendingSyncQueue[idx].entries = entries;
    } else {
      _pendingSyncQueue.push({ type, entries });
    }
  }

  // ネットワーク復帰時にキューを処理
  function _processPendingSync() {
    if (_pendingSyncProcessing || _pendingSyncQueue.length === 0) return;
    _pendingSyncProcessing = true;
    const item = _pendingSyncQueue.shift();
    _syncToCloud(item.type, item.entries, 0).finally(() => {
      _pendingSyncProcessing = false;
      if (_pendingSyncQueue.length > 0) {
        setTimeout(_processPendingSync, 1000);
      }
    });
  }

  // ネットワーク復帰時に自動処理
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      AppLogger.info('ネットワーク復帰: 保留中の同期を処理');
      _processPendingSync();
    });
  }

  // バッチモード対応のラッパー: 即時同期またはダーティマーク
  function _syncToCloudOrDefer(type, entries) {
    if (_batchSyncMode) {
      _markDirtyForSync(type);
      return;
    }
    _syncToCloud(type, entries, 0);
  }

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
        await new Promise(r => setTimeout(r, delay));
        return _syncToCloud(type, entries, retryCount + 1);
      } else {
        AppLogger.warn(`クラウド同期失敗: ${res.status}`);
      }
    } catch (e) {
      if (retryCount < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, delay));
        return _syncToCloud(type, entries, retryCount + 1);
      } else {
        // 全リトライ失敗: オフラインキューに追加
        AppLogger.warn('クラウド同期エラー（キューに追加）: ' + e.message);
        _enqueuePendingSync(type, entries);
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

    const local = type === 'revenue' ? _getRawEntries() : type === 'gathering' ? getGatheringMemos() : getRivalEntries();
    const localById = new Map(local.map(e => [e.id, e]));
    let merged = 0;
    cloudEntries.forEach(entry => {
      const existing = localById.get(entry.id);
      if (!existing) {
        // ローカルに存在しない → 追加
        local.push(entry);
        localById.set(entry.id, entry);
        merged++;
      } else {
        // 両方に存在 → timestampが新しい方を採用
        const cloudTs = entry.timestamp || entry.updatedAt || '';
        const localTs = existing.timestamp || existing.updatedAt || '';
        if (cloudTs > localTs) {
          Object.assign(existing, entry);
          merged++;
        }
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

  // 同期の競合防止フラグ
  let _autoSyncRunning = false;

  async function autoSync() {
    // 同期が既に実行中なら重複実行を防止
    if (_autoSyncRunning) {
      AppLogger.debug('自動同期: 前回の同期がまだ実行中のためスキップ');
      return null;
    }
    _autoSyncRunning = true;
    try {
      const [r1, r3, r5, r6] = await Promise.all([
        syncFromCloud('revenue'),
        syncWorkStatusFromCloud(),
        syncShiftsFromCloud(),
        syncBreaksFromCloud(),
      ]);
      const totalMerged = (r1.merged || 0) + (r5.merged || 0) + (r6.merged || 0);
      if (totalMerged > 0 || r3.merged) {
        AppLogger.info(`自動同期完了: 売上+${r1.merged}件, シフト+${r5.merged}件, 休憩+${r6.merged}件${r3.merged ? ', 勤務状態更新あり' : ''}`);
      } else {
        AppLogger.debug('自動同期: 新規データなし');
      }
      return { revenue: r1, workStatus: r3, shifts: r5, breaks: r6 };
    } catch (e) {
      AppLogger.warn('自動同期エラー: ' + e.message);
      return null;
    } finally {
      _autoSyncRunning = false;
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
    // タイムスタンプベースのマージ: ローカルが新しければローカルを保持
    const localUpdated = local.updatedAt || local.lastModified || '';
    const cloudUpdated = cloudStatus.updatedAt || cloudStatus.lastModified || '';
    let merged;
    if (localUpdated && cloudUpdated && localUpdated > cloudUpdated) {
      // ローカルの方が新しい → ローカルを基準にクラウドのみのキーを補完
      merged = { ...cloudStatus, ...local };
    } else {
      // クラウドが新しい or タイムスタンプなし → クラウド優先（従来動作）
      merged = { ...local, ...cloudStatus };
    }
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
      _syncToCloudOrDefer("shifts", entries);
    } catch (e) {
      AppLogger.warn('シフトクラウド同期エラー: ' + e.message);
    }
  }

  async function syncBreaksToCloud() {
    try {
      const secret = _getSyncSecret();
      if (!secret) return;
      const entries = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      _syncToCloudOrDefer("breaks", entries);
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
    if (!isoString) return '月'; // フォールバック
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const d = new Date(isoString);
    const idx = d.getDay();
    return isNaN(idx) ? '月' : days[idx];
  }

  function getDayOfWeekIndex(isoString) {
    if (!isoString) return 1; // フォールバック
    const d = new Date(isoString);
    const idx = d.getDay();
    return isNaN(idx) ? 1 : idx;
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
    const today = getLocalDateString();

    // 直近のシフト（アクティブまたは最後に終了したシフト）を基準にする
    let shiftStartDate = today;
    let shiftEndTime = null;
    try {
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      // まずアクティブシフトを探す
      const activeShift = shifts.find(s => !s.endTime);
      if (activeShift && activeShift.startTime) {
        // アクティブシフト中は、シフト開始日を基準にする（日付跨ぎ対応）
        shiftStartDate = getLocalDateString(new Date(activeShift.startTime));
      } else {
        // 終了済みの直近シフトを探す
        const recentShifts = shifts
          .filter(s => s.startTime && s.endTime)
          .sort((a, b) => b.startTime.localeCompare(a.startTime));
        if (recentShifts.length > 0) {
          const lastShift = recentShifts[0];
          const lastShiftDate = getLocalDateString(new Date(lastShift.startTime));
          // 完了済みシフトが今日開始の場合のみ、そのシフト基準にする
          // 前日開始→今日終了の跨ぎシフトは、終了後は today を基準にする
          if (lastShiftDate === today) {
            shiftStartDate = lastShiftDate;
            shiftEndTime = new Date(lastShift.endTime);
          }
        }
      }
    } catch(e) {}

    // 現在アクティブなシフトの開始時刻を取得（フォールバック判定用）
    let activeShiftStartTime = null;
    try {
      const _shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const _active = _shifts.find(s => !s.endTime);
      if (_active && _active.startTime) activeShiftStartTime = new Date(_active.startTime);
    } catch(e) {}

    // シフト開始日のエントリを集計（shiftDateフィールド優先）
    const todayEntries = entries.filter(e => {
      // shiftDateが明示的に設定されている場合、それを使う
      if (e.shiftDate) {
        return e.shiftDate === shiftStartDate;
      }
      // shiftDateがない旧エントリ: dateとtimestampで判定
      const d = e.date || toDateStr(e.timestamp);
      if (d === shiftStartDate) {
        // 新シフト開始後に記録されたエントリのみ含める（前シフトのものを除外）
        if (activeShiftStartTime && e.timestamp) {
          const entryTime = new Date(e.timestamp);
          // エントリが前シフト終了前（=新シフト開始前）に作成された場合は除外
          if (entryTime < activeShiftStartTime && shiftStartDate === today) return false;
        }
        return true;
      }
      if (d < shiftStartDate || d > today) return false;
      if (shiftEndTime && e.timestamp) {
        const entryTime = new Date(e.timestamp);
        if (entryTime > shiftEndTime) return false;
      }
      return true;
    });

    const totalAmount = todayEntries.reduce((sum, e) => _isCouponSub(e) ? sum : sum + _meterAmount(e), 0);
    const rideCount = todayEntries.length;
    const avgAmount = rideCount > 0 ? Math.round(totalAmount / rideCount) : 0;

    // 稼働時間の計算
    let workMinutes = 0;
    let breakMinutes = 0;
    try {
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      shifts.forEach(s => {
        if (!s.startTime) return;
        const sDate = getLocalDateString(new Date(s.startTime));
        if (sDate < shiftStartDate || sDate > today) return;
        const start = new Date(s.startTime);
        const end = s.endTime ? new Date(s.endTime) : new Date();
        workMinutes += Math.round((end - start) / 60000);
      });
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      breaks.forEach(b => {
        if (!b.startTime) return;
        const bDate = getLocalDateString(new Date(b.startTime));
        if (bDate < shiftStartDate || bDate > today) return;
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
      shiftStartDate: shiftStartDate,
    };
  }

  // ============================================================
  // 全期間サマリー
  // ============================================================
  function getOverallSummary(dayType) {
    const entries = _getAnalyticsEntries(dayType);
    const totalAmount = entries.reduce((sum, e) => _isCouponSub(e) ? sum : sum + _meterAmount(e), 0);
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
  function getDailyBreakdown(days = 30, dayType) {
    const entries = _getAnalyticsEntries(dayType);
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
        result[key].amount += _meterAmount(e);
        result[key].count += 1;
      }
    });

    return Object.values(result);
  }

  // ============================================================
  // 曜日別集計（Analytics用）
  // ============================================================
  function getDayOfWeekBreakdown(dayType) {
    const entries = _getAnalyticsEntries(dayType);
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const result = days.map((name, i) => ({ name, index: i, amount: 0, count: 0, avg: 0 }));

    entries.forEach(e => {
      const dateStr = e.date || toDateStr(e.timestamp);
      const idx = dateStr ? new Date(dateStr + 'T00:00:00').getDay() : getDayOfWeekIndex(e.timestamp);
      result[idx].amount += _meterAmount(e);
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
  function getHourlyBreakdown(dayType) {
    const entries = _getAnalyticsEntries(dayType);
    const result = [];

    for (let h = 0; h < 24; h++) {
      result.push({ hour: h, label: `${h}時`, amount: 0, count: 0, avg: 0 });
    }

    entries.forEach(e => {
      const time = e.dropoffTime || e.pickupTime || '';
      const h = time ? parseInt(time.split(':')[0], 10) : toHour(e.timestamp);
      if (h >= 0 && h < 24) {
        result[h].amount += _meterAmount(e);
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
    function getAreaBreakdown() { return []; }


  // ============================================================
  // 天候別集計
  // ============================================================
    function getWeatherBreakdown() { return []; }


  // ============================================================
  // 配車方法別集計
  // ============================================================
    function getSourceBreakdown() { return []; }


  // ============================================================
  // 用途別集計
  // ============================================================
    function getPurposeBreakdown() { return []; }


  // ============================================================
  // 用途×曜日×日種別（平日/休日/大型連休）クロス分析
  // ============================================================
    function getPurposeDayAnalysis() { return {}; }


  // ============================================================
  // エリア×時間帯クロス集計
  // ============================================================
    function getAreaTimeBreakdown() { return []; }


  // ============================================================
  // 客単価分析
  // ============================================================
    function getUnitPriceAnalysis() { return {}; }


  // ============================================================
  // 今日のおすすめ（業務推奨）
  // ============================================================
    function getBusinessRecommendation() { return {}; }


  // ============================================================
  // 配車方法×エリア×単価ランク クロス分析
  // ============================================================
    function getSourceAreaPriceBreakdown() { return {}; }


  // ============================================================
  // 単価ランク別ヒートマップデータ（地図用）
  // ============================================================
    function getPriceTierHeatmapData() { return []; }


  // ============================================================
  // 現在地周辺の推定単価（地図パネル用）
  // ============================================================
    function getNearbyEstimate() { return []; }


  // ============================================================
  // ヒートマップデータ（半径2kmオーバーラップ方式）
  // 各乗車地点から半径2km圏内に仮想ポイントを配置し、
  // 複数の乗車地点の2km圏が重なるエリアほど高密度になる
  // ============================================================
    function getHeatmapData() { return []; }


  // ============================================================
  // 週別集計
  // ============================================================
    function getWeeklyBreakdown() { return []; }


  // ============================================================
  // 月別集計
  // ============================================================
  function getMonthlyBreakdown(dayType) {
    const entries = _getAnalyticsEntries(dayType);
    const result = {};

    entries.forEach(e => {
      const key = getMonthStr(e.timestamp);
      if (!result[key]) {
        result[key] = { month: key, amount: 0, count: 0 };
      }
      result[key].amount += _meterAmount(e);
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

    const header = 'ID,日付,合算日,曜日,祝日,日時,天候,金額,支払方法,割引額,割引種別,乗車地,乗車ランドマーク,乗車緯度,乗車経度,乗車時間,待機時間,降車地,降車ランドマーク,降車緯度,降車経度,降車時間,人数,性別,用途,配車方法,メモ';
    const rows = entries.map(e => {
      const entryDate = e.date || toDateStr(e.timestamp);
      const shiftDate = e.shiftDate || entryDate;
      const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
      const dayOfWeek = e.dayOfWeek || dateInfo.dayOfWeek;
      const holiday = e.holiday || dateInfo.holiday || '';
      const dateTime = new Date(e.timestamp).toLocaleString('ja-JP');
      const weather = (e.weather || '').replace(/,/g, '、');
      const paymentMethod = e.paymentMethod === 'uncollected' ? '未収' : e.paymentMethod === 'didi' ? 'DIDI決済' : e.paymentMethod === 'uber' ? 'Uber' : '現金';
      const discountAmount = e.discountAmount || 0;
      const discountTypeMap = { disability: '障害者割引', longDistance: '遠距離割', coupon: 'クーポン', ticket: 'チケット' };
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
      return `${e.id},${entryDate},${shiftDate},${dayOfWeek},${holiday},${dateTime},${weather},${e.amount},${paymentMethod},${discountAmount},${discountType},${pickup},${pickupLandmark},${pickupLat},${pickupLng},${pickupTime},${waitingTime},${dropoff},${dropoffLandmark},${dropoffLat},${dropoffLng},${dropoffTime},${passengers},${gender},${purpose},${source},${memo}`;
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
    const dateStr = getLocalDateString();
    _downloadFile(`taxi_revenue_${dateStr}.csv`, blob, `CSVエクスポート完了: ${getEntries().length}件`);
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

    const entries = _getRawEntries();
    const entryDate = form.date || getLocalDateString();
    const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
    // 割引額を計算（障害者割引など、クーポン・チケット以外）
    const _discountAmt = (() => {
      const d = form.discounts || {};
      return Object.entries(d).filter(([k]) => !k.startsWith('_') && k !== 'ticket' && k !== 'coupon').reduce((sum, [, v]) => sum + (parseInt(v) || 0), 0);
    })();
    // クーポン金額
    const _couponAmt = parseInt((form.discounts || {}).coupon) || 0;
    const _couponUnitPrice = parseInt((form.discounts || {})._couponUnitPrice) || 0;
    const _couponSheets = parseInt((form.discounts || {})._couponSheets) || 0;
    // メインの売上額 = 元金額 - 割引 - クーポン
    const mainAmount = parseInt(form.amount) - _discountAmt - _couponAmt;
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      amount: mainAmount,
      date: entryDate,
      dayOfWeek: dateInfo.dayOfWeek,
      holiday: dateInfo.holiday || '',
      pickupTime: form.pickupTime || '',
      dropoffTime: form.dropoffTime || '',
      passengers: form.passengers || '',
      noPassenger: form.noPassenger || false,
      paymentMethod: form.paymentMethod || 'cash',
      discounts: (() => {
        const d = form.discounts || {};
        // クーポンは別エントリにするので除外
        return Object.entries(d).filter(([k, v]) => !k.startsWith('_') && k !== 'coupon' && v && parseInt(v) > 0).map(([type, amount]) => {
          const item = { type, amount: parseInt(amount) };
          return item;
        });
      })(),
      discountAmount: _discountAmt,
      discountType: (() => {
        const d = form.discounts || {};
        const types = Object.entries(d).filter(([k, v]) => !k.startsWith('_') && k !== 'coupon' && v && parseInt(v) > 0).map(([t]) => t);
        return types.join(',');
      })(),
      couponAmount: _couponAmt > 0 ? _couponAmt : 0,
      timestamp: new Date().toISOString(),
      shiftDate: form.shiftDate || entryDate,
    };

    entries.unshift(entry);

    // クーポン分は別エントリとして未収で記録（parentIdで紐付け）
    let couponEntry = null;
    if (_couponAmt > 0) {
      couponEntry = {
        id: Date.now() + '_coupon_' + Math.random().toString(36).substr(2, 5),
        couponParentId: entry.id,
        amount: _couponAmt,
        date: entryDate,
        dayOfWeek: dateInfo.dayOfWeek,
        holiday: dateInfo.holiday || '',
        pickupTime: form.pickupTime || '',
        dropoffTime: form.dropoffTime || '',
        passengers: '',
        memo: `クーポン未収（¥${_couponUnitPrice.toLocaleString()}×${_couponSheets}枚）`,
        noPassenger: false,
        paymentMethod: 'uncollected',
        discounts: [],
        discountAmount: 0,
        discountType: '',
        couponAmount: 0,
        timestamp: new Date().toISOString(),
        shiftDate: form.shiftDate || entryDate,
      };
      entries.unshift(couponEntry);
    }

    saveEntries(entries);
    const holidayStr = dateInfo.holiday ? ` [${dateInfo.holiday}]` : '';
    const paymentStr = entry.paymentMethod === 'uncollected' ? ' [未収]' : entry.paymentMethod === 'didi' ? ' [DIDI決済]' : '';
    const discountStr = entry.discountAmount > 0 ? ` [割引¥${entry.discountAmount}]` : '';
    const couponStr = _couponAmt > 0 ? ` [クーポン¥${_couponAmt}→未収]` : '';
    AppLogger.info(`売上記録追加: ¥${entry.amount}${paymentStr}${discountStr}${couponStr} (${entry.date} ${dateInfo.dayOfWeek}${holidayStr})`);
    // 自動ファイル保存
    autoSaveToFile();
    _syncToCloudOrDefer('revenue', entries);
    _notifyDataChanged('revenue');
    return { success: true, entry, couponEntry };
  }

  function deleteEntry(id) {
    const entries = _getRawEntries();
    const filtered = entries.filter(e => e.id !== id);
    saveEntries(filtered);
    AppLogger.info('売上記録を削除しました');
    autoSaveToFile();
    _syncToCloudOrDefer('revenue', filtered);
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
    const entries = _getRawEntries();
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
    _syncToCloudOrDefer('revenue', filtered);
    _notifyDataChanged('revenue');
    return true;
  }

    function moveRivalToTrash() { return false; }


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
      const entries = _getRawEntries();
      entries.unshift(item);
      saveEntries(entries);
      autoSaveToFile();
      _syncToCloudOrDefer('revenue', entries);
      _notifyDataChanged('revenue');
      AppLogger.info('売上記録をゴミ箱から復元しました');
    } else if (type === 'rival') {
      const entries = getRivalEntries();
      entries.unshift(item);
      saveRivalEntries(entries);
      autoSaveRivalToFile();
      _syncToCloudOrDefer('rival', entries);
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

  /** 2日以上前の「その他」待機記録を自動削除 */
  function cleanupOtherStandby() {
    const entries = _getRawEntries();
    const now = new Date();
    const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().slice(0, 10);

    const toRemove = [];
    const toKeep = [];

    entries.forEach(e => {
      if (e.noPassenger && e.purpose === '待機' && e.date && e.date <= twoDaysAgoStr) {
        // 場所名が空・「その他」・不明な待機記録を削除対象にする
        const place = (e.pickup || '').trim();
        const isOther = !place || place === 'その他' || place === '不明';
        if (isOther) {
          toRemove.push(e);
          return;
        }
      }
      toKeep.push(e);
    });

    if (toRemove.length > 0) {
      saveEntries(toKeep);
      AppLogger.info(`「その他」待機記録の自動削除: ${toRemove.length}件（2日以上前）`);
    }
  }

  function updateEntry(id, updates) {
    const entries = _getRawEntries();
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
    _syncToCloudOrDefer('revenue', entries);
    _notifyDataChanged('revenue');
    return { success: true, entry: entries[idx] };
  }

  function clearAllEntries() {
    saveEntries([]);
    _syncToCloudOrDefer('revenue', []);
    AppLogger.info('全売上データを削除しました');
    _notifyDataChanged('revenue');
    return true;
  }

  // ============================================================
  // 他社乗車データ CRUD
  // ============================================================
    function getRivalEntries() { return []; }


    function saveRivalEntries() { return false; }


    function addRivalEntry() { return { success: false, errors: ['無効'] }; }


    function deleteRivalEntry() { return false; }


    function updateRivalEntry() { return { success: false, errors: ['無効'] }; }


    function clearAllRivalEntries() { return false; }


  // ============================================================
  // 他社乗車分析
  // ============================================================
    function getRivalHourlyBreakdown() { return []; }


    function getRivalDayOfWeekBreakdown() { return []; }


    function getRivalLocationBreakdown() { return []; }


    function getRivalWeatherBreakdown() { return []; }


    function downloadRivalCSV() { return false; }


  // ============================================================
  // 集客メモ CRUD
  // ============================================================
    function getGatheringMemos() { return []; }


    function saveGatheringMemos() { return false; }


    function addGatheringMemo() { return { success: false, errors: ['無効'] }; }


    function updateGatheringMemo() { return { success: false, errors: ['無効'] }; }


    function deleteGatheringMemo() { return false; }


    function clearAllGatheringMemos() { return false; }


  // ============================================================
  // 集客メモ分析
  // ============================================================
    function getGatheringAnalysis() { return []; }


    function downloadGatheringCSV() { return false; }


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
    function getEvents() { return []; }


    function saveEvents() { return false; }


    function addEvent() { return { success: false, errors: ['無効'] }; }


    function deleteEvent() { return false; }


    function clearAllEvents() { return false; }


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

    function getUtilizationRate() { return []; }


  // ============================================================
  // 日次レポート（改善ポイント分析）
  // ============================================================
    function getDailyReport() { return {}; }


  // ============================================================
  // 空車時間帯別対策レコメンド
  // ============================================================
    function getVacancyCountermeasures() { return {}; }


  // ============================================================
  // エリア別レコメンド（統計ベース）
  // ============================================================
    function getAreaRecommendation() { return {}; }


  // ============================================================
  // ML用データエクスポート（LightGBM学習用）
  // ============================================================
  async function exportMLData() {
    const entries = getEntries();
    const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
    const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');

    // エリア定義（cruisingAreas + 追加エリア）
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const cruisingAreas = locs && locs.cruisingAreas ? locs.cruisingAreas : [];
    const extraAreas = [
      { id: 'station', name: '旭川駅北口', lat: 43.7631, lng: 142.3581, radius: 300 },
      { id: 'airport', name: '旭川空港', lat: 43.6708, lng: 142.4475, radius: 1000 },
      { id: 'zoo', name: '旭山動物園', lat: 43.7688, lng: 142.4849, radius: 500 },
    ];
    const allAreas = [...extraAreas, ...cruisingAreas.map(a => ({ ...a, radius: 800 }))];

    function coordToArea(lat, lng) {
      if (!lat || !lng) return { id: 'unknown', name: '不明' };
      let bestArea = null, bestDist = Infinity;
      for (const area of allAreas) {
        const dLat = (lat - area.lat) * 111320;
        const dLng = (lng - area.lng) * 111320 * Math.cos(area.lat * Math.PI / 180);
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        const r = area.radius || 800;
        if (dist < r && dist < bestDist) {
          bestArea = area;
          bestDist = dist;
        }
      }
      return bestArea ? { id: bestArea.id, name: bestArea.name || bestArea.shortName } : { id: 'other', name: 'その他郊外' };
    }

    // 売上エントリ → trips テーブル
    const revenueEntries = entries.filter(e => !e.noPassenger && e.amount > 0);
    const trips = revenueEntries.map((e, idx) => {
      const entryDate = e.date || toDateStr(e.timestamp);
      const dateInfo = JapaneseHolidays.getDateInfo(entryDate);
      const pMin = _timeToMinutes(e.pickupTime);
      const dMin = _timeToMinutes(e.dropoffTime);
      const durationMin = (pMin !== null && dMin !== null && dMin > pMin) ? dMin - pMin : null;
      const pickupArea = (e.pickupCoords && e.pickupCoords.lat) ? coordToArea(e.pickupCoords.lat, e.pickupCoords.lng) : { id: 'unknown', name: '不明' };
      const dropoffArea = (e.dropoffCoords && e.dropoffCoords.lat) ? coordToArea(e.dropoffCoords.lat, e.dropoffCoords.lng) : { id: 'unknown', name: '不明' };
      const hour = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : null;
      const [y, m, d] = entryDate.split('-').map(Number);
      const jsDate = new Date(y, m - 1, d);
      const weekday = jsDate.getDay(); // 0=Sun
      const isPay = d >= 23 && d <= 27;

      return {
        trip_id: idx + 1,
        date: entryDate,
        pickup_time: e.pickupTime || '',
        dropoff_time: e.dropoffTime || '',
        pickup_lat: e.pickupCoords ? e.pickupCoords.lat : null,
        pickup_lon: e.pickupCoords ? e.pickupCoords.lng : null,
        dropoff_lat: e.dropoffCoords ? e.dropoffCoords.lat : null,
        dropoff_lon: e.dropoffCoords ? e.dropoffCoords.lng : null,
        pickup_area_id: pickupArea.id,
        pickup_area: pickupArea.name,
        dropoff_area_id: dropoffArea.id,
        dropoff_area: dropoffArea.name,
        revenue: e.amount,
        duration_min: durationMin,
        hour: hour,
        weekday: weekday,
        day_of_week: dateInfo.dayOfWeek,
        is_holiday: dateInfo.isHoliday ? 1 : 0,
        is_payday_period: isPay ? 1 : 0,
        month: m,
        weather: e.weather || '',
        temperature: e.temperature != null ? e.temperature : null,
        passengers: parseInt(e.passengers) || 1,
        gender: e.gender || '',
        purpose: e.purpose || '',
        dispatch_type: e.source || '',
        payment_method: e.paymentMethod || 'cash',
      };
    });

    // 空車区間テーブル（連続する乗車間の空車時間）
    const sortedTrips = [...trips].filter(t => t.pickup_time && t.dropoff_time).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.pickup_time.localeCompare(b.pickup_time);
    });

    const vacantPeriods = [];
    for (let i = 0; i < sortedTrips.length - 1; i++) {
      const curr = sortedTrips[i];
      const next = sortedTrips[i + 1];
      if (curr.date !== next.date) continue;
      const currEnd = _timeToMinutes(curr.dropoff_time);
      const nextStart = _timeToMinutes(next.pickup_time);
      if (currEnd === null || nextStart === null || nextStart <= currEnd) continue;
      const vacantMin = nextStart - currEnd;
      if (vacantMin > 180) continue; // 3時間超は除外

      // 空車開始地点（前の降車地点）からエリア判定
      const waitArea = curr.dropoff_area_id !== 'unknown' ? { id: curr.dropoff_area_id, name: curr.dropoff_area } : { id: 'unknown', name: '不明' };
      // 配車種別を推定
      const waitingType = next.dispatch_type === '待機' ? '付け待ち' : next.dispatch_type === '流し' ? '流し' : next.dispatch_type || '不明';

      vacantPeriods.push({
        date: curr.date,
        vacant_start_time: curr.dropoff_time,
        vacant_end_time: next.pickup_time,
        vacant_duration_min: vacantMin,
        waiting_area_id: waitArea.id,
        waiting_area: waitArea.name,
        waiting_type: waitingType,
        hour: parseInt(curr.dropoff_time.split(':')[0], 10),
        weekday: curr.weekday,
        is_holiday: curr.is_holiday,
        weather: curr.weather,
        temperature: curr.temperature,
        month: curr.month,
        next_revenue: next.revenue,
        next_pickup_area: next.pickup_area,
      });
    }

    // 時間あたり売上（メイン目的変数）の計算
    const tripsEnriched = sortedTrips.map((trip, i) => {
      // この乗車に対応する空車時間を見つける
      const matchingVacant = vacantPeriods.find(v =>
        v.date === trip.date && v.vacant_end_time === trip.pickup_time
      );
      const vacantMin = matchingVacant ? matchingVacant.vacant_duration_min : 0;
      const totalMin = (trip.duration_min || 0) + vacantMin;
      const revenuePerHour = totalMin > 0 ? Math.round((trip.revenue / totalMin) * 60) : null;
      return {
        ...trip,
        vacant_duration_min: vacantMin,
        total_cycle_min: totalMin,
        revenue_per_hour: revenuePerHour,
      };
    });

    // シフトデータ
    const shiftsData = shifts.filter(s => s.startTime).map(s => ({
      date: toDateStr(s.startTime),
      start_time: new Date(s.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }),
      end_time: s.endTime ? new Date(s.endTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
      duration_min: s.endTime ? Math.round((new Date(s.endTime) - new Date(s.startTime)) / 60000) : null,
    }));

    // GPSログから日別サマリー取得（非同期）
    let gpsSummaries = [];
    if (window.GpsLogService) {
      try {
        const dates = await window.GpsLogService.getLogDates();
        for (const d of dates) {
          const summary = await window.GpsLogService.getDaySummary(d);
          if (summary) {
            gpsSummaries.push({
              date: d,
              total_min: summary.total,
              occupied_min: summary.occupied,
              vacant_min: summary.vacant,
              occupancy_rate: summary.rate,
              gps_points: summary.points,
              first_time: summary.firstTime,
              last_time: summary.lastTime,
            });
          }
        }
      } catch (e) { /* skip GPS data if unavailable */ }
    }

    // エリアマスタ
    const areaMaster = allAreas.map(a => ({
      area_id: a.id,
      area_name: a.name || a.shortName || a.id,
      lat: a.lat,
      lng: a.lng,
      radius: a.radius || 800,
    }));

    const exportData = {
      version: APP_CONSTANTS.VERSION,
      exported_at: new Date().toISOString(),
      trips: tripsEnriched,
      vacant_periods: vacantPeriods,
      shifts: shiftsData,
      gps_summaries: gpsSummaries,
      area_master: areaMaster,
      stats: {
        total_trips: tripsEnriched.length,
        total_vacant_periods: vacantPeriods.length,
        total_shifts: shiftsData.length,
        total_gps_days: gpsSummaries.length,
        date_range: tripsEnriched.length > 0
          ? { from: tripsEnriched[0].date, to: tripsEnriched[tripsEnriched.length - 1].date }
          : null,
      },
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const dateStr = getLocalDateString();
    _downloadFile(`taxi_ml_data_${dateStr}.json`, blob, `ML用データエクスポート完了: ${tripsEnriched.length}件の乗車記録`);
    return exportData;
  }

  // 時間帯別の実車/非実車を集計（mode: 'month' | 'all'）
    function getHourlyOccupancy() { return {}; }


    function getTopPickupAreasForNow() { return []; }


    function getGoalProgress() { return {}; }


    function getUpcomingEventAlerts() { return []; }


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
    function getFrequentPickupSpots() { return []; }


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
    function getChainSuggestion() { return []; }


  // 時間帯・曜日対応ヒートマップデータ
  // ============================================================
  // 乗車地ベスト15（1kmクラスタリング）
  // ============================================================
    function getTopPickupClusters() { return []; }


  // ============================================================
  // 時間帯別 乗車地ベスト15
  // hour: 0-23 の時間帯で絞り込んだランキングを返す
  // ============================================================
    function getPickupClustersByHour() { return []; }


  // mode: 'all' | 'timeAware' | 'transit' | 'combined'
    function getSmartHeatmapData() { return {}; }


  // 時間帯指定ヒートマップ（指定時間のみ表示）
    function getHeatmapDataByHour() { return []; }


  // 場所名→座標の変換ヘルパー
    function _resolveLocationCoords() { return null; }


  // 病院外来スケジュールデータ（リアルタイム状態判定）
    function getHospitalScheduleData() { return []; }


  // 旭川駅前バスターミナル到着便の構造化データ（実時刻表ベース）
    function getBusArrivalsData() { return []; }


  // 当日の需要プランを取得（バス実データ + Geminiプラン + イベントデータをマージ）
    function getDailyDemandSchedule() { return {}; }


  // 日勤タイムライン: 7-17時のイベントを時系列でマージ
    function getDayShiftTimeline() { return {}; }


  // 次の最適行動を提案
    function getNextOptimalAction() { return {}; }


  // ホテル需要データを算出（時間帯×客室数×駅距離からウェイト計算）
    function getHotelDemandData() { return {}; }


  // 天候需要インパクト分析（時間別天気予報から需要変動を算出）
  // 注意: forecastDataは非同期で取得済みのデータを外部から渡す
    function getWeatherDemandImpact() { return {}; }


  // 待機スポット需要指数を算出（全スポット×24時間）
    function getWaitingSpotDemandIndex() { return {}; }


  // ============================================================
  // 流しエリア需要指数を算出（全エリア×24時間）
  // ============================================================
    function getCruisingAreaDemandIndex() { return {}; }


  // ============================================================
  // 待機スポット売上シミュレーション
  // ============================================================
    function getWaitingSpotRevenueForecast() { return {}; }


  // 日勤需要スコア（7-17時特化の複合スコア）
    function getDayShiftDemandScore() { return {}; }


  // 戦略シミュレーション: 指定時間帯の各スポット/エリアを比較
    function getStrategySimulation() { return {}; }


  // 閑散期流しルート提案
    function getSlowPeriodCruisingRoutes() { return {}; }


  // 交通到着データ + 病院ピークからヒートマップポイントを生成
    function getTransitHeatmapData() { return {}; }


  // ============================================================
  // 待機 vs 流し 効率比較分析
  // ============================================================
    function getWaitingVsCruisingEfficiency() { return {}; }


  // ============================================================
  // ホテル価格蓄積・分析
  // ============================================================
    function getHotelPriceHistory() { return []; }


    function saveHotelPrices() { return false; }


    function analyzeHotelPrices() { return {}; }


  // ============================================================
  // シフト生産性分析
  // ============================================================
    function getShiftProductivity() { return {}; }


  // ============================================================
  // 天気×売上相関
  // ============================================================
    function getWeatherRevenueCorrelation() { return {}; }


  // ============================================================
  // 集客メモ×売上検証
  // ============================================================
    function getGatheringRevenueCorrelation() { return {}; }


  // ============================================================
  // 天候×時間帯 需要マトリクス
  // ============================================================
    function getWeatherTimeDemandMatrix() { return {}; }


  // ============================================================
  // 気温帯別分析
  // ============================================================
    function getTemperatureBandAnalysis() { return {}; }


  // ============================================================
  // 実車率・天候タブ用 統合分析（既存データフル活用）
  // ============================================================

  /** エリア別 実車率・売上効率 */
    function getAreaOccupancyAnalysis() { return {}; }


  /** 配車元別 効率分析（流し/待機/DIDI/電話等） */
    function getSourceEfficiencyAnalysis() { return {}; }


  /** 曜日×天候 クロス分析 */
    function getDayWeatherCrossAnalysis() { return {}; }


  /** シフト別 実車率分析 */
    function getShiftOccupancyAnalysis() { return {}; }


  /** 乗客属性分析（人数・性別×天候） */
    function getPassengerWeatherAnalysis() { return {}; }


  /** 目的別×天候 分析 */
    function getPurposeWeatherAnalysis() { return {}; }


  /** 支払方法×天候 分析 */
    function getPaymentWeatherAnalysis() { return {}; }


  /** 他社乗車×天候 相関分析 */
    function getRivalWeatherOccupancyAnalysis() { return {}; }


  /** 待機時間と実車率の関係分析 */
    function getWaitingTimeOccupancyAnalysis() { return {}; }


  // ============================================================
  // 公開API
  // ============================================================

  // auto-stubs for missing exports
  function getZooStatus() { return {}; }

  return {
    // データ取得
    getEntries,
    getRawEntries: _getRawEntries,
    getVacantEntries,
    getStandbyEntries,
    saveEntries,
    cleanRemovedRevenueFields,

    // フィルタ
    getFilteredEntries: (dayType) => _filterByDayType(getEntries(), dayType),

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
    getWeatherTimeDemandMatrix,
    getTemperatureBandAnalysis,
    getAreaOccupancyAnalysis,
    getSourceEfficiencyAnalysis,
    getDayWeatherCrossAnalysis,
    getShiftOccupancyAnalysis,
    getPassengerWeatherAnalysis,
    getPurposeWeatherAnalysis,
    getPaymentWeatherAnalysis,
    getRivalWeatherOccupancyAnalysis,
    getWaitingTimeOccupancyAnalysis,
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
    cleanupOtherStandby,

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
    syncAllToCloud,
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
    migrateStationDropoffPurpose,
    getGoalProgress,
    getUpcomingEventAlerts,
    getSmartHeatmapData,
    getHeatmapDataByHour,
    getZooStatus,

    // 交通需要連動
    getDailyDemandSchedule,
    getTransitHeatmapData,
    getHotelDemandData,
    getBusArrivalsData,

    // 乗車地ベスト15（1kmクラスタリング）
    getTopPickupClusters,
    getPickupClustersByHour,

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

    // 待機 vs 流し効率分析
    getWaitingVsCruisingEfficiency,

    // ホテル価格
    getHotelPriceHistory,
    saveHotelPrices,
    analyzeHotelPrices,

    // 時間帯別実車グラフ
    getHourlyOccupancy,

    // ML用データエクスポート
    exportMLData,

    // エリア別レコメンド
    getAreaRecommendation,

    // 日次レポート
    getDailyReport,

    // 空車対策
    getVacancyCountermeasures,

    // 日種別
    getTodayDayType,
    classifyDayType,
  };
})();

})();
