(function() {
// Calendar.jsx - カレンダーページ
// 日別売上表示と勤務/休日マーキング機能

window.CalendarPage = () => {
  const { useState, useEffect, useCallback, useMemo } = React;
  const createElement = React.createElement;

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [workStatus, setWorkStatus] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.WORK_STATUS) || '{}');
    } catch { return {}; }
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [shiftForm, setShiftForm] = useState({ startTime: '', endTime: '' });
  const [shiftSaved, setShiftSaved] = useState(false);
  const [shiftError, setShiftError] = useState('');

  // 日額目標金額を設定から取得
  const dailyGoal = useMemo(() => {
    try {
      const settings = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}');
      return Number(settings.dailyGoal) || 0;
    } catch { return 0; }
  }, [refreshKey]);

  // クラウドから勤務状態を同期（ページ表示時・タブ復帰時）
  useEffect(() => {
    // カレンダーページ表示時にクラウドから最新を取得（順序を制御して競合防止）
    let isCancelled = false;
    const syncAll = async () => {
      try {
        // 1. まず勤務状態を同期
        const result = await DataService.syncWorkStatusFromCloud();
        if (isCancelled) return;
        if (result && result.merged && result.data) {
          setWorkStatus(result.data);
        }
        // 2. その後シフト・休憩を同期
        const [sr, br, ds] = await Promise.all([
          DataService.syncShiftsFromCloud(),
          DataService.syncBreaksFromCloud(),
          DataService.syncDailySalesBidirectional
            ? DataService.syncDailySalesBidirectional()
            : Promise.resolve({ merged: 0 }),
        ]);
        if (isCancelled) return;
        if ((sr && sr.merged > 0) || (br && br.merged > 0) || (ds && ds.merged > 0)) {
          setRefreshKey(k => k + 1);
        }
      } catch (e) {
        if (window.AppLogger) AppLogger.warn('カレンダー同期エラー: ' + e.message);
      }
    };
    syncAll();

    // タブ復帰時にも再同期（最低30秒の間隔）
    let lastSyncTime = Date.now();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastSyncTime >= 30000) {
          lastSyncTime = now;
          syncAll();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('taxi-data-changed', handleDataChanged);
    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
    };
  }, []);

  // 勤務状態をlocalStorageに保存し、クラウドに自動同期
  const saveWorkStatus = useCallback((newStatus) => {
    setWorkStatus(newStatus);
    localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.WORK_STATUS, JSON.stringify(newStatus));
    // クラウドに自動同期（非同期、バックグラウンド）
    DataService.syncWorkStatusToCloud(newStatus);
  }, []);

  // 売上データを日別に集計（シフト基準: 日付またぎはシフト開始日に合算）
  const dailyRevenue = useMemo(() => {
    const entries = DataService.getEntries();
    const allShifts = (() => { try { return JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]'); } catch { return []; } })();

    // シフト開始日→終了時刻のマップを作成（日付またぎ判定用）
    // 各エントリのtimestampがどのシフトに属するかを判定し、シフト開始日に集計
    const shiftRanges = allShifts
      .filter(s => s.startTime)
      .map(s => ({
        startDate: getLocalDateString(new Date(s.startTime)),
        start: new Date(s.startTime),
        end: s.endTime ? new Date(s.endTime) : null,
      }))
      .sort((a, b) => a.start - b.start);

    // エントリの合算日を特定（shiftDateフィールド優先）
    function getShiftDate(entry) {
      // shiftDateが明示的に設定されていればそれを使う
      if (entry.shiftDate) return entry.shiftDate;
      // 従来のシフト範囲ロジック
      if (entry.timestamp) {
        const ts = new Date(entry.timestamp);
        for (let i = shiftRanges.length - 1; i >= 0; i--) {
          const sr = shiftRanges[i];
          if (ts >= sr.start && (sr.end === null || ts <= sr.end)) {
            return sr.startDate;
          }
        }
      }
      return entry.date;
    }

    const map = {};
    entries.forEach(e => {
      if (!e.date) return;
      // クーポン別エントリは除外
      if (e.paymentMethod === 'uncollected' && e.memo && e.memo.includes('クーポン未収')) return;
      // シフト開始日を基準に集計
      const assignDate = getShiftDate(e);
      if (!map[assignDate]) map[assignDate] = { total: 0, count: 0, passengers: 0 };
      // 遠距離割は売上から除外
      const longDistAmt = (() => {
        if (e.discounts && Array.isArray(e.discounts)) { const r = e.discounts.filter(d => d.type === 'longDistance'); if (r.length > 0) return r.reduce((s, d) => s + (d.amount || 0), 0); }
        if (e.discountType && e.discountType.includes('longDistance') && e.discountAmount) { const t = e.discountType.split(',').filter(t => t && t !== 'longDistance'); if (t.length === 0) return e.discountAmount; }
        return 0;
      })();
      map[assignDate].total += (e.amount || 0) + (e.discountAmount || 0) + (e.couponAmount || 0) - longDistAmt;
      map[assignDate].count += 1;
      map[assignDate].passengers += parseInt(e.passengers) || 0;
    });
    return map;
  }, [currentMonth, refreshKey]);

  // 日次合計売上（ホームで登録）
  const dailySalesMap = useMemo(() => {
    return DataService.getDailySalesMap ? DataService.getDailySalesMap() : {};
  }, [currentMonth, refreshKey]);

  // シフトデータ
  const shifts = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
    } catch { return []; }
  }, [currentMonth, refreshKey]);

  // 休憩データ
  const breaks = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
    } catch { return []; }
  }, [currentMonth, refreshKey]);

  // 時刻変換ヘルパー
  const isoToLocalDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const isoToTimeStr = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };
  // 選択日の始業・終業フォームを既存シフトから復元
  useEffect(() => {
    setShiftSaved(false);
    setShiftError('');
    if (!selectedDate) {
      setShiftForm({ startTime: '', endTime: '' });
      return;
    }
    try {
      const allShifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const s = allShifts.find(x => x.startTime && isoToLocalDate(x.startTime) === selectedDate);
      if (s) {
        setShiftForm({
          startTime: isoToTimeStr(s.startTime),
          endTime: s.endTime ? isoToTimeStr(s.endTime) : '',
        });
      } else {
        setShiftForm({ startTime: '', endTime: '' });
      }
    } catch {
      setShiftForm({ startTime: '', endTime: '' });
    }
  }, [selectedDate, refreshKey]);

  const saveDayShift = useCallback(() => {
    setShiftError('');
    if (!selectedDate) return;
    if (!shiftForm.startTime) {
      setShiftError('始業時間を入力してください');
      return;
    }
    try {
      const allShifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const startLocal = new Date(`${selectedDate}T${shiftForm.startTime}:00`);
      const startIso = startLocal.toISOString();
      let endIso = null;
      if (shiftForm.endTime) {
        const endLocal = new Date(`${selectedDate}T${shiftForm.endTime}:00`);
        if (endLocal <= startLocal) endLocal.setDate(endLocal.getDate() + 1);
        endIso = endLocal.toISOString();
      }
      const idx = allShifts.findIndex(x => x.startTime && isoToLocalDate(x.startTime) === selectedDate);
      if (idx !== -1) {
        allShifts[idx].startTime = startIso;
        allShifts[idx].endTime = endIso;
      } else {
        allShifts.push({ id: Date.now().toString(), startTime: startIso, endTime: endIso });
      }
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(allShifts));
      DataService.syncShiftsToCloud();
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      setRefreshKey(k => k + 1);
      setShiftSaved(true);
      setTimeout(() => setShiftSaved(false), 2000);
      if (window.AppLogger) {
        AppLogger.info(`シフト保存: ${selectedDate} ${shiftForm.startTime}〜${shiftForm.endTime || '勤務中'}`);
      }
    } catch (e) {
      setShiftError('保存に失敗しました');
      if (window.AppLogger) AppLogger.error('シフト保存失敗', e.message);
    }
  }, [selectedDate, shiftForm]);

  const deleteDayShift = useCallback(() => {
    if (!selectedDate) return;
    if (!confirm(`${selectedDate} の始業・終業を削除しますか？`)) return;
    try {
      const allShifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const idx = allShifts.findIndex(x => x.startTime && isoToLocalDate(x.startTime) === selectedDate);
      if (idx === -1) return;
      allShifts.splice(idx, 1);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(allShifts));
      DataService.syncShiftsToCloud();
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      setShiftForm({ startTime: '', endTime: '' });
      setRefreshKey(k => k + 1);
      if (window.AppLogger) AppLogger.info(`シフト削除: ${selectedDate}`);
    } catch (e) {
      if (window.AppLogger) AppLogger.error('シフト削除失敗', e.message);
    }
  }, [selectedDate]);

  // カレンダーグリッド生成
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=日
    const daysInMonth = lastDay.getDate();

    const days = [];
    // 前月の空セル
    for (let i = 0; i < startDow; i++) days.push(null);
    // 当月の日
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = JapaneseHolidays.getDateInfo(dateStr);
      const rev = dailyRevenue[dateStr];
      const dayTotalSale = dailySalesMap[dateStr];
      // 日次合計があればそれを優先表示、なければ個別売上の合計
      const displayRevenue = (dayTotalSale != null && dayTotalSale > 0)
        ? dayTotalSale
        : (rev ? rev.total : 0);
      // 勤務時間・休憩時間計算
      const dayShifts = shifts.filter(s => s.startTime && isoToLocalDate(s.startTime) === dateStr);
      const dayBreaks = breaks.filter(b => b.startTime && isoToLocalDate(b.startTime) === dateStr);
      const shiftMin = dayShifts.reduce((sum, s) => {
        if (!s.startTime || !s.endTime) return sum;
        return sum + Math.max(0, (new Date(s.endTime) - new Date(s.startTime)) / 60000);
      }, 0);
      const breakMin = dayBreaks.reduce((sum, b) => {
        if (!b.startTime || !b.endTime) return sum;
        return sum + Math.max(0, (new Date(b.endTime) - new Date(b.startTime)) / 60000);
      }, 0);
      days.push({
        day: d,
        dateStr,
        dayOfWeek: info.dayOfWeek,
        holiday: info.holiday,
        isHoliday: info.isHoliday,
        isSunday: info.isSunday,
        isSaturday: info.isSaturday,
        revenue: displayRevenue,
        dailySale: dayTotalSale != null ? dayTotalSale : null,
        count: rev ? rev.count : 0,
        passengers: rev ? rev.passengers : 0,
        status: workStatus[dateStr] || null,
        workMin: Math.round(shiftMin),
        breakMin: Math.round(breakMin),
      });
    }
    return days;
  }, [currentMonth, dailyRevenue, dailySalesMap, workStatus, shifts, breaks]);

  // 今日の日付文字列
  const todayStr = useMemo(() => getLocalDateString(), []);

  // 月間サマリー（休日でない過去日＝勤務日）
  const monthlySummary = useMemo(() => {
    let workDays = 0, offDays = 0, offCancelDays = 0, holidayWorkDays = 0, totalRevenue = 0, workDayRevenue = 0;
    let futureWorkDays = 0, futureOffDays = 0, totalDaysWithRevenue = 0, allDayRevenue = 0;
    let totalWorkMin = 0, daysWithShift = 0;
    calendarDays.forEach(d => {
      if (!d) return;
      if (d.workMin > 0) {
        totalWorkMin += d.workMin;
        daysWithShift += 1;
      }
      const isPastOrToday = d.dateStr <= todayStr;
      if (d.status === 'off') {
        if (isPastOrToday) offDays++;
        else futureOffDays++;
      } else if (d.status === 'off_cancel') {
        if (isPastOrToday) { offCancelDays++; workDays++; workDayRevenue += d.revenue; }
        else futureWorkDays++;
      } else if (d.status === 'holiday_work') {
        if (isPastOrToday) { holidayWorkDays++; workDays++; workDayRevenue += d.revenue; }
        else futureWorkDays++;
      } else if (isPastOrToday) {
        workDays++;
        workDayRevenue += d.revenue;
      } else {
        futureWorkDays++;
      }
      totalRevenue += d.revenue;
      if (d.revenue > 0) {
        totalDaysWithRevenue++;
        allDayRevenue += d.revenue;
      }
    });
    return {
      workDays,
      offDays,
      offCancelDays,
      holidayWorkDays,
      totalRevenue,
      avgDaily: workDays > 0 ? Math.round(workDayRevenue / workDays) : 0,
      remainingWorkDays: futureWorkDays,
      remainingOffDays: futureOffDays,
      totalDaysInMonth: calendarDays.filter(d => d !== null).length,
      avgAllDays: totalDaysWithRevenue > 0 ? Math.round(allDayRevenue / totalDaysWithRevenue) : 0,
      totalWorkMin,
      daysWithShift,
    };
  }, [calendarDays, todayStr]);

  // 年間売上合計: 日次売上記録のみ。期間は 12/1〜翌年11/30
  const yearlySummary = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth(); // 0=1月 ... 11=12月
    const startYear = m === 11 ? y : y - 1;
    const start = `${startYear}-12-01`;
    const end = `${startYear + 1}-11-30`;
    let total = 0;
    let daysWithRevenue = 0;
    Object.keys(dailySalesMap || {}).forEach((dateStr) => {
      if (!dateStr || dateStr < start || dateStr > end) return;
      const amt = Number(dailySalesMap[dateStr]) || 0;
      if (amt > 0) {
        total += amt;
        daysWithRevenue += 1;
      }
    });
    return {
      year: startYear,
      start,
      end,
      label: `${startYear}年12月〜${startYear + 1}年11月`,
      totalRevenue: total,
      daysWithRevenue,
    };
  }, [currentMonth, dailySalesMap]);

  // 選択日の詳細
  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    const day = calendarDays.find(d => d && d.dateStr === selectedDate);
    if (!day) return null;
    const dayShifts = shifts.filter(s => s.startTime && isoToLocalDate(s.startTime) === selectedDate);
    return { ...day, shifts: dayShifts };
  }, [selectedDate, calendarDays, shifts]);

  // 月切替
  const goMonth = useCallback((delta) => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setSelectedDate(null);
  }, []);

  const goToday = useCallback(() => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(todayStr);
  }, [todayStr]);

  // 勤務ステータス切替（off=休日 / off_cancel=休日キャンセル / holiday_work=休日出勤 / 未設定=通常勤務）
  const setWorkStatusValue = useCallback((dateStr, value) => {
    const newStatus = { ...workStatus };
    if (!value || value === '') {
      delete newStatus[dateStr];
    } else {
      newStatus[dateStr] = value;
    }
    saveWorkStatus(newStatus);
  }, [workStatus, saveWorkStatus]);

  // 日付セルの売上（実額。万・千の省略なし）
  const formatAmount = (n) => {
    if (!n) return '';
    return Math.round(n).toLocaleString('ja-JP');
  };

  const formatMin = (min) => {
    const h = Math.floor(Math.max(0, min) / 60);
    const m = Math.max(0, min) % 60;
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  };

  const yearMonth = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  const dowLabels = ['日', '月', '火', '水', '木', '金', '土'];

  return createElement('div', null,
    // ページタイトル
    createElement('h1', { className: 'page-title' },
      createElement('span', { className: 'material-icons-round' }, 'calendar_month'),
      'カレンダー'
    ),

    // 年間売上合計
    createElement('div', {
      style: {
        background: 'linear-gradient(135deg, rgba(26,115,232,0.18), rgba(255,167,38,0.12))',
        borderRadius: 'var(--border-radius)',
        padding: '14px 16px',
        marginBottom: 'var(--space-md)',
        border: '1px solid rgba(26,115,232,0.35)',
      }
    },
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }
      },
        createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 22, color: 'var(--color-primary-light)' } }, 'calendar_today'),
          createElement('div', null,
            createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, `${yearlySummary.label} 年間売上合計`),
            createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } },
              yearlySummary.daysWithRevenue > 0 ? `${yearlySummary.daysWithRevenue}日分` : 'まだデータがありません'
            )
          )
        ),
        createElement('div', { style: { textAlign: 'right' } },
          createElement('div', {
            style: { fontWeight: 800, fontSize: '24px', color: 'var(--color-secondary)', lineHeight: 1.2 }
          }, `¥${Math.round(yearlySummary.totalRevenue).toLocaleString()}`),
          createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } },
            `税抜 ¥${Math.round(yearlySummary.totalRevenue / 1.1).toLocaleString()}`
          )
        )
      ),
      createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '10px', padding: '8px 10px', borderRadius: '8px',
          background: 'rgba(255, 167, 38, 0.12)',
        }
      },
        createElement('span', { style: { fontSize: '13px', color: '#ffa726', fontWeight: 600 } }, '給料（税抜の50%）'),
        createElement('span', {
          style: { fontWeight: 800, fontSize: '20px', color: '#ffa726' }
        }, `¥${Math.round(yearlySummary.totalRevenue / 1.1 * 0.5).toLocaleString()}`)
      )
    ),

    // 今月の売上総額・税抜き・給料予想額
    createElement('div', {
      style: {
        background: 'var(--surface-color)',
        borderRadius: 'var(--border-radius)',
        padding: 'var(--space-sm) var(--space-md)',
        marginBottom: 'var(--space-md)',
        border: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column', gap: '6px',
      }
    },
      // 今月の売上合計
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
      },
        createElement('span', {
          style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }
        }, `${currentMonth.getMonth() + 1}月 売上合計`),
        createElement('span', {
          style: { fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--text-primary)' }
        }, `¥${Math.round(monthlySummary.totalRevenue).toLocaleString()}`)
      ),
      // 税抜き金額
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
      },
        createElement('span', {
          style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }
        }, '税抜き金額'),
        createElement('span', {
          style: { fontWeight: 600, fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)' }
        }, `¥${Math.round(monthlySummary.totalRevenue / 1.1).toLocaleString()}`)
      ),
      // 区切り線
      createElement('div', { style: { borderTop: '1px solid var(--border-color)' } }),
      // 給料予想額
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 167, 38, 0.08)', margin: '0 -16px', padding: '6px 16px', borderRadius: '6px' }
      },
        createElement('span', {
          style: { fontSize: 'var(--font-size-sm)', color: '#ffa726', fontWeight: 600 }
        }, '💰 給料予想額'),
        createElement('span', {
          style: { fontWeight: 700, fontSize: 'var(--font-size-xl)', color: '#ffa726' }
        }, `¥${Math.round(monthlySummary.totalRevenue / 1.1 * 0.5).toLocaleString()}`)
      ),
      // 月額売上目標・月額給料目標
      dailyGoal > 0 && createElement(React.Fragment, null,
        createElement('div', { style: { borderTop: '1px solid var(--border-color)' } }),
        createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
        },
          createElement('span', {
            style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }
          }, `月額売上目標（¥${dailyGoal.toLocaleString()} × ${monthlySummary.workDays + monthlySummary.remainingWorkDays}日）`),
          createElement('span', {
            style: { fontWeight: 700, fontSize: 'var(--font-size-lg)', color: '#4fc3f7' }
          }, `¥${(dailyGoal * (monthlySummary.workDays + monthlySummary.remainingWorkDays)).toLocaleString()}`)
        ),
        createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
        },
          createElement('span', {
            style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }
          }, '月額給料目標（売上の50%）'),
          createElement('span', {
            style: { fontWeight: 700, fontSize: 'var(--font-size-lg)', color: '#81c784' }
          }, `¥${Math.round(dailyGoal * (monthlySummary.workDays + monthlySummary.remainingWorkDays) * 0.5).toLocaleString()}`)
        )
      ),
      createElement('div', { style: { borderTop: '1px solid var(--border-color)' } }),
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
      },
        createElement('span', {
          style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }
        }, `勤務時間合計（始業〜終業${monthlySummary.daysWithShift ? '・' + monthlySummary.daysWithShift + '日' : ''}）`),
        createElement('span', {
          style: { fontWeight: 700, fontSize: 'var(--font-size-lg)', color: '#80cbc4' }
        }, monthlySummary.totalWorkMin > 0
          ? (() => {
              const h = Math.floor(monthlySummary.totalWorkMin / 60);
              const m = monthlySummary.totalWorkMin % 60;
              return m > 0 ? `${h}時間${m}分` : `${h}時間`;
            })()
          : '−')
      )
    ),

    // 残り勤務日数・1日平均売上
    createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px',
        marginBottom: 'var(--space-md)',
      }
    },
      createElement('div', {
        style: {
          background: 'var(--surface-color)', borderRadius: 'var(--border-radius)',
          padding: '10px 8px', textAlign: 'center', border: '1px solid var(--border-color)',
        }
      },
        createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' } }, '残り勤務日'),
        createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary-light)' } },
          `${monthlySummary.remainingWorkDays}日`
        ),
        createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } },
          `残り休日 ${monthlySummary.remainingOffDays}日`
        )
      ),
      createElement('div', {
        style: {
          background: 'var(--surface-color)', borderRadius: 'var(--border-radius)',
          padding: '10px 8px', textAlign: 'center', border: '1px solid var(--border-color)',
        }
      },
        createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' } }, '1日平均売上'),
        createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-accent)' } },
          monthlySummary.avgAllDays > 0 ? `¥${monthlySummary.avgAllDays.toLocaleString()}` : '−'
        ),
        monthlySummary.avgAllDays > 0 && createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' } },
          `税抜 ¥${Math.round(monthlySummary.avgAllDays / 1.1).toLocaleString()}`
        )
      ),
      createElement('div', {
        style: {
          background: 'var(--surface-color)', borderRadius: 'var(--border-radius)',
          padding: '10px 8px', textAlign: 'center', border: '1px solid var(--border-color)',
        }
      },
        createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' } }, '勤務/休日'),
        createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 } },
          `${monthlySummary.workDays}/${monthlySummary.offDays}`
        ),
        createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } },
          `全${monthlySummary.totalDaysInMonth}日中`
        )
      )
    ),

    // 月ナビゲーション
    createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)', gap: 'var(--space-sm)' }
    },
      createElement('button', {
        className: 'btn btn--secondary',
        onClick: () => goMonth(-1),
        style: { minWidth: 40, padding: '6px 10px' }
      }, createElement('span', { className: 'material-icons-round', style: { fontSize: 20 } }, 'chevron_left')),
      createElement('span', {
        style: { fontWeight: 700, fontSize: 'var(--font-size-lg)' }
      }, yearMonth),
      createElement('button', {
        className: 'btn btn--secondary',
        onClick: () => goMonth(1),
        style: { minWidth: 40, padding: '6px 10px' }
      }, createElement('span', { className: 'material-icons-round', style: { fontSize: 20 } }, 'chevron_right')),
      createElement('button', {
        className: 'btn btn--secondary',
        onClick: goToday,
        style: { padding: '6px 12px', fontSize: 'var(--font-size-sm)' }
      }, '今月')
    ),

    // カレンダーグリッド
    createElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        background: 'var(--border-color)',
        borderRadius: 'var(--border-radius)',
        overflow: 'hidden',
        marginBottom: 'var(--space-lg)',
      }
    },
      // 曜日ヘッダー
      ...dowLabels.map((dow, i) =>
        createElement('div', {
          key: 'h' + i,
          style: {
            background: 'var(--bg-card)',
            padding: '6px 2px',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: 'var(--font-size-sm)',
            color: i === 0 ? 'var(--color-error)' : i === 6 ? 'var(--color-info)' : 'var(--text-primary)',
          }
        }, dow)
      ),
      // 日セル
      ...calendarDays.map((d, i) => {
        if (!d) {
          return createElement('div', {
            key: 'e' + i,
            style: { background: 'var(--bg-card)', padding: 4 }
          });
        }
        const isToday = d.dateStr === todayStr;
        const isSelected = d.dateStr === selectedDate;
        return createElement('div', {
          key: d.dateStr,
          role: 'button',
          tabIndex: 0,
          'aria-label': d.dateStr
            + (d.revenue > 0 ? ' 売上' + d.revenue + '円' : '')
            + (d.workMin > 0 ? ' 勤務' + formatMin(d.workMin) : ''),
          onClick: () => {
            const next = d.dateStr === selectedDate ? null : d.dateStr;
            setSelectedDate(next);
            if (next) {
              setTimeout(() => {
                const el = document.getElementById('cal-day-detail');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }, 50);
            }
          },
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const next = d.dateStr === selectedDate ? null : d.dateStr;
              setSelectedDate(next);
            }
          },
          style: {
            background: isSelected ? 'rgba(33,150,243,0.15)' : isToday ? 'rgba(0,200,83,0.08)' : 'var(--bg-card)',
            padding: '4px 2px',
            minHeight: 68,
            cursor: 'pointer',
            position: 'relative',
            borderLeft: isToday ? '3px solid var(--color-accent)' : 'none',
          }
        },
          // 日付
          createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              fontWeight: isToday ? 700 : 400,
              color: d.isHoliday || d.isSunday ? 'var(--color-error)' : d.isSaturday ? 'var(--color-info)' : 'var(--text-primary)',
              marginBottom: 1,
              textAlign: 'center',
            }
          }, d.day),
          // 売上金額
          d.revenue > 0 && createElement('div', {
            style: {
              fontSize: 9,
              color: d.dailySale != null ? 'var(--color-secondary)' : 'var(--color-accent)',
              textAlign: 'center',
              fontWeight: 700,
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              letterSpacing: '-0.3px',
            }
          }, formatAmount(d.revenue)),
          // 乗客人数
          d.passengers > 0 && createElement('div', {
            style: {
              fontSize: 8,
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.1,
            }
          }, `${d.count}件${d.passengers}人`),
          // 勤務時間（始業〜終業）
          d.workMin > 0 && createElement('div', {
            style: {
              fontSize: 10, color: '#80cbc4', textAlign: 'center',
              fontWeight: 700, lineHeight: 1.2, marginTop: 1,
            }
          }, formatMin(d.workMin)),
          // ステータスマーク（休日=橙 / 休日キャンセル=赤 / 休日出勤=青）
          (d.status === 'off' || d.status === 'off_cancel' || d.status === 'holiday_work') && createElement('div', {
            style: {
              width: 8, height: 8,
              borderRadius: '50%',
              background: d.status === 'off' ? 'var(--color-warning)' : d.status === 'off_cancel' ? '#ef5350' : '#42a5f5',
              margin: '2px auto 0',
            }
          })
        );
      })
    ),

    // 選択日の詳細パネル
    selectedDayData && createElement('div', {
      id: 'cal-day-detail',
      className: 'card',
      style: { marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' }
    },
      createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }
      },
        createElement('div', null,
          createElement('strong', { style: { fontSize: 'var(--font-size-lg)' } },
            `${selectedDayData.day}日（${selectedDayData.dayOfWeek}）`
          ),
          selectedDayData.holiday && createElement('span', {
            style: { marginLeft: 'var(--space-sm)', color: 'var(--color-error)', fontSize: 'var(--font-size-sm)' }
          }, selectedDayData.holiday)
        )
      ),

      // 勤務ステータスボタン（休日 / 休日キャンセル / 休日出勤）
      createElement('div', {
        style: { display: 'flex', gap: '6px', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }
      },
        // 休日
        createElement('button', {
          onClick: () => setWorkStatusValue(selectedDate, selectedDayData.status === 'off' ? '' : 'off'),
          style: {
            flex: 1, padding: '8px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, minWidth: '80px',
            background: selectedDayData.status === 'off' ? '#ffa726' : 'rgba(255,255,255,0.08)',
            color: selectedDayData.status === 'off' ? '#fff' : 'var(--text-muted)',
          }
        },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 14, marginRight: 4, verticalAlign: 'middle' } }, 'weekend'),
          '休日'
        ),
        // 休日キャンセル
        createElement('button', {
          onClick: () => setWorkStatusValue(selectedDate, selectedDayData.status === 'off_cancel' ? '' : 'off_cancel'),
          style: {
            flex: 1, padding: '8px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, minWidth: '80px',
            background: selectedDayData.status === 'off_cancel' ? '#ef5350' : 'rgba(255,255,255,0.08)',
            color: selectedDayData.status === 'off_cancel' ? '#fff' : 'var(--text-muted)',
          }
        },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 14, marginRight: 4, verticalAlign: 'middle' } }, 'event_busy'),
          '休日キャンセル'
        ),
        // 休日出勤
        createElement('button', {
          onClick: () => setWorkStatusValue(selectedDate, selectedDayData.status === 'holiday_work' ? '' : 'holiday_work'),
          style: {
            flex: 1, padding: '8px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, minWidth: '80px',
            background: selectedDayData.status === 'holiday_work' ? '#42a5f5' : 'rgba(255,255,255,0.08)',
            color: selectedDayData.status === 'holiday_work' ? '#fff' : 'var(--text-muted)',
          }
        },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 14, marginRight: 4, verticalAlign: 'middle' } }, 'work' ),
          '休日出勤'
        )
      ),

      // 始業・終業の入力（日付クリックで常に表示）
      createElement('div', {
        style: {
          borderTop: '1px solid var(--border-color)',
          paddingTop: 'var(--space-sm)',
          marginBottom: 0,
        }
      },
        createElement('div', {
          style: {
            fontSize: '13px', fontWeight: 700, marginBottom: '8px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }
        },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 18, color: 'var(--color-accent)' } }, 'schedule'),
          '始業・終業'
        ),
        shiftError && createElement('div', {
          style: {
            background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.3)',
            borderRadius: '8px', padding: '8px 12px', marginBottom: '8px',
            color: 'var(--color-danger)', fontSize: '12px',
          }
        }, shiftError),
        shiftSaved && createElement('div', {
          style: {
            background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.3)',
            borderRadius: '8px', padding: '8px 12px', marginBottom: '8px',
            color: 'var(--color-accent)', fontSize: '12px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }
        },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 16 } }, 'check_circle'),
          '保存しました'
        ),
        createElement('div', { className: 'grid grid--2' },
          createElement('div', { className: 'form-group' },
            createElement('label', { className: 'form-label' }, '始業'),
            createElement('input', {
              className: 'form-input',
              type: 'time',
              value: shiftForm.startTime,
              onChange: (e) => {
                setShiftForm({ ...shiftForm, startTime: e.target.value });
                setShiftSaved(false);
                setShiftError('');
              },
              style: { colorScheme: 'dark' },
            })
          ),
          createElement('div', { className: 'form-group' },
            createElement('label', { className: 'form-label' }, '終業'),
            createElement('input', {
              className: 'form-input',
              type: 'time',
              value: shiftForm.endTime,
              onChange: (e) => {
                setShiftForm({ ...shiftForm, endTime: e.target.value });
                setShiftSaved(false);
                setShiftError('');
              },
              style: { colorScheme: 'dark' },
            })
          )
        ),
        shiftForm.startTime && shiftForm.endTime && shiftForm.endTime <= shiftForm.startTime && createElement('div', {
          style: { fontSize: '11px', color: 'var(--color-warning)', marginBottom: '8px' }
        }, '終業が始業より早いため、翌日の終業として保存します'),
        createElement('div', { style: { display: 'flex', gap: '8px' } },
          createElement('button', {
            type: 'button',
            onClick: saveDayShift,
            style: {
              flex: 1, padding: '10px 12px', borderRadius: '8px', border: 'none',
              background: 'var(--color-accent)', color: '#fff', cursor: 'pointer',
              fontWeight: 700, fontSize: '14px',
            }
          }, '保存'),
          selectedDayData.shifts.length > 0 && createElement('button', {
            type: 'button',
            onClick: deleteDayShift,
            style: {
              padding: '10px 12px', borderRadius: '8px',
              border: '1px solid rgba(229,57,53,0.4)',
              background: 'rgba(229,57,53,0.12)', color: 'var(--color-danger)',
              cursor: 'pointer', fontWeight: 600, fontSize: '14px',
            }
          }, '削除')
        )
      ),


    ),
    // 月間サマリーカード
    createElement('div', {
      className: 'card',
      style: { padding: 'var(--space-md)' }
    },
      createElement('div', {
        style: { fontWeight: 700, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }
      },
        createElement('span', { className: 'material-icons-round', style: { fontSize: 18, color: 'var(--color-secondary)' } }, 'summarize'),
        `${yearMonth} サマリー`
      ),
      createElement('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)' }
      },
        createElement('div', null,
          createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '勤務日数'),
          createElement('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 700 } }, `${monthlySummary.workDays}日`)
        ),
        createElement('div', null,
          createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '休日数'),
          createElement('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 700 } }, `${monthlySummary.offDays}日`),
          (monthlySummary.offCancelDays > 0 || monthlySummary.holidayWorkDays > 0) && createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } },
            monthlySummary.offCancelDays > 0 ? `キャンセル${monthlySummary.offCancelDays}日 ` : '',
            monthlySummary.holidayWorkDays > 0 ? `休日出勤${monthlySummary.holidayWorkDays}日` : ''
          )
        ),
        createElement('div', null,
          createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '月間売上合計'),
          createElement('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-accent)' } },
            monthlySummary.totalRevenue > 0 ? `${monthlySummary.totalRevenue.toLocaleString()}円` : '−'
          )
        ),
        createElement('div', null,
          createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '勤務日平均日収'),
          createElement('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 700 } },
            monthlySummary.avgDaily > 0 ? `${monthlySummary.avgDaily.toLocaleString()}円` : '−'
          )
        ),
        createElement('div', { style: { gridColumn: '1 / -1' } },
          createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, `${yearlySummary.label} 年間売上合計`),
          createElement('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-secondary)' } },
            yearlySummary.totalRevenue > 0 ? `${yearlySummary.totalRevenue.toLocaleString()}円` : '−'
          ),
          createElement('div', { style: { fontSize: '13px', color: '#ffa726', fontWeight: 700, marginTop: '4px' } },
            yearlySummary.totalRevenue > 0
              ? `給料（税抜の50%） ¥${Math.round(yearlySummary.totalRevenue / 1.1 * 0.5).toLocaleString()}`
              : '給料 −'
          )
        )
      )
    )
  );
};

})();
