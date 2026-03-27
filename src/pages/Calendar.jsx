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
  const [editingItem, setEditingItem] = useState(null); // { type: 'shift'|'break', id, startTime, endTime }
  const [expandedCalPay, setExpandedCalPay] = useState(null); // 支払方法カード展開

  // 日額目標金額を設定から取得
  const dailyGoal = useMemo(() => {
    try {
      const settings = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}');
      return Number(settings.dailyGoal) || 0;
    } catch { return 0; }
  }, [refreshKey]);

  // クラウドから勤務状態を同期（ページ表示時・タブ復帰時）
  useEffect(() => {
    const secret = (localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET) || '').trim();
    if (!secret) return;

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
        const [sr, br] = await Promise.all([
          DataService.syncShiftsFromCloud(),
          DataService.syncBreaksFromCloud(),
        ]);
        if (isCancelled) return;
        if ((sr && sr.merged > 0) || (br && br.merged > 0)) {
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
    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // 勤務状態をlocalStorageに保存し、クラウドに自動同期
  const saveWorkStatus = useCallback((newStatus) => {
    setWorkStatus(newStatus);
    localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.WORK_STATUS, JSON.stringify(newStatus));
    // クラウドに自動同期（非同期、バックグラウンド）
    DataService.syncWorkStatusToCloud(newStatus);
  }, []);

  // 売上データを日別に集計
  const dailyRevenue = useMemo(() => {
    const entries = DataService.getEntries();
    const map = {};
    entries.forEach(e => {
      if (!e.date) return;
      if (!map[e.date]) map[e.date] = { total: 0, count: 0 };
      // クーポン別エントリは除外（couponAmountで加算するため二重計上防止）
      if (e.paymentMethod === 'uncollected' && e.memo && e.memo.includes('クーポン未収')) return;
      // 遠距離割は売上から除外（実際に受け取れない金額のため）
      const longDistAmt = (() => {
        if (e.discounts && Array.isArray(e.discounts)) { const r = e.discounts.filter(d => d.type === 'longDistance'); if (r.length > 0) return r.reduce((s, d) => s + (d.amount || 0), 0); }
        if (e.discountType && e.discountType.includes('longDistance') && e.discountAmount) { const t = e.discountType.split(',').filter(t => t && t !== 'longDistance'); if (t.length === 0) return e.discountAmount; }
        return 0;
      })();
      map[e.date].total += (e.amount || 0) + (e.discountAmount || 0) + (e.couponAmount || 0) - longDistAmt;
      map[e.date].count += 1;
    });
    return map;
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
  const timeStrToIso = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    return new Date(`${dateStr}T${timeStr}:00`).toISOString();
  };

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
        revenue: rev ? rev.total : 0,
        count: rev ? rev.count : 0,
        status: workStatus[dateStr] || null,
        workMin: Math.round(shiftMin),
        breakMin: Math.round(breakMin),
      });
    }
    return days;
  }, [currentMonth, dailyRevenue, workStatus, shifts, breaks]);

  // 今日の日付文字列
  const todayStr = useMemo(() => getLocalDateString(), []);

  // 月間サマリー（休日でない過去日＝勤務日）
  const monthlySummary = useMemo(() => {
    let workDays = 0, offDays = 0, totalRevenue = 0, workDayRevenue = 0;
    let futureWorkDays = 0, futureOffDays = 0, totalDaysWithRevenue = 0, allDayRevenue = 0;
    calendarDays.forEach(d => {
      if (!d) return;
      const isPastOrToday = d.dateStr <= todayStr;
      if (d.status === 'off') {
        if (isPastOrToday) offDays++;
        else futureOffDays++;
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
      totalRevenue,
      avgDaily: workDays > 0 ? Math.round(workDayRevenue / workDays) : 0,
      remainingWorkDays: futureWorkDays,
      remainingOffDays: futureOffDays,
      totalDaysInMonth: calendarDays.filter(d => d !== null).length,
      avgAllDays: totalDaysWithRevenue > 0 ? Math.round(allDayRevenue / totalDaysWithRevenue) : 0,
    };
  }, [calendarDays, todayStr]);

  // 選択日の詳細
  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    const day = calendarDays.find(d => d && d.dateStr === selectedDate);
    if (!day) return null;

    // シフト情報
    const dayShifts = shifts.filter(s => {
      if (!s.startTime) return false;
      return isoToLocalDate(s.startTime) === selectedDate;
    });

    // 休憩情報
    const dayBreaks = breaks.filter(b => {
      if (!b.startTime) return false;
      return isoToLocalDate(b.startTime) === selectedDate;
    });

    // 売上エントリ
    const dayEntries = window.DataService ? DataService.getEntries().filter(e => e.date === selectedDate) : [];
    dayEntries.sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''));

    return { ...day, shifts: dayShifts, breaks: dayBreaks, entries: dayEntries };
  }, [selectedDate, calendarDays, shifts, breaks, refreshKey]);

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

  // 休日切替（休日でなければ勤務扱い）
  const toggleWorkStatus = useCallback((dateStr) => {
    const newStatus = { ...workStatus };
    if (newStatus[dateStr] === 'off') {
      delete newStatus[dateStr];
    } else {
      newStatus[dateStr] = 'off';
    }
    saveWorkStatus(newStatus);
  }, [workStatus, saveWorkStatus]);

  // 金額短縮表示
  const shortAmount = (n) => {
    if (n === 0) return '';
    if (n >= 10000) return `${Math.floor(n / 10000)}万`;
    if (n >= 1000) return `${Math.floor(n / 1000)}千`;
    return `${n}`;
  };

  const yearMonth = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  const dowLabels = ['日', '月', '火', '水', '木', '金', '土'];

  return createElement('div', null,
    // ページタイトル
    createElement('h1', { className: 'page-title' },
      createElement('span', { className: 'material-icons-round' }, 'calendar_month'),
      'カレンダー'
    ),

    // 売上総額・税抜き・給料予想額
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
      // 売上総額
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
      },
        createElement('span', {
          style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }
        }, '売上総額'),
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
          'aria-label': d.dateStr + (d.revenue > 0 ? ' 売上' + d.revenue + '円' : ''),
          onClick: () => setSelectedDate(d.dateStr === selectedDate ? null : d.dateStr),
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDate(d.dateStr === selectedDate ? null : d.dateStr); } },
          style: {
            background: isSelected ? 'rgba(33,150,243,0.15)' : isToday ? 'rgba(0,200,83,0.08)' : 'var(--bg-card)',
            padding: '4px 2px',
            minHeight: 62,
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
              fontSize: 10,
              color: 'var(--color-accent)',
              textAlign: 'center',
              fontWeight: 600,
              lineHeight: 1.2,
            }
          }, shortAmount(d.revenue)),
          // 勤務時間（実働）
          (d.workMin - d.breakMin) > 0 && createElement('div', {
            style: {
              fontSize: 8,
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.1,
              opacity: 0.8,
            }
          }, (() => {
            const net = d.workMin - d.breakMin;
            const h = Math.floor(net / 60);
            const m = net % 60;
            return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`;
          })()),
          // 休日マーク（休日のみ橙ドット表示）
          d.status === 'off' && createElement('div', {
            style: {
              width: 8, height: 8,
              borderRadius: '50%',
              background: 'var(--color-warning)',
              margin: '2px auto 0',
            }
          })
        );
      })
    ),

    // 選択日の詳細パネル
    selectedDayData && createElement('div', {
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

      // 休日トグルボタン
      createElement('div', {
        style: { display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }
      },
        createElement('button', {
          className: 'btn btn--secondary',
          onClick: () => toggleWorkStatus(selectedDate),
          style: Object.assign({ flex: 1, padding: '8px 12px' },
            selectedDayData.status === 'off' ? { background: 'var(--color-warning)', borderColor: 'var(--color-warning)', color: '#fff' } : {}
          )
        },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 16, marginRight: 4 } }, 'weekend'),
          selectedDayData.status === 'off' ? '休日' : '休日にする'
        )
      ),

      // 売上合計セクション（ダッシュボードと同じ項目）
      (() => {
        const dayEntries = selectedDayData.entries || [];
        const _isCpnSub = (e) => e.paymentMethod === 'uncollected' && e.memo && e.memo.includes('クーポン未収');
        const _getLdAmt = (e) => {
          if (e.discounts && Array.isArray(e.discounts)) {
            const ld = e.discounts.filter(d => d.type === 'longDistance');
            if (ld.length > 0) return ld.reduce((s, d) => s + (d.amount || 0), 0);
          }
          if (e.discountType && e.discountType.includes('longDistance') && e.discountAmount) {
            const t = e.discountType.split(',').filter(t => t && t !== 'longDistance');
            if (t.length === 0) return e.discountAmount;
          }
          return 0;
        };
        const dayTotal = dayEntries.reduce((sum, e) => {
          if (_isCpnSub(e)) return sum;
          return sum + (e.amount || 0) + (e.discountAmount || 0) + (e.couponAmount || 0) - _getLdAmt(e);
        }, 0);
        const dayCashEntries = dayEntries.filter(e => (e.paymentMethod || 'cash') === 'cash' && e.source !== 'Uber');
        const dayUncollectedEntries = dayEntries.filter(e => e.paymentMethod === 'uncollected');
        const dayDidiEntries = dayEntries.filter(e => e.paymentMethod === 'didi');
        const dayUberEntries = dayEntries.filter(e => e.paymentMethod === 'uber' || e.source === 'Uber');
        const dayCash = dayCashEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        const dayUncollected = dayUncollectedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        const dayDidi = dayDidiEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        const dayUber = dayUberEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        const dayDiscount = dayEntries.reduce((sum, e) => _isCpnSub(e) ? sum : sum + (e.discountAmount || 0), 0);
        const _getDiscByType = (entries, dtype) => {
          let total = 0, count = 0, sheets = 0;
          entries.forEach(e => {
            if (e.discounts && Array.isArray(e.discounts)) {
              e.discounts.forEach(d => {
                if (d.type === dtype) { total += d.amount || 0; count++; if (dtype === 'coupon' || dtype === 'ticket') sheets += d.sheets || 1; }
              });
            } else if (e.discountType === dtype || (e.discountType && e.discountType.includes(dtype))) {
              total += e.discountAmount || 0; count++;
              if (dtype === 'coupon' || dtype === 'ticket') sheets += 1;
            }
          });
          return { total, count, sheets };
        };
        const dayDiscDisability = _getDiscByType(dayEntries, 'disability');
        const dayDiscLongDistance = _getDiscByType(dayEntries, 'longDistance');
        const dayDiscCoupon = _getDiscByType(dayEntries, 'coupon');
        const dayDiscTicket = _getDiscByType(dayEntries, 'ticket');
        const dayCouponEntries = dayUncollectedEntries.filter(e => e.memo && e.memo.includes('クーポン未収'));
        const dayCouponUncollected = dayCouponEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        const dayPureUncollectedEntries = dayUncollectedEntries.filter(e => !(e.memo && e.memo.includes('クーポン未収')));
        const dayPureUncollected = dayPureUncollectedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        const dayTicketPayEntries = dayEntries.filter(e => e.paymentMethod === 'ticket');
        const dayTicketPay = dayTicketPayEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        const dayTicketAllEntries = dayEntries.filter(e => {
          if (e.paymentMethod === 'ticket') return true;
          if (e.discounts && Array.isArray(e.discounts)) return e.discounts.some(d => d.type === 'ticket');
          return e.discountType && e.discountType.includes('ticket');
        });
        const dayUncollectedTotal = dayUncollected + dayDidi + dayUber + dayTicketPay + Math.abs(dayDiscDisability.total) + dayDiscTicket.total;
        const dayUncollectedTotalCount = dayUncollectedEntries.length + dayDidiEntries.length + dayUberEntries.length + dayTicketPayEntries.length + dayDiscDisability.count + dayDiscTicket.count;
        const dayDiscountEntries = dayEntries.filter(e => (e.discountAmount || 0) > 0);

        const payCards = [
          { key: 'cash', label: '現金', icon: 'payments', count: dayCashEntries.length, total: dayCash, entries: dayCashEntries, color: 'var(--color-accent)', bg: 'rgba(26,115,232,0.08)', border: 'rgba(26,115,232,0.2)' },
          { key: 'uncollected', label: '未収', icon: 'pending', count: dayUncollectedEntries.length, total: dayUncollected, entries: dayUncollectedEntries, color: 'var(--color-error)', bg: 'rgba(229,57,53,0.08)', border: 'rgba(229,57,53,0.2)' },
          { key: 'didi', label: 'DIDI', icon: 'smartphone', count: dayDidiEntries.length, total: dayDidi, entries: dayDidiEntries, color: 'var(--color-warning)', bg: 'rgba(255,152,0,0.08)', border: 'rgba(255,152,0,0.2)' },
          { key: 'uber', label: 'Uber', icon: 'hail', count: dayUberEntries.length, total: dayUber, entries: dayUberEntries, color: '#fff', bg: 'rgba(0,0,0,0.15)', border: 'rgba(255,255,255,0.15)' },
          { key: 'ticket', label: 'チケット', icon: 'confirmation_number', count: dayTicketAllEntries.length, total: dayTicketPay + dayDiscTicket.total + dayDiscCoupon.total, entries: dayTicketAllEntries, isTicket: true, color: '#4fc3f7', bg: 'rgba(79,195,247,0.08)', border: 'rgba(79,195,247,0.2)' },
          { key: 'discount', label: '割引', icon: 'discount', count: dayDiscountEntries.length, total: dayDiscount, entries: dayDiscountEntries, isDiscount: true, color: '#ce93d8', bg: 'rgba(156,39,176,0.08)', border: 'rgba(156,39,176,0.2)' },
        ];

        return createElement(React.Fragment, null,
          // 売上合計
          createElement('div', {
            style: { textAlign: 'center', paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-sm)', borderBottom: '1px solid var(--border-color)' }
          },
            createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 4 } }, '売上合計'),
            createElement('div', {
              style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-secondary)', margin: '4px 0' },
            }, `¥${dayTotal.toLocaleString()}`),
            createElement('div', {
              style: { display: 'flex', justifyContent: 'center', gap: '16px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' },
            },
              createElement('span', null, `${selectedDayData.count}件`),
              createElement('span', null, `税抜: ¥${Math.floor(dayTotal / 1.1).toLocaleString()}`),
              createElement('span', { style: { color: 'var(--color-warning)' } }, `消費税: ¥${(dayTotal - Math.floor(dayTotal / 1.1)).toLocaleString()}`)
            )
          ),

          // 現金・未収・DIDI・Uber・割引 カード（クリックで内訳展開）
          createElement('div', {
            style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: expandedCalPay && !expandedCalPay.startsWith('uncollected_total') ? 0 : 'var(--space-sm)' }
          },
            ...payCards.map(c =>
              createElement('div', {
                key: c.key,
                onClick: () => setExpandedCalPay(expandedCalPay === c.key ? null : c.key),
                style: {
                  background: c.bg, border: `1px solid ${c.border}`, borderRadius: 'var(--border-radius)',
                  padding: '8px 4px', textAlign: 'center', cursor: 'pointer', userSelect: 'none',
                  transition: 'box-shadow 0.2s', boxShadow: expandedCalPay === c.key ? `0 0 0 2px ${c.border}` : 'none',
                },
              },
                createElement('div', { style: { fontSize: 10, color: c.color, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 } },
                  createElement('span', { className: 'material-icons-round', style: { fontSize: 12 } }, c.icon),
                  c.label,
                  createElement('span', { className: 'material-icons-round', style: { fontSize: 12, transition: 'transform 0.2s', transform: expandedCalPay === c.key ? 'rotate(180deg)' : 'rotate(0)' } }, 'expand_more')
                ),
                createElement('div', { style: { fontSize: 13, fontWeight: 700, color: c.color } },
                  `¥${c.total.toLocaleString()}`
                ),
                createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, `${c.count}件`),
                // 未収カードに未収・チケット内訳
                c.key === 'uncollected' && (dayCouponUncollected > 0 || dayDiscTicket.count > 0) && createElement('div', {
                  style: { borderTop: '1px solid rgba(229,57,53,0.2)', marginTop: 4, paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2 },
                },
                  createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, `未収: ${dayPureUncollectedEntries.length}件 ¥${dayPureUncollected.toLocaleString()}`),
                  dayDiscTicket.count > 0 && createElement('div', { style: { fontSize: 10, color: '#4fc3f7' } }, `チケット: ${dayDiscTicket.count}件 ¥${dayDiscTicket.total.toLocaleString()}`),
                  dayCouponUncollected > 0 && createElement('div', { style: { fontSize: 10, color: '#a78bfa' } }, `クーポン: ¥${dayCouponUncollected.toLocaleString()}`)
                ),
                // 割引カードに内訳
                c.key === 'discount' && (dayDiscDisability.count > 0 || dayDiscLongDistance.count > 0) && createElement('div', {
                  style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 },
                },
                  [
                    dayDiscDisability.count > 0 && `障割 ${dayDiscDisability.count}件`,
                    dayDiscLongDistance.count > 0 && `遠割 ${dayDiscLongDistance.count}件`,
                  ].filter(Boolean).join(' / ')
                )
              )
            )
          ),

          // 展開中の内訳リスト
          (() => {
            const ec = payCards.find(c => c.key === expandedCalPay);
            if (!ec) return null;
            if (ec.entries.length === 0) return createElement('div', {
              key: 'cal-pay-detail',
              style: { marginBottom: 'var(--space-sm)', padding: '12px', borderRadius: 'var(--border-radius)', background: 'rgba(255,255,255,0.03)', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' },
            }, `${ec.label}のデータはありません`);
            return createElement('div', {
              key: 'cal-pay-detail',
              style: { marginBottom: 'var(--space-sm)', borderRadius: '0 0 var(--border-radius) var(--border-radius)', background: 'rgba(255,255,255,0.03)', border: `1px solid ${ec.border}`, borderTop: 'none', overflow: 'hidden' },
            },
              createElement('div', {
                style: { padding: '6px 10px', background: ec.bg, fontSize: 11, fontWeight: 700, color: ec.color, display: 'flex', alignItems: 'center', gap: 4 },
              },
                createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'receipt_long'),
                `${ec.label} 内訳（${ec.entries.length}件）`
              ),
              ...ec.entries
                .sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''))
                .map((e, i) => createElement('div', {
                  key: e.id || i,
                  style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' },
                },
                  createElement('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 38 } }, e.pickupTime || '--:--'),
                  createElement('div', { style: { flex: 1, minWidth: 0 } },
                    createElement('div', { style: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                      (e.pickup || '?') + ' → ' + (e.dropoff || '?')
                    ),
                    (e.source || e.purpose || e.memo) && createElement('div', { style: { fontSize: 9, color: 'var(--text-muted)', marginTop: 1 } },
                      [e.source, e.purpose, e.memo].filter(Boolean).join(' / ')
                    )
                  ),
                  createElement('span', { style: { fontSize: 12, fontWeight: 700, color: ec.color, whiteSpace: 'nowrap' } },
                    ec.isDiscount
                      ? `¥${(e.discountAmount || 0).toLocaleString()}`
                      : `¥${(e.amount || 0).toLocaleString()}`
                  ),
                  ec.isDiscount && e.discountType && createElement('span', { style: { fontSize: 9, color: 'var(--text-muted)', marginLeft: 2 } },
                    e.discountType.split(',').map(t => ({ disability: '障害者', longDistance: '遠距離' })[t] || t).join('/')
                  )
                ))
            );
          })(),

          // 未収合計（クリックで内訳展開）
          createElement('div', {
            onClick: () => setExpandedCalPay(expandedCalPay === 'uncollected_total' ? null : 'uncollected_total'),
            style: {
              padding: '10px 12px', marginBottom: expandedCalPay === 'uncollected_total' ? 0 : 'var(--space-sm)',
              borderRadius: expandedCalPay === 'uncollected_total' ? 'var(--border-radius) var(--border-radius) 0 0' : 'var(--border-radius)',
              background: 'rgba(156,39,176,0.08)', border: '1px solid rgba(156,39,176,0.25)',
              cursor: 'pointer', userSelect: 'none', transition: 'box-shadow 0.2s',
              boxShadow: expandedCalPay === 'uncollected_total' ? '0 0 0 2px rgba(156,39,176,0.25)' : 'none',
            },
          },
            createElement('div', {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
            },
              createElement('div', {
                style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: '#ce93d8', fontWeight: 600 },
              },
                createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'account_balance'),
                '未収合計',
                createElement('span', { style: { fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 } }, `${dayUncollectedTotalCount}件`),
                createElement('span', { className: 'material-icons-round', style: { fontSize: 14, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expandedCalPay === 'uncollected_total' ? 'rotate(180deg)' : 'rotate(0)' } }, 'expand_more')
              ),
              createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: '#ce93d8' } },
                `¥${dayUncollectedTotal.toLocaleString()}`
              )
            ),
            createElement('div', {
              style: { display: 'flex', gap: '10px', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' },
            },
              createElement('span', null, `未収: ${dayUncollectedEntries.length}件 ¥${dayUncollected.toLocaleString()}`),
              dayDidiEntries.length > 0 && createElement('span', null, `DIDI: ${dayDidiEntries.length}件 ¥${dayDidi.toLocaleString()}`),
              dayUberEntries.length > 0 && createElement('span', null, `Uber: ${dayUberEntries.length}件 ¥${dayUber.toLocaleString()}`),
              dayDiscDisability.count > 0 && createElement('span', null, `障害者割引: ${dayDiscDisability.count}件 +¥${Math.abs(dayDiscDisability.total).toLocaleString()}`),
              dayTicketPayEntries.length > 0 && createElement('span', null, `チケット払: ${dayTicketPayEntries.length}件 ¥${dayTicketPay.toLocaleString()}`),
              dayDiscTicket.count > 0 && createElement('span', null, `チケット割: ${dayDiscTicket.count}件 ¥${dayDiscTicket.total.toLocaleString()}`),
              dayCouponUncollected > 0 && createElement('span', null, `うちクーポン: ¥${dayCouponUncollected.toLocaleString()}`)
            )
          ),

          // 未収合計の展開内訳
          expandedCalPay === 'uncollected_total' && (() => {
            const allUncollectedEntries = [...dayUncollectedEntries, ...dayDidiEntries, ...dayUberEntries, ...dayTicketPayEntries].sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''));
            if (allUncollectedEntries.length === 0) return createElement('div', {
              style: { marginBottom: 'var(--space-sm)', padding: '12px', borderRadius: '0 0 var(--border-radius) var(--border-radius)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(156,39,176,0.25)', borderTop: 'none', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' },
            }, '未収データはありません');
            return createElement('div', {
              style: { marginBottom: 'var(--space-sm)', borderRadius: '0 0 var(--border-radius) var(--border-radius)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(156,39,176,0.25)', borderTop: 'none', overflow: 'hidden' },
            },
              ...allUncollectedEntries.map((e, i) => {
                const pmColor = e.paymentMethod === 'ticket' ? '#4fc3f7' : e.paymentMethod === 'didi' ? 'var(--color-warning)' : e.paymentMethod === 'uber' || e.source === 'Uber' ? '#fff' : 'var(--color-error)';
                const pmLabel = e.paymentMethod === 'ticket' ? 'チケット' : e.paymentMethod === 'didi' ? 'DIDI' : e.paymentMethod === 'uber' || e.source === 'Uber' ? 'Uber' : '未収';
                return createElement('div', {
                  key: e.id || i,
                  style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' },
                },
                  createElement('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 38 } }, e.pickupTime || '--:--'),
                  createElement('span', { style: { fontSize: 9, padding: '1px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: pmColor, fontWeight: 600 } }, pmLabel),
                  createElement('div', { style: { flex: 1, minWidth: 0 } },
                    createElement('div', { style: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                      (e.pickup || '?') + ' → ' + (e.dropoff || '?')
                    ),
                    e.memo && createElement('div', { style: { fontSize: 9, color: 'var(--text-muted)', marginTop: 1 } }, e.memo)
                  ),
                  createElement('span', { style: { fontSize: 12, fontWeight: 700, color: '#ce93d8', whiteSpace: 'nowrap' } },
                    `¥${(e.amount || 0).toLocaleString()}`
                  )
                );
              })
            );
          })(),

          // 割引詳細
          (dayDiscDisability.count > 0 || dayDiscCoupon.count > 0 || dayDiscTicket.count > 0 || dayDiscLongDistance.count > 0) &&
          createElement('div', {
            style: { display: 'flex', gap: '10px', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap', marginBottom: 'var(--space-sm)', padding: '0 4px' },
          },
            dayDiscDisability.count > 0 && createElement('span', { style: { color: '#ce93d8' } }, `障害者割引: ${dayDiscDisability.count}件 -¥${dayDiscDisability.total.toLocaleString()}`),
            dayDiscCoupon.count > 0 && createElement('span', { style: { color: '#a78bfa' } }, `クーポン: ${dayDiscCoupon.sheets}枚 -¥${dayDiscCoupon.total.toLocaleString()}`),
            dayDiscTicket.count > 0 && createElement('span', { style: { color: '#a78bfa' } }, `チケット: ${dayDiscTicket.count}件 -¥${dayDiscTicket.total.toLocaleString()}`),
            dayDiscLongDistance.count > 0 && createElement('span', { style: { color: '#ce93d8' } }, `遠距離割: ${dayDiscLongDistance.count}件 -¥${dayDiscLongDistance.total.toLocaleString()}`)
          )
        );
      })(),

      // 件数・合計・平均
      createElement('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }
      },
        createElement('div', { style: { textAlign: 'center' } },
          createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '件数'),
          createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 } }, selectedDayData.count)
        ),
        createElement('div', { style: { textAlign: 'center' } },
          createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '合計'),
          createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-accent)' } },
            selectedDayData.revenue > 0 ? `${selectedDayData.revenue.toLocaleString()}円` : '−'
          )
        ),
        createElement('div', { style: { textAlign: 'center' } },
          createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '平均'),
          createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 } },
            selectedDayData.count > 0 ? `${Math.round(selectedDayData.revenue / selectedDayData.count).toLocaleString()}円` : '−'
          )
        )
      ),

      // 稼働時間サマリー
      (selectedDayData.workMin > 0 || selectedDayData.breakMin > 0) && createElement('div', {
        style: { borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-sm)', marginTop: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }
      },
        createElement('div', {
          style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-sm)', textAlign: 'center' }
        },
          createElement('div', null,
            createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '稼働'),
            createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 } },
              (() => { const h = Math.floor(selectedDayData.workMin / 60); const m = selectedDayData.workMin % 60; return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`; })()
            )
          ),
          createElement('div', null,
            createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '休憩'),
            createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-warning)' } },
              selectedDayData.breakMin > 0
                ? (() => { const h = Math.floor(selectedDayData.breakMin / 60); const m = selectedDayData.breakMin % 60; return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`; })()
                : '0h'
            )
          ),
          createElement('div', null,
            createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '実働'),
            createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-accent)' } },
              (() => { const net = Math.max(0, selectedDayData.workMin - selectedDayData.breakMin); const h = Math.floor(net / 60); const m = net % 60; return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`; })()
            )
          )
        )
      ),

      // シフト記録（編集可能）
      selectedDayData.shifts.length > 0 && createElement('div', {
        style: { borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-sm)', marginTop: 'var(--space-sm)' }
      },
        createElement('div', {
          style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginBottom: 4 }
        }, 'シフト記録'),
        ...selectedDayData.shifts.map((s, i) => {
          const isEditing = editingItem && editingItem.type === 'shift' && editingItem.id === s.id;
          if (isEditing) {
            return createElement('div', {
              key: 'shift-' + i,
              style: { fontSize: 'var(--font-size-sm)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }
            },
              createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'schedule'),
              createElement('input', {
                type: 'time',
                value: editingItem.startTime,
                onChange: (e) => setEditingItem(prev => ({ ...prev, startTime: e.target.value })),
                style: { fontSize: 'var(--font-size-sm)', padding: '2px 4px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--text-primary)' }
              }),
              ' 〜 ',
              createElement('input', {
                type: 'time',
                value: editingItem.endTime,
                onChange: (e) => setEditingItem(prev => ({ ...prev, endTime: e.target.value })),
                style: { fontSize: 'var(--font-size-sm)', padding: '2px 4px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--text-primary)' }
              }),
              createElement('button', {
                className: 'btn btn--primary',
                style: { padding: '2px 8px', fontSize: 'var(--font-size-sm)', minWidth: 'auto' },
                onClick: () => {
                  try {
                    const allShifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
                    const idx = allShifts.findIndex(x => x.id === editingItem.id);
                    if (idx !== -1) {
                      allShifts[idx].startTime = timeStrToIso(selectedDate, editingItem.startTime);
                      if (editingItem.endTime) allShifts[idx].endTime = timeStrToIso(selectedDate, editingItem.endTime);
                      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(allShifts));
                      DataService.syncShiftsToCloud();
                      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
                      setRefreshKey(k => k + 1);
                    }
                  } catch (e) { AppLogger.error('シフト保存失敗', e.message); }
                  setEditingItem(null);
                }
              }, '保存'),
              createElement('button', {
                className: 'btn btn--secondary',
                style: { padding: '2px 8px', fontSize: 'var(--font-size-sm)', minWidth: 'auto' },
                onClick: () => setEditingItem(null)
              }, '取消')
            );
          }
          const start = s.startTime ? isoToTimeStr(s.startTime) : '?';
          const end = s.endTime ? isoToTimeStr(s.endTime) : '勤務中';
          return createElement('div', {
            key: 'shift-' + i,
            style: { fontSize: 'var(--font-size-sm)', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }
          },
            createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'schedule'),
            `${start} 〜 ${end}`,
            createElement('button', {
              className: 'btn btn--secondary',
              style: { padding: '1px 6px', fontSize: 11, minWidth: 'auto', marginLeft: 4 },
              onClick: (e) => {
                e.stopPropagation();
                setEditingItem({ type: 'shift', id: s.id, startTime: isoToTimeStr(s.startTime), endTime: s.endTime ? isoToTimeStr(s.endTime) : '' });
              }
            }, '編集')
          );
        })
      ),

      // 休憩記録（編集可能）
      selectedDayData.breaks.length > 0 && createElement('div', {
        style: { borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-sm)', marginTop: 'var(--space-sm)' }
      },
        createElement('div', {
          style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginBottom: 4 }
        }, '休憩記録'),
        ...selectedDayData.breaks.map((b, i) => {
          const isEditing = editingItem && editingItem.type === 'break' && editingItem.id === b.id;
          if (isEditing) {
            return createElement('div', {
              key: 'break-' + i,
              style: { fontSize: 'var(--font-size-sm)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }
            },
              createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'free_breakfast'),
              createElement('input', {
                type: 'time',
                value: editingItem.startTime,
                onChange: (e) => setEditingItem(prev => ({ ...prev, startTime: e.target.value })),
                style: { fontSize: 'var(--font-size-sm)', padding: '2px 4px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--text-primary)' }
              }),
              ' 〜 ',
              createElement('input', {
                type: 'time',
                value: editingItem.endTime,
                onChange: (e) => setEditingItem(prev => ({ ...prev, endTime: e.target.value })),
                style: { fontSize: 'var(--font-size-sm)', padding: '2px 4px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--text-primary)' }
              }),
              createElement('button', {
                className: 'btn btn--primary',
                style: { padding: '2px 8px', fontSize: 'var(--font-size-sm)', minWidth: 'auto' },
                onClick: () => {
                  try {
                    const allBreaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
                    const idx = allBreaks.findIndex(x => x.id === editingItem.id);
                    if (idx !== -1) {
                      allBreaks[idx].startTime = timeStrToIso(selectedDate, editingItem.startTime);
                      if (editingItem.endTime) allBreaks[idx].endTime = timeStrToIso(selectedDate, editingItem.endTime);
                      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(allBreaks));
                      DataService.syncBreaksToCloud();
                      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
                      setRefreshKey(k => k + 1);
                    }
                  } catch (e) { AppLogger.error('休憩保存失敗', e.message); }
                  setEditingItem(null);
                }
              }, '保存'),
              createElement('button', {
                className: 'btn btn--secondary',
                style: { padding: '2px 8px', fontSize: 'var(--font-size-sm)', minWidth: 'auto' },
                onClick: () => setEditingItem(null)
              }, '取消')
            );
          }
          const start = b.startTime ? isoToTimeStr(b.startTime) : '?';
          const end = b.endTime ? isoToTimeStr(b.endTime) : '休憩中';
          return createElement('div', {
            key: 'break-' + i,
            style: { fontSize: 'var(--font-size-sm)', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }
          },
            createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'free_breakfast'),
            `${start} 〜 ${end}`,
            createElement('button', {
              className: 'btn btn--secondary',
              style: { padding: '1px 6px', fontSize: 11, minWidth: 'auto', marginLeft: 4 },
              onClick: (e) => {
                e.stopPropagation();
                setEditingItem({ type: 'break', id: b.id, startTime: isoToTimeStr(b.startTime), endTime: b.endTime ? isoToTimeStr(b.endTime) : '' });
              }
            }, '編集')
          );
        })
      ),

      // 売上詳細一覧
      selectedDayData.entries.length > 0 && createElement('div', {
        style: { borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-sm)', marginTop: 'var(--space-sm)' }
      },
        createElement('div', {
          style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginBottom: '6px' }
        }, `売上詳細（${selectedDayData.entries.length}件）`),
        ...selectedDayData.entries.map((e, i) =>
          createElement('div', {
            key: 'entry-' + (e.id || i),
            style: {
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 8px', marginBottom: '4px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.04)', fontSize: '12px',
            }
          },
            // 時間
            createElement('span', {
              style: { color: 'var(--text-secondary)', minWidth: '40px', flexShrink: 0, fontWeight: 600 }
            }, e.pickupTime || '--:--'),
            // 乗車地→降車地
            createElement('div', {
              style: { flex: 1, overflow: 'hidden', minWidth: 0 }
            },
              createElement('div', {
                style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }
              }, `${e.pickup || '不明'} → ${e.dropoff || '不明'}`),
              createElement('div', {
                style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px', display: 'flex', gap: '6px', flexWrap: 'wrap' }
              },
                e.dispatchType && createElement('span', null, e.dispatchType),
                e.paymentMethod && createElement('span', null,
                  e.paymentMethod === 'cash' ? '現金' : e.paymentMethod === 'uncollected' ? '未収' : e.paymentMethod === 'ticket' ? 'チケット' : e.paymentMethod
                ),
                e.purpose && createElement('span', null, e.purpose)
              )
            ),
            // 金額
            createElement('span', {
              style: { fontWeight: 700, color: 'var(--color-accent)', whiteSpace: 'nowrap', flexShrink: 0 }
            }, `¥${(e.amount || 0).toLocaleString()}`)
          )
        )
      )
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
          createElement('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 700 } }, `${monthlySummary.offDays}日`)
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
        )
      )
    )
  );
};

})();
