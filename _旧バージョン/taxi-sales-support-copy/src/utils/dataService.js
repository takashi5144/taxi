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

    const header = 'ID,日時,金額,乗車地,降車地,メモ';
    const rows = entries.map(e => {
      const date = new Date(e.timestamp).toLocaleString('ja-JP');
      const pickup = (e.pickup || '').replace(/,/g, '、');
      const dropoff = (e.dropoff || '').replace(/,/g, '、');
      const memo = (e.memo || '').replace(/,/g, '、');
      return `${e.id},${date},${e.amount},${pickup},${dropoff},${memo}`;
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
    const entry = {
      id: Date.now(),
      amount: parseInt(form.amount),
      pickup: form.pickup || '',
      dropoff: form.dropoff || '',
      memo: form.memo || '',
      timestamp: new Date().toISOString(),
    };

    entries.unshift(entry);
    saveEntries(entries);
    AppLogger.info(`売上記録追加: ¥${entry.amount}`);
    return { success: true, entry };
  }

  function deleteEntry(id) {
    const entries = getEntries();
    const filtered = entries.filter(e => e.id !== id);
    saveEntries(filtered);
    AppLogger.info('売上記録を削除しました');
    return true;
  }

  function clearAllEntries() {
    saveEntries([]);
    AppLogger.info('全売上データを削除しました');
    return true;
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

    // CRUD
    addEntry,
    deleteEntry,
    clearAllEntries,
    validateEntry,

    // エクスポート
    exportCSV,
    downloadCSV,
  };
})();
