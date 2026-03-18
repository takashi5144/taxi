(function() {
// asahikawaData.js - 旭川市観光データ管理サービス
//
// 観光入込客数、宿泊延数、外国人宿泊数、施設別データ等を
// カテゴリ別にlocalStorageで管理。編集・追加・エクスポートが可能。

window.AsahikawaData = (() => {
  const STORAGE_KEY = 'taxi_app_asahikawa_data';
  let _cache = null;

  // --- デフォルトデータ（公式統計より） ---
  const DEFAULT_DATA = {
    version: 1,
    lastUpdated: '2025-03-18',

    // ========================================
    // 年度別 観光入込客数（千人）
    // ========================================
    annualVisitors: [
      { fy: 2015, label: 'H27', total: 5350.0, firstHalf: 3455.0, secondHalf: 1895.0, yoy: 100.3 },
      { fy: 2016, label: 'H28', total: 5530.0, firstHalf: 3561.0, secondHalf: 1969.0, yoy: 103.4 },
      { fy: 2017, label: 'H29', total: 5310.0, firstHalf: 3460.4, secondHalf: 1849.6, yoy: 96.0 },
      { fy: 2018, label: 'H30', total: 5357.0, firstHalf: 3395.0, secondHalf: 1962.0, yoy: 100.9 },
      { fy: 2019, label: 'R1', total: 5270.5, firstHalf: 3115.4, secondHalf: 2155.1, yoy: 98.4 },
      { fy: 2020, label: 'R2', total: 5079.3, firstHalf: 3236.4, secondHalf: 1842.9, yoy: 96.4 },
      { fy: 2021, label: 'R3', total: 1700.3, firstHalf: 1139.6, secondHalf: 560.7, yoy: 33.5 },
      { fy: 2022, label: 'R4', total: 1601.6, firstHalf: 849.8, secondHalf: 751.8, yoy: 94.2 },
      { fy: 2023, label: 'R5', total: 4135.3, firstHalf: 2535.5, secondHalf: 1599.8, yoy: 258.2 },
      { fy: 2024, label: 'R6', total: 4735.0, firstHalf: 3102.0, secondHalf: 1633.0, yoy: 114.5 },
      { fy: 2025, label: 'R7', total: 4867.5, firstHalf: 3194.7, secondHalf: 1672.8, yoy: 102.8, note: '上期データのみ' },
    ],

    // ========================================
    // 年度別 宿泊延数（千人泊）
    // ========================================
    annualAccommodation: [
      { fy: 2015, total: 744.4, foreign: 86.2, domestic: 658.2, foreignPct: 11.6 },
      { fy: 2016, total: 807.2, foreign: 152.2, domestic: 655.0, foreignPct: 18.9 },
      { fy: 2017, total: 857.1, foreign: 188.4, domestic: 668.7, foreignPct: 22.0 },
      { fy: 2018, total: 935.6, foreign: 205.8, domestic: 729.8, foreignPct: 22.0 },
      { fy: 2019, total: 1083.1, foreign: 244.5, domestic: 838.6, foreignPct: 22.6 },
      { fy: 2020, total: 905.8, foreign: 241.3, domestic: 664.5, foreignPct: 26.6 },
      { fy: 2021, total: 403.2, foreign: 1.4, domestic: 401.8, foreignPct: 0.3 },
      { fy: 2022, total: 379.4, foreign: 1.0, domestic: 378.4, foreignPct: 0.3 },
      { fy: 2023, total: 672.8, foreign: 48.6, domestic: 624.2, foreignPct: 7.2 },
      { fy: 2024, total: 974.2, foreign: 211.1, domestic: 763.1, foreignPct: 21.7 },
      { fy: 2025, total: 1031.6, foreign: 313.1, domestic: 718.5, foreignPct: 30.3, note: '過去最高' },
    ],

    // ========================================
    // 月別データ（観光入込客数 千人, 宿泊延数 千人泊）
    // ========================================
    monthlyData: [
      // R4 (2022)
      { fy: 2022, month: 4, visitors: 52.1, accommodation: 30.3, foreign: 0 },
      { fy: 2022, month: 5, visitors: 263.2, accommodation: 47.3, foreign: 0.1 },
      { fy: 2022, month: 6, visitors: 429.7, accommodation: 50.2, foreign: 0.1 },
      { fy: 2022, month: 7, visitors: 576.1, accommodation: 82.9, foreign: 0.4 },
      { fy: 2022, month: 8, visitors: 530.4, accommodation: 89.7, foreign: 0.8 },
      { fy: 2022, month: 9, visitors: 684.0, accommodation: 65.5, foreign: 0.2 },
      { fy: 2022, month: 10, visitors: 354.6, accommodation: 61.5, foreign: 1.1 },
      { fy: 2022, month: 11, visitors: 216.2, accommodation: 34.6, foreign: 1.7 },
      { fy: 2022, month: 12, visitors: 296.0, accommodation: 50.2, foreign: 9.6 },
      { fy: 2023, month: 1, visitors: 157.3, accommodation: 53.0, foreign: 11.1 },
      { fy: 2023, month: 2, visitors: 313.6, accommodation: 53.6, foreign: 15.2 },
      { fy: 2023, month: 3, visitors: 262.1, accommodation: 54.0, foreign: 8.2 },
      // R5 (2023)
      { fy: 2023, month: 4, visitors: 100.5, accommodation: 31.3, foreign: 4.9 },
      { fy: 2023, month: 5, visitors: 323.9, accommodation: 58.6, foreign: 9.8 },
      { fy: 2023, month: 6, visitors: 599.3, accommodation: 75.5, foreign: 13.4 },
      { fy: 2023, month: 7, visitors: 704.6, accommodation: 113.4, foreign: 19.6 },
      { fy: 2023, month: 8, visitors: 655.1, accommodation: 109.7, foreign: 16.1 },
      { fy: 2023, month: 9, visitors: 718.7, accommodation: 78.0, foreign: 10.3 },
      { fy: 2023, month: 10, visitors: 300.6, accommodation: 92.2, foreign: 15.6 },
      { fy: 2023, month: 11, visitors: 225.6, accommodation: 57.0, foreign: 10.0 },
      { fy: 2023, month: 12, visitors: 261.8, accommodation: 74.6, foreign: 25.9 },
      { fy: 2024, month: 1, visitors: 254.1, accommodation: 93.1, foreign: 31.5 },
      { fy: 2024, month: 2, visitors: 334.3, accommodation: 101.8, foreign: 35.6 },
      { fy: 2024, month: 3, visitors: 256.5, accommodation: 89.0, foreign: 18.4 },
      // R6 (2024)
      { fy: 2024, month: 4, visitors: 95.2, accommodation: 31.8, foreign: 8.9 },
      { fy: 2024, month: 5, visitors: 346.3, accommodation: 49.8, foreign: 16.3 },
      { fy: 2024, month: 6, visitors: 593.4, accommodation: 73.2, foreign: 23.0 },
      { fy: 2024, month: 7, visitors: 715.2, accommodation: 104.1, foreign: 37.8 },
      { fy: 2024, month: 8, visitors: 686.2, accommodation: 106.1, foreign: 29.0 },
      { fy: 2024, month: 9, visitors: 758.4, accommodation: 76.2, foreign: 19.3 },
      { fy: 2024, month: 10, visitors: 316.8, accommodation: 92.8, foreign: 18.2 },
      { fy: 2024, month: 11, visitors: 208.7, accommodation: 66.2, foreign: 13.0 },
      { fy: 2024, month: 12, visitors: 247.9, accommodation: 93.2, foreign: 33.5 },
      { fy: 2025, month: 1, visitors: 272.4, accommodation: 128.4, foreign: 47.7 },
      { fy: 2025, month: 2, visitors: 364.0, accommodation: 117.7, foreign: 43.6 },
      { fy: 2025, month: 3, visitors: 263.0, accommodation: 92.1, foreign: 22.8 },
    ],

    // ========================================
    // 道外客・道内客 内訳（千人）
    // ========================================
    originBreakdown: [
      { fy: 2019, total: 5079.3, outsideHokkaido: 2579.9, insideHokkaido: 2499.4, dayTrip: 4418.3, overnight: 661.0 },
      { fy: 2020, total: 1700.3, outsideHokkaido: 616.8, insideHokkaido: 1083.5, dayTrip: 1412.0, overnight: 288.3 },
      { fy: 2021, total: 1601.6, outsideHokkaido: 487.9, insideHokkaido: 1113.7, dayTrip: 1325.4, overnight: 276.2 },
      { fy: 2022, total: 4135.3, outsideHokkaido: 1770.6, insideHokkaido: 2364.7, dayTrip: 3642.4, overnight: 492.9 },
      { fy: 2023, total: 4735.0, outsideHokkaido: 2672.4, insideHokkaido: 2062.6, dayTrip: 3951.6, overnight: 783.4 },
    ],

    // ========================================
    // 四季別 観光入込客数（千人）R4(2022)
    // ========================================
    seasonalBreakdown: [
      { fy: 2022, season: '春(4-5月)', visitors: 315.3, pct: 7.6 },
      { fy: 2022, season: '夏(6-9月)', visitors: 2220.2, pct: 53.7 },
      { fy: 2022, season: '秋(10-11月)', visitors: 570.8, pct: 13.8 },
      { fy: 2022, season: '冬(12-3月)', visitors: 1029.0, pct: 24.9 },
    ],

    // ========================================
    // 外国人宿泊 国別内訳（千人泊）
    // ========================================
    foreignByCountry: [
      { fy: 2012, china: 4.5, korea: 1.5, taiwan: 6.2, hongkong: 6.0, thailand: 1.5 },
      { fy: 2013, china: 6.6, korea: 2.4, taiwan: 13.2, hongkong: 7.1, thailand: 5.2 },
      { fy: 2014, china: 27.6, korea: 3.0, taiwan: 18.1, hongkong: 10.3, thailand: 6.9 },
      { fy: 2015, china: 63.5, korea: 6.4, taiwan: 26.8, hongkong: 15.2, thailand: 12.3 },
      { fy: 2016, china: 74.2, korea: 12.2, taiwan: 23.4, hongkong: 19.7, thailand: 22.8 },
    ],

    // ========================================
    // 宿泊施設情報
    // ========================================
    hotelInfo: {
      lastUpdated: '2018-01',
      totalFacilities: 63,
      totalRooms: 4199,
      foreignGuestRatio2017: 22.0,
      notes: '2018年1月時点。2008年は2,781室→2018年は4,199室（1.5倍増）',
    },

    // ========================================
    // カスタムメモ（ユーザーが自由に追記）
    // ========================================
    customNotes: [],
  };

  // --- ストレージ操作 ---
  function _load() {
    if (_cache) return _cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _cache = JSON.parse(raw);
        return _cache;
      }
    } catch {}
    // 初回はデフォルトデータを保存
    _cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
    _save();
    return _cache;
  }

  function _save() {
    try {
      _cache.lastUpdated = getLocalDateString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
    } catch (e) {
      if (window.AppLogger) AppLogger.warn('旭川データ保存エラー: ' + e.message);
    }
  }

  function _invalidate() { _cache = null; }

  // --- 公開API ---

  /** 全データ取得 */
  function getAll() { return _load(); }

  /** カテゴリ別データ取得 */
  function getCategory(key) { return _load()[key] || null; }

  /** カテゴリ別データ更新（置換） */
  function setCategory(key, data) {
    const d = _load();
    d[key] = data;
    _save();
    return d[key];
  }

  /** 配列カテゴリにレコード追加 */
  function addRecord(category, record) {
    const d = _load();
    if (!Array.isArray(d[category])) return false;
    d[category].push(record);
    _save();
    return true;
  }

  /** 配列カテゴリのレコード更新（条件でマッチ） */
  function updateRecord(category, matchFn, updates) {
    const d = _load();
    if (!Array.isArray(d[category])) return false;
    let updated = false;
    d[category].forEach((r, i) => {
      if (matchFn(r)) {
        d[category][i] = { ...r, ...updates };
        updated = true;
      }
    });
    if (updated) _save();
    return updated;
  }

  /** 配列カテゴリのレコード削除（条件でマッチ） */
  function deleteRecord(category, matchFn) {
    const d = _load();
    if (!Array.isArray(d[category])) return false;
    const before = d[category].length;
    d[category] = d[category].filter(r => !matchFn(r));
    if (d[category].length !== before) { _save(); return true; }
    return false;
  }

  /** カスタムメモ追加 */
  function addNote(text) {
    const d = _load();
    d.customNotes.push({ id: Date.now(), text, createdAt: new Date().toISOString() });
    _save();
    return true;
  }

  /** カスタムメモ削除 */
  function deleteNote(id) {
    return deleteRecord('customNotes', r => r.id === id);
  }

  /** デフォルトデータにリセット */
  function resetToDefault() {
    _cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
    _save();
    return _cache;
  }

  /** JSON文字列でエクスポート */
  function exportJSON() {
    return JSON.stringify(_load(), null, 2);
  }

  /** JSON文字列からインポート（マージ） */
  function importJSON(jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      const d = _load();
      // 配列カテゴリはマージ（重複排除）
      ['annualVisitors', 'annualAccommodation', 'monthlyData', 'originBreakdown', 'seasonalBreakdown', 'foreignByCountry'].forEach(key => {
        if (Array.isArray(imported[key])) {
          const existing = d[key] || [];
          imported[key].forEach(r => {
            const dup = existing.find(e => e.fy === r.fy && (key === 'monthlyData' ? e.month === r.month : true) && (key === 'seasonalBreakdown' ? e.season === r.season : true));
            if (dup) Object.assign(dup, r);
            else existing.push(r);
          });
          d[key] = existing;
        }
      });
      if (imported.hotelInfo) d.hotelInfo = { ...d.hotelInfo, ...imported.hotelInfo };
      if (Array.isArray(imported.customNotes)) d.customNotes = [...d.customNotes, ...imported.customNotes];
      _save();
      return true;
    } catch (e) {
      if (window.AppLogger) AppLogger.warn('旭川データインポートエラー: ' + e.message);
      return false;
    }
  }

  // --- 分析ヘルパー ---

  /** 月別平均算出（コロナ除外オプション付き） */
  function getMonthlyAverage(excludeCovid) {
    const d = _load();
    const monthly = d.monthlyData || [];
    const covidYears = [2020, 2021]; // R2, R3のデータ（月のfy列に含まれうる年）
    const covidFiscalMonths = new Set();
    // R2(2020): 2020/4-2021/3, R3(2021): 2021/4-2022/3
    // monthlyDataの fy は年度の開始年、monthは暦月
    // fy=2020(R2) + fy=2021(R3) がコロナ期

    const byMonth = {};
    for (let m = 1; m <= 12; m++) byMonth[m] = { visitors: [], accommodation: [], foreign: [] };

    monthly.forEach(r => {
      // コロナ期の判定: fy=2020のR2データ（2020/4-2021/3）、fy=2021のR3データ
      // monthlyData内のfy+monthでR2/R3年度を判定
      const fiscalYear = r.month >= 4 ? r.fy : r.fy - 1; // 1-3月は前年度
      const isCovid = fiscalYear === 2020 || fiscalYear === 2021;
      if (excludeCovid && isCovid) return;

      byMonth[r.month].visitors.push(r.visitors);
      byMonth[r.month].accommodation.push(r.accommodation);
      byMonth[r.month].foreign.push(r.foreign);
    });

    const result = [];
    for (let m = 1; m <= 12; m++) {
      const v = byMonth[m];
      result.push({
        month: m,
        avgVisitors: v.visitors.length > 0 ? Math.round(v.visitors.reduce((a, b) => a + b, 0) / v.visitors.length * 10) / 10 : 0,
        avgAccommodation: v.accommodation.length > 0 ? Math.round(v.accommodation.reduce((a, b) => a + b, 0) / v.accommodation.length * 10) / 10 : 0,
        avgForeign: v.foreign.length > 0 ? Math.round(v.foreign.reduce((a, b) => a + b, 0) / v.foreign.length * 10) / 10 : 0,
        sampleCount: v.visitors.length,
      });
    }
    return result;
  }

  /** 年度別サマリ（コロナ込み/抜き比較） */
  function getAnnualComparison() {
    const d = _load();
    const annual = d.annualVisitors || [];
    const covidYears = [2021, 2022]; // R3, R4 (fy=2021, 2022が激減期)
    const all = annual.filter(a => a.total > 0);
    const exCovid = all.filter(a => !covidYears.includes(a.fy));

    const avg = (arr, key) => arr.length > 0 ? Math.round(arr.reduce((s, a) => s + a[key], 0) / arr.length * 10) / 10 : 0;

    return {
      allYearsAvg: avg(all, 'total'),
      exCovidAvg: avg(exCovid, 'total'),
      covidImpact: all.length > 0 && exCovid.length > 0 ? Math.round((1 - avg(all, 'total') / avg(exCovid, 'total')) * 1000) / 10 : 0,
      yearCount: all.length,
      exCovidYearCount: exCovid.length,
    };
  }

  return {
    getAll,
    getCategory,
    setCategory,
    addRecord,
    updateRecord,
    deleteRecord,
    addNote,
    deleteNote,
    resetToDefault,
    exportJSON,
    importJSON,
    getMonthlyAverage,
    getAnnualComparison,
  };
})();

})();
