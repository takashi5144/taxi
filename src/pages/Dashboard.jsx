(function() {
// Dashboard.jsx - ダッシュボード（DataServiceからリアルタイムデータ取得）
window.DashboardPage = () => {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;
  const { navigate } = useAppContext();
  const geo = useGeolocation();

  // 勤務モード（日勤/夜勤）
  const [shiftMode, setShiftMode] = useState(() => {
    try { return (JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}')).shiftMode || 'day'; } catch { return 'day'; }
  });
  useEffect(() => {
    const h = () => {
      try { setShiftMode((JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}')).shiftMode || 'day'); } catch {}
    };
    window.addEventListener('taxi-shift-mode-changed', h);
    return () => window.removeEventListener('taxi-shift-mode-changed', h);
  }, []);
  // 支払方法カード展開: null or 'cash'|'uncollected'|'didi'|'uber'
  const [expandedPayment, setExpandedPayment] = useState(null);

  // DataServiceからリアルタイムデータを取得
  const [refreshKey, setRefreshKey] = useState(0);

  // localStorageの変更・データ変更イベントを監視して自動更新
  useEffect(() => {
    const syncKeys = [APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA, APP_CONSTANTS.STORAGE_KEYS.SHIFTS, APP_CONSTANTS.STORAGE_KEYS.BREAKS, APP_CONSTANTS.STORAGE_KEYS.WORK_STATUS];
    const handleStorage = (e) => {
      if (syncKeys.includes(e.key)) setRefreshKey(k => k + 1);
    };
    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('taxi-data-changed', handleDataChanged);

    // 画面に戻った時も更新
    const handleVisibility = () => {
      if (!document.hidden) setRefreshKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 稼働時間をリアルタイム更新（1分間隔）
    const timer = setInterval(() => setRefreshKey(k => k + 1), 60000);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(timer);
    };
  }, []);

  const todaySummary = useMemo(() => DataService.getTodaySummary(), [refreshKey]);

  // 始業/終業シフト管理
  const [shiftInfo, setShiftInfo] = useState({ active: false, startTime: null });
  // 休憩管理
  const [breakInfo, setBreakInfo] = useState({ active: false, startTime: null });
  // 始業時間編集モード
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [editStartTimeValue, setEditStartTimeValue] = useState('');
  useEffect(() => {
    try {
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const activeShift = shifts.find(s => !s.endTime);
      if (activeShift) {
        setShiftInfo({ active: true, startTime: activeShift.startTime });
      } else {
        setShiftInfo({ active: false, startTime: null });
      }
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      const activeBreak = breaks.find(b => !b.endTime);
      if (activeBreak) {
        setBreakInfo({ active: true, startTime: activeBreak.startTime });
      } else {
        setBreakInfo({ active: false, startTime: null });
      }
    } catch (e) {
      AppLogger.warn('シフト/休憩データの読み込みに失敗', e.message);
    }
  }, [refreshKey]);

  // 始業時間変更ハンドラ
  const handleStartTimeEdit = useCallback(() => {
    if (!shiftInfo.active || !shiftInfo.startTime) return;
    const d = new Date(shiftInfo.startTime);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setEditStartTimeValue(`${hh}:${mm}`);
    setEditingStartTime(true);
  }, [shiftInfo]);

  const handleStartTimeSave = useCallback(() => {
    if (!editStartTimeValue) return;
    try {
      const [h, m] = editStartTimeValue.split(':').map(Number);
      const oldStart = new Date(shiftInfo.startTime);
      const newStart = new Date(oldStart);
      newStart.setHours(h, m, 0, 0);

      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const activeShift = shifts.find(s => !s.endTime);
      if (activeShift) {
        activeShift.startTime = newStart.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
        DataService.syncShiftsToCloud();
        setShiftInfo({ active: true, startTime: newStart.toISOString() });
        setRefreshKey(k => k + 1);
        window.dispatchEvent(new CustomEvent('taxi-data-changed'));
        // 時間変更後、GPSが未稼働なら開始
        if (!geo.isTracking) geo.startTracking();
        if (window.GpsLogService) GpsLogService.startWeatherPolling();
        AppLogger.info(`始業時間を変更: ${editStartTimeValue}`);
      }
    } catch (e) {
      AppLogger.error('始業時間の変更に失敗', e.message);
    }
    setEditingStartTime(false);
  }, [editStartTimeValue, shiftInfo, geo]);

  // Dashboard側でも自動始業/終業イベントを受信してUI状態を同期
  useEffect(() => {
    const handleAutoShift = (e) => {
      const { type, startTime } = e.detail || {};
      if (type === 'start') {
        setShiftInfo({ active: true, startTime });
      } else if (type === 'end') {
        setShiftInfo({ active: false, startTime: null });
        setBreakInfo({ active: false, startTime: null });
      }
    };
    window.addEventListener('taxi-auto-shift', handleAutoShift);
    return () => window.removeEventListener('taxi-auto-shift', handleAutoShift);
  }, []);

  const handleShiftStart = useCallback(() => {
    try {
      const now = new Date();
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const activeShift = shifts.find(s => !s.endTime);
      if (activeShift) {
        activeShift.endTime = now.toISOString();
      }
      // 休憩中なら終了させる（state/localStorage両方をチェック）
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      const ab = breaks.find(b => !b.endTime);
      if (ab) {
        ab.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
        DataService.syncBreaksToCloud();
      }
      setBreakInfo({ active: false, startTime: null });
      const newShift = { id: Date.now().toString(), startTime: now.toISOString(), endTime: null };
      shifts.push(newShift);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
      DataService.syncShiftsToCloud();
      setShiftInfo({ active: true, startTime: now.toISOString() });
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      // GPS追跡を開始（設定で有効な場合のみ）
      const gpsBgEnabled = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.GPS_BG_ENABLED) === 'true';
      if (gpsBgEnabled && !geo.isTracking) geo.startTracking();
      if (gpsBgEnabled) GpsLogService.startWeatherPolling();
      AppLogger.info(`始業: ${now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      AppLogger.error('始業処理に失敗', e.message);
    }
  }, [geo]);

  const handleShiftEnd = useCallback(() => {
    try {
      const now = new Date();
      // 休憩中なら終了させる（state/localStorage両方をチェック）
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      const ab = breaks.find(b => !b.endTime);
      if (ab) {
        ab.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
      }
      setBreakInfo({ active: false, startTime: null });
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const activeShift = shifts.find(s => !s.endTime);
      if (activeShift) {
        activeShift.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
        AppLogger.info(`終業: ${now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
      }
      setShiftInfo({ active: false, startTime: null });
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      // 未確定の空車待機を記録してからGPS追跡を停止
      if (window.GpsLogService && GpsLogService.flushRealtimeStandby) GpsLogService.flushRealtimeStandby();
      if (geo.isTracking) geo.stopTracking();
      GpsLogService.stopWeatherPolling();
      // 終業時にクラウド一括同期
      DataService.syncAllToCloud();
      AppLogger.info('GPS追跡を停止（終業）');
    } catch (e) {
      AppLogger.error('終業処理に失敗', e.message);
    }
  }, [geo]);

  const handleBreakStart = useCallback(() => {
    if (!shiftInfo.active) return;
    try {
      // 未確定の空車待機を記録
      if (window.GpsLogService && GpsLogService.flushRealtimeStandby) GpsLogService.flushRealtimeStandby();
      const now = new Date();
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      const newBreak = { id: Date.now().toString(), startTime: now.toISOString(), endTime: null };
      breaks.push(newBreak);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
      DataService.syncBreaksToCloud();
      setBreakInfo({ active: true, startTime: now.toISOString() });
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      AppLogger.info(`休憩開始: ${now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      AppLogger.error('休憩開始処理に失敗', e.message);
    }
  }, [shiftInfo.active]);

  const handleBreakEnd = useCallback(() => {
    try {
      const now = new Date();
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      const activeBreak = breaks.find(b => !b.endTime);
      if (activeBreak) {
        activeBreak.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
        DataService.syncBreaksToCloud();
        AppLogger.info(`休憩終了: ${now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
      }
      setBreakInfo({ active: false, startTime: null });
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
    } catch (e) {
      AppLogger.error('休憩終了処理に失敗', e.message);
    }
  }, []);

  // 営業プラン関連

  // 本日の売上合計用データ（Revenue.jsxから移動）
  const todayEntries = todaySummary.entries || [];
  // クーポン別エントリ（自動生成）を識別
  const isCouponSubEntry = (e) => e.paymentMethod === 'uncollected' && e.memo && e.memo.includes('クーポン未収');
  // 売上合計 = amount + discountAmount + couponAmount（メーター金額ベース）
  // ただし遠距離割は売上から除外（実際に受け取れない金額のため）
  // クーポン別エントリは除外（couponAmountで既に加算するため二重計上防止）
  const _getLongDistanceAmt = (e) => {
    // discounts配列から取得
    if (e.discounts && Array.isArray(e.discounts)) {
      const ld = e.discounts.filter(d => d.type === 'longDistance');
      if (ld.length > 0) return ld.reduce((s, d) => s + (d.amount || 0), 0);
    }
    // フォールバック: discountType文字列から判定
    if (e.discountType && e.discountType.includes('longDistance') && e.discountAmount) {
      // 遠距離割のみの場合はdiscountAmount全額
      const types = e.discountType.split(',').filter(t => t && t !== 'longDistance');
      if (types.length === 0) return e.discountAmount;
    }
    return 0;
  };
  const todayTotal = todayEntries.reduce((sum, e) => {
    if (isCouponSubEntry(e)) return sum; // クーポン別エントリは除外
    return sum + (e.amount || 0) + (e.discountAmount || 0) + (e.couponAmount || 0) - _getLongDistanceAmt(e);
  }, 0);
  const todayCashEntries = todayEntries.filter(e => (e.paymentMethod || 'cash') === 'cash' && e.source !== 'Uber');
  const todayUncollectedEntries = todayEntries.filter(e => e.paymentMethod === 'uncollected');
  const todayDidiEntries = todayEntries.filter(e => e.paymentMethod === 'didi');
  const todayUberEntries = todayEntries.filter(e => e.paymentMethod === 'uber' || e.source === 'Uber');
  const todayCash = todayCashEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayUncollected = todayUncollectedEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayDidi = todayDidiEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayUber = todayUberEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayDiscount = todayEntries.reduce((sum, e) => isCouponSubEntry(e) ? sum : sum + (e.discountAmount || 0), 0);
  const getDiscountByType = (entries, dtype) => {
    let total = 0, count = 0, sheets = 0;
    entries.forEach(e => {
      if (e.discounts && Array.isArray(e.discounts)) {
        e.discounts.forEach(d => {
          if (d.type === dtype) {
            total += d.amount || 0;
            count++;
            if (dtype === 'coupon' || dtype === 'ticket') sheets += d.sheets || 1;
          }
        });
      } else if (e.discountType === dtype || (e.discountType && e.discountType.includes(dtype))) {
        total += e.discountAmount || 0; count++;
        if (dtype === 'coupon' || dtype === 'ticket') sheets += 1;
      }
    });
    return { total, count, sheets };
  };
  const todayDiscountDisability = getDiscountByType(todayEntries, 'disability');
  const todayDiscountLongDistance = getDiscountByType(todayEntries, 'longDistance');
  const todayDiscountCoupon = getDiscountByType(todayEntries, 'coupon');
  const todayDiscountTicket = getDiscountByType(todayEntries, 'ticket');
  const todayCouponEntries = todayUncollectedEntries.filter(e => e.memo && e.memo.includes('クーポン未収'));
  const todayCouponUncollected = todayCouponEntries.reduce((sum, e) => sum + e.amount, 0);
  // チケット支払エントリ（paymentMethod=ticket）
  const todayTicketPayEntries = todayEntries.filter(e => e.paymentMethod === 'ticket');
  const todayTicketPay = todayTicketPayEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  // チケット使用エントリ（paymentMethod=ticketまたはticket割引があるエントリ）
  const todayTicketEntries = todayEntries.filter(e => {
    if (e.paymentMethod === 'ticket') return true;
    if (e.discounts && Array.isArray(e.discounts)) return e.discounts.some(d => d.type === 'ticket');
    return e.discountType && e.discountType.includes('ticket');
  });
  // 純粋な未収（クーポンサブとチケットエントリを除く）
  const todayPureUncollectedEntries = todayUncollectedEntries.filter(e => !(e.memo && e.memo.includes('クーポン未収')));
  const todayPureUncollected = todayPureUncollectedEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayUncollectedTotal = todayUncollected + todayDidi + todayUber + todayTicketPay + Math.abs(todayDiscountDisability.total);
  const todayUncollectedTotalExCoupon = todayUncollectedTotal - todayCouponUncollected;
  const todayUncollectedTotalCount = todayUncollectedEntries.length + todayDidiEntries.length + todayUberEntries.length + todayTicketPayEntries.length + todayDiscountDisability.count;
  const currentMonth = getLocalDateString().slice(0, 7);
  const monthData = useMemo(() => {
    const entries = DataService.getEntries();
    const _isCpnSub = (e) => e.paymentMethod === 'uncollected' && e.memo && e.memo.includes('クーポン未収');
    const month = entries.filter(e => (e.date || e.timestamp.split('T')[0]).startsWith(currentMonth) && !_isCpnSub(e));
    const _ldAmt = (e) => {
      if (e.discounts && Array.isArray(e.discounts)) { const r = e.discounts.filter(d => d.type === 'longDistance'); if (r.length > 0) return r.reduce((s, d) => s + (d.amount || 0), 0); }
      if (e.discountType && e.discountType.includes('longDistance') && e.discountAmount) { const t = e.discountType.split(',').filter(t => t && t !== 'longDistance'); if (t.length === 0) return e.discountAmount; }
      return 0;
    };
    return { count: month.length, total: month.reduce((sum, e) => sum + (e.amount || 0) + (e.discountAmount || 0) + (e.couponAmount || 0) - _ldAmt(e), 0) };
  }, [refreshKey, currentMonth]);

  return React.createElement('div', null,
    // タイトル + モードバッジ
    React.createElement('h1', { className: 'page-title', style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      React.createElement('span', { className: 'material-icons-round' }, 'dashboard'),
      'ダッシュボード',
      React.createElement('span', {
        style: {
          fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
          background: shiftMode === 'night' ? 'rgba(124,77,255,0.2)' : 'rgba(255,167,38,0.2)',
          color: shiftMode === 'night' ? '#b388ff' : '#ffa726',
        }
      }, shiftMode === 'night' ? '夜勤' : '日勤')
    ),

    // 始業/終業ボタン
    React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)', padding: 'var(--space-md)' },
    },
      // 始業・終業行
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        // 始業ボタン
        React.createElement('button', {
          type: 'button',
          onClick: handleShiftStart,
          style: {
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '14px 12px', borderRadius: '10px',
            fontSize: '15px', fontWeight: '700', cursor: 'pointer',
            border: shiftInfo.active ? '2px solid var(--color-accent)' : '2px solid var(--color-warning)',
            background: shiftInfo.active ? 'rgba(0,200,83,0.12)' : 'rgba(255,152,0,0.15)',
            color: shiftInfo.active ? 'var(--color-accent)' : 'var(--color-warning)',
            transition: 'all 0.2s ease',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px' } },
            shiftInfo.active ? 'work' : 'play_arrow'),
          shiftInfo.active
            ? `始業中 ${new Date(shiftInfo.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}~`
            : '始業'
        ),
        // 終業ボタン（始業中のみ表示）
        shiftInfo.active && React.createElement('button', {
          type: 'button',
          onClick: handleShiftEnd,
          style: {
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '14px 12px', borderRadius: '10px',
            fontSize: '15px', fontWeight: '700', cursor: 'pointer',
            border: '2px solid #ef4444',
            background: 'rgba(239,68,68,0.12)',
            color: '#ef4444',
            transition: 'all 0.2s ease',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px' } }, 'stop'),
          '終業'
        )
      ),
      // 休憩開始・休憩終了行（始業中のみ表示）
      shiftInfo.active && React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
        // 休憩開始ボタン（休憩中でないとき）
        !breakInfo.active && React.createElement('button', {
          type: 'button',
          onClick: handleBreakStart,
          style: {
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '10px 12px', borderRadius: '10px',
            fontSize: '13px', fontWeight: '700', cursor: 'pointer',
            border: '2px solid #78909c',
            background: 'rgba(120,144,156,0.1)',
            color: '#78909c',
            transition: 'all 0.2s ease',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'free_breakfast'),
          '休憩開始'
        ),
        // 休憩中表示 + 休憩終了ボタン（休憩中のとき）
        breakInfo.active && React.createElement('button', {
          type: 'button',
          onClick: handleBreakEnd,
          style: {
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '10px 12px', borderRadius: '10px',
            fontSize: '13px', fontWeight: '700', cursor: 'pointer',
            border: '2px solid #42a5f5',
            background: 'rgba(66,165,245,0.12)',
            color: '#42a5f5',
            transition: 'all 0.2s ease',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'play_arrow'),
          '休憩終了'
        )
      ),
      // 休憩中の表示
      breakInfo.active && React.createElement('div', {
        style: {
          marginTop: '8px', padding: '8px 12px', borderRadius: '8px',
          background: 'rgba(66,165,245,0.06)', border: '1px solid rgba(66,165,245,0.2)',
          fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#42a5f5' } }, 'free_breakfast'),
        `${new Date(breakInfo.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} から休憩中`,
        (() => {
          const elapsed = Date.now() - new Date(breakInfo.startTime).getTime();
          const mins = Math.floor(elapsed / 60000);
          return React.createElement('span', {
            style: { fontWeight: '600', color: '#42a5f5', padding: '1px 8px', borderRadius: '4px', background: 'rgba(66,165,245,0.12)' },
          }, `${mins}分`);
        })()
      ),
      // 勤務中の経過時間表示（休憩中でないとき）
      shiftInfo.active && !breakInfo.active && React.createElement('div', {
        style: {
          marginTop: '8px', padding: '8px 12px', borderRadius: '8px',
          background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.15)',
          fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center',
        },
      },
        // 通常表示 or 編集モード
        !editingStartTime ? React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: 'var(--color-accent)' } }, 'schedule'),
          `${new Date(shiftInfo.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} から勤務中`,
          (() => {
            const elapsed = Date.now() - new Date(shiftInfo.startTime).getTime();
            const hours = Math.floor(elapsed / 3600000);
            const mins = Math.floor((elapsed % 3600000) / 60000);
            return React.createElement('span', {
              style: { fontWeight: '600', color: 'var(--color-accent)', padding: '1px 8px', borderRadius: '4px', background: 'rgba(0,200,83,0.12)' },
            }, `${hours}時間${mins}分`);
          })(),
          React.createElement('button', {
            type: 'button',
            onClick: handleStartTimeEdit,
            style: {
              marginLeft: '4px', padding: '2px 6px', borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px',
              display: 'flex', alignItems: 'center', gap: '2px',
            },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, 'edit'),
            '変更'
          )
        )
        // 編集モード
        : React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
        },
          React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, '始業時間:'),
          React.createElement('input', {
            type: 'time',
            value: editStartTimeValue,
            onChange: (e) => setEditStartTimeValue(e.target.value),
            style: {
              padding: '4px 8px', borderRadius: '6px',
              border: '1px solid rgba(0,200,83,0.4)', background: 'rgba(0,200,83,0.08)',
              color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-family)',
            },
          }),
          React.createElement('button', {
            type: 'button',
            onClick: handleStartTimeSave,
            style: {
              padding: '4px 10px', borderRadius: '6px', border: 'none',
              background: 'var(--color-accent)', color: '#fff', cursor: 'pointer',
              fontSize: '12px', fontWeight: 600,
            },
          }, '確定'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setEditingStartTime(false),
            style: {
              padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: '12px',
            },
          }, '取消')
        )
      )
    ),

    // 本日の売上合計（最上部表示）
    React.createElement(Card, { style: { marginBottom: 'var(--space-lg)' } },
      // 合計金額セクション
      React.createElement('div', { style: { textAlign: 'center', paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-sm)', borderBottom: '1px solid var(--border-color)' } },
        React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 4 } }, `${todaySummary.shiftStartDate || getLocalDateString()}の売上合計`),
        React.createElement('div', {
          style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-secondary)', margin: '4px 0' },
        }, `¥${todayTotal.toLocaleString()}`),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'center', gap: '16px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' },
        },
          React.createElement('span', null, `税抜: ¥${Math.floor(todayTotal / 1.1).toLocaleString()}`),
          React.createElement('span', { style: { color: 'var(--color-warning)' } }, `消費税: ¥${(todayTotal - Math.floor(todayTotal / 1.1)).toLocaleString()}`)
        ),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4 },
        },
          React.createElement('span', null, `${todayEntries.filter(e => !isCouponSubEntry(e)).length}件`),
          React.createElement('span', null, '・'),
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: 2 } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 13 } }, 'group'),
            `${todayEntries.filter(e => !isCouponSubEntry(e)).reduce((sum, e) => sum + (parseInt(e.passengers) || 0), 0)}人`
          )
        )
      ),

      // 現金・未収・DIDI決済・Uber・割引 内訳
      ...(() => {
        const todayDiscountEntries = todayEntries.filter(e => (e.discountAmount || 0) > 0);
        const payCards = [
          { key: 'cash', label: '現金', icon: 'payments', entries: todayCashEntries, total: todayCash, color: 'var(--color-accent)', bg: 'rgba(26,115,232,0.08)', border: 'rgba(26,115,232,0.2)' },
          { key: 'uncollected', label: '未収', icon: 'pending', entries: todayUncollectedEntries, total: todayUncollected, color: 'var(--color-error)', bg: 'rgba(229,57,53,0.08)', border: 'rgba(229,57,53,0.2)' },
          { key: 'didi', label: 'DIDI決済', icon: 'smartphone', entries: todayDidiEntries, total: todayDidi, color: 'var(--color-warning)', bg: 'rgba(255,152,0,0.08)', border: 'rgba(255,152,0,0.2)' },
          { key: 'uber', label: 'Uber', icon: 'hail', entries: todayUberEntries, total: todayUber, color: '#fff', bg: 'rgba(0,0,0,0.15)', border: 'rgba(255,255,255,0.15)' },
          { key: 'ticket', label: 'チケット', icon: 'confirmation_number', entries: todayTicketPayEntries, total: todayTicketPay + todayDiscountCoupon.total, color: '#4fc3f7', bg: 'rgba(79,195,247,0.08)', border: 'rgba(79,195,247,0.2)', isTicket: true },
          { key: 'discount', label: '割引', icon: 'discount', entries: todayDiscountEntries, total: todayDiscount, color: '#ce93d8', bg: 'rgba(156,39,176,0.08)', border: 'rgba(156,39,176,0.2)', isDiscount: true },
        ];
        const gridEl = React.createElement('div', {
          key: 'pay-grid',
          className: 'grid grid--2',
          style: { marginBottom: 'var(--space-sm)' },
        },
          ...payCards.filter(c => !c.isDiscount || c.total > 0).map(c => React.createElement('div', {
            key: c.key,
            onClick: () => setExpandedPayment(expandedPayment === c.key ? null : c.key),
            style: { padding: '10px', borderRadius: 'var(--border-radius)', background: c.bg, border: `1px solid ${c.border}`, cursor: 'pointer', userSelect: 'none', transition: 'box-shadow 0.2s', boxShadow: expandedPayment === c.key ? `0 0 0 2px ${c.border}` : 'none' },
          },
            React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: c.color, fontWeight: 600, marginBottom: 6 },
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, c.icon),
                c.label,
                React.createElement('span', { style: { fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 } }, `${c.entries.length}件`)
              ),
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: 16, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expandedPayment === c.key ? 'rotate(180deg)' : 'rotate(0)' } }, 'expand_more')
            ),
            React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: c.color } },
              `¥${c.total.toLocaleString()}`
            ),
            !c.isDiscount && !c.isTicket && React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
              `税抜: ¥${Math.floor(c.total / 1.1).toLocaleString()}`
            ),
            !c.isDiscount && !c.isTicket && React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
              `消費税: ¥${(c.total - Math.floor(c.total / 1.1)).toLocaleString()}`
            ),
            c.isDiscount && todayDiscountEntries.length > 0 && React.createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 4 } },
              [
                todayDiscountDisability.count > 0 && `障害者割 ${todayDiscountDisability.count}件 ¥${todayDiscountDisability.total.toLocaleString()}`,
                todayDiscountLongDistance.count > 0 && `遠距離割 ${todayDiscountLongDistance.count}件 ¥${todayDiscountLongDistance.total.toLocaleString()}`,
              ].filter(Boolean).join(' / ') || '割引詳細'
            ),
            c.key === 'uncollected' && todayCouponUncollected > 0 && React.createElement('div', {
              style: { borderTop: '1px solid rgba(229,57,53,0.2)', marginTop: 4, paddingTop: 4 },
            },
              React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 2 } },
                React.createElement('span', null, `未収: ${todayPureUncollectedEntries.length}件 ¥${todayPureUncollected.toLocaleString()}`),
                React.createElement('span', { style: { color: '#a78bfa' } }, `クーポン: ¥${todayCouponUncollected.toLocaleString()}`)
              )
            ),
            c.isTicket && React.createElement('div', {
              style: { borderTop: '1px solid rgba(79,195,247,0.2)', marginTop: 4, paddingTop: 4 },
            },
              React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 2 } },
                todayTicketPayEntries.length > 0 && React.createElement('span', { style: { color: '#4fc3f7' } }, `チケット払: ${todayTicketPayEntries.length}件 ¥${todayTicketPay.toLocaleString()}`),
                todayDiscountCoupon.count > 0 && React.createElement('span', { style: { color: '#a78bfa' } }, `クーポン: ${todayDiscountCoupon.sheets}枚 ¥${todayDiscountCoupon.total.toLocaleString()}`)
              )
            )
          ))
        );
        // 展開中の内訳リスト
        const expandedCard = payCards.find(c => c.key === expandedPayment);
        const detailEl = expandedCard && expandedCard.entries.length > 0 ? React.createElement('div', {
          key: 'pay-detail',
          style: { marginBottom: 'var(--space-sm)', borderRadius: 'var(--border-radius)', background: 'rgba(255,255,255,0.03)', border: `1px solid ${expandedCard.border}`, overflow: 'hidden' },
        },
          React.createElement('div', {
            style: { padding: '8px 12px', background: expandedCard.bg, fontSize: 12, fontWeight: 700, color: expandedCard.color, display: 'flex', alignItems: 'center', gap: 6 },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 16 } }, 'receipt_long'),
            `${expandedCard.label} 内訳 （${expandedCard.entries.length}件）`
          ),
          ...expandedCard.entries
            .sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''))
            .map((e, i) => React.createElement('div', {
              key: e.id || i,
              style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' },
            },
              React.createElement('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 42 } }, e.pickupTime || '--:--'),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  (e.pickup || '?') + ' → ' + (e.dropoff || '?')
                ),
                (e.source || e.purpose) && React.createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 1 } },
                  [e.source, e.purpose].filter(Boolean).join(' / ')
                )
              ),
              React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: expandedCard.color, whiteSpace: 'nowrap' } },
                expandedCard.isDiscount
                  ? `¥${(e.discountAmount || 0).toLocaleString()}`
                  : `¥${(e.amount || 0).toLocaleString()}`
              ),
              expandedCard.isDiscount && e.discountType && React.createElement('span', { style: { fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 } },
                e.discountType.split(',').map(t => ({ disability: '障害者', longDistance: '遠距離' })[t] || t).join('/')
              )
            ))
        ) : expandedCard && expandedCard.entries.length === 0 ? React.createElement('div', {
          key: 'pay-detail',
          style: { marginBottom: 'var(--space-sm)', padding: '16px', borderRadius: 'var(--border-radius)', background: 'rgba(255,255,255,0.03)', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' },
        }, `${expandedCard.label}のデータはありません`) : null;
        return [gridEl, detailEl].filter(Boolean);
      })(),

      // DIDI+Uber合計
      React.createElement('div', {
        style: {
          padding: '12px', borderRadius: 'var(--border-radius)', marginBottom: 'var(--space-sm)',
          background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.25)',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: '#ffb74d', fontWeight: 600 },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'smartphone'),
            'DIDI+Uber合計',
            React.createElement('span', { style: { fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 } }, `${todayDidiEntries.length + todayUberEntries.length}件`)
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: '#ffb74d' } },
            `¥${(todayDidi + todayUber).toLocaleString()}`
          )
        ),
        React.createElement('div', {
          style: { display: 'flex', gap: '10px', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' },
        },
          todayDidi > 0 && React.createElement('span', null, `DIDI: ${todayDidiEntries.length}件 ¥${todayDidi.toLocaleString()}`),
          todayUber > 0 && React.createElement('span', null, `Uber: ${todayUberEntries.length}件 ¥${todayUber.toLocaleString()}`)
        )
      ),

      // 未収合計（クリックで内訳展開）
      React.createElement('div', {
        onClick: () => setExpandedPayment(expandedPayment === 'uncollected_total' ? null : 'uncollected_total'),
        style: {
          padding: '12px', borderRadius: 'var(--border-radius)', marginBottom: expandedPayment === 'uncollected_total' ? 0 : 'var(--space-sm)',
          background: 'rgba(156,39,176,0.08)', border: '1px solid rgba(156,39,176,0.25)',
          cursor: 'pointer', userSelect: 'none', transition: 'box-shadow 0.2s',
          boxShadow: expandedPayment === 'uncollected_total' ? '0 0 0 2px rgba(156,39,176,0.25)' : 'none',
          borderRadius: expandedPayment === 'uncollected_total' ? 'var(--border-radius) var(--border-radius) 0 0' : 'var(--border-radius)',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: '#ce93d8', fontWeight: 600 },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'account_balance'),
            '未収合計',
            React.createElement('span', { style: { fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 } }, `${todayUncollectedTotalCount}件`)
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: '#ce93d8' } },
              `¥${todayUncollectedTotal.toLocaleString()}`
            ),
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 16, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expandedPayment === 'uncollected_total' ? 'rotate(180deg)' : 'rotate(0)' } }, 'expand_more')
          )
        ),
        React.createElement('div', {
          style: { display: 'flex', gap: '10px', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' },
        },
          React.createElement('span', null, `未収: ${todayUncollectedEntries.length}件 ¥${todayUncollected.toLocaleString()}`),
          todayDidiEntries.length > 0 && React.createElement('span', null, `DIDI: ${todayDidiEntries.length}件 ¥${todayDidi.toLocaleString()}`),
          todayUberEntries.length > 0 && React.createElement('span', null, `Uber: ${todayUberEntries.length}件 ¥${todayUber.toLocaleString()}`),
          todayTicketPayEntries.length > 0 && React.createElement('span', null, `チケット: ${todayTicketPayEntries.length}件 ¥${todayTicketPay.toLocaleString()}`),
          todayDiscountDisability.count > 0 && React.createElement('span', null, `障害者割引: ${todayDiscountDisability.count}件 +¥${Math.abs(todayDiscountDisability.total).toLocaleString()}`),
          todayCouponUncollected > 0 && React.createElement('span', null, `うちクーポン: ¥${todayCouponUncollected.toLocaleString()}`)
        )
      ),
      // 未収合計の内訳リスト（クーポンサブは親にまとめる）
      expandedPayment === 'uncollected_total' && (() => {
        const _isCpn = (e) => e.paymentMethod === 'uncollected' && e.memo && e.memo.includes('クーポン未収');
        // クーポンサブを除外した一覧
        const allUncollected = [...todayUncollectedEntries.filter(e => !_isCpn(e)), ...todayDidiEntries, ...todayUberEntries, ...todayTicketPayEntries].sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''));
        // クーポンサブのparentIdマップ
        const cpnMap = {};
        todayCouponEntries.forEach(c => {
          if (c.couponParentId) { cpnMap[c.couponParentId] = c; return; }
          // parentId未設定 → 同日同乗車地同時刻でマッチ
          const p = todayEntries.find(e => e.id !== c.id && !_isCpn(e) && e.couponAmount > 0 && e.date === c.date && e.pickup === c.pickup && e.pickupTime === c.pickupTime);
          if (p) cpnMap[p.id] = c;
        });
        if (allUncollected.length === 0 && todayCouponEntries.length === 0) return React.createElement('div', {
          style: { marginBottom: 'var(--space-sm)', padding: '16px', borderRadius: '0 0 var(--border-radius) var(--border-radius)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(156,39,176,0.25)', borderTop: 'none', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' },
        }, '未収データはありません');
        // クーポン付き現金エントリもリストに含める
        const cashWithCoupon = todayEntries.filter(e => !_isCpn(e) && e.couponAmount > 0 && (e.paymentMethod || 'cash') === 'cash' && cpnMap[e.id]);
        const mergedList = [...allUncollected, ...cashWithCoupon].sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''));
        // 重複排除
        const seen = new Set();
        const uniqueList = mergedList.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });

        const payLabel = (e) => {
          if (cpnMap[e.id]) return '現金+クーポン';
          if (e.paymentMethod === 'ticket') return 'チケット';
          if (e.paymentMethod === 'didi') return 'DIDI';
          if (e.paymentMethod === 'uber' || e.source === 'Uber') return 'Uber';
          return '未収';
        };
        const payColor = (e) => {
          if (cpnMap[e.id]) return '#a78bfa';
          if (e.paymentMethod === 'ticket') return '#4fc3f7';
          if (e.paymentMethod === 'didi') return 'var(--color-warning)';
          if (e.paymentMethod === 'uber' || e.source === 'Uber') return '#fff';
          return 'var(--color-error)';
        };
        return React.createElement('div', {
          style: { marginBottom: 'var(--space-sm)', borderRadius: '0 0 var(--border-radius) var(--border-radius)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(156,39,176,0.25)', borderTop: 'none', overflow: 'hidden' },
        },
          ...uniqueList.map((e, i) => {
            const cpnSub = cpnMap[e.id];
            const displayAmt = cpnSub ? (e.amount || 0) + (cpnSub.amount || 0) : (e.amount || 0);
            return React.createElement('div', {
              key: e.id || i,
              style: { padding: '8px 12px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' },
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 42 } }, e.pickupTime || '--:--'),
                React.createElement('span', { style: { fontSize: 10, padding: '1px 6px', borderRadius: '4px', background: 'rgba(156,39,176,0.15)', color: payColor(e), fontWeight: 600, whiteSpace: 'nowrap' } }, payLabel(e)),
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    (e.pickup || '?') + ' → ' + (e.dropoff || '?')
                  ),
                  (e.source || e.purpose) && React.createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 1 } },
                    [e.source, e.purpose].filter(Boolean).join(' / ')
                  )
                ),
                React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: '#ce93d8', whiteSpace: 'nowrap' } }, `¥${displayAmt.toLocaleString()}`)
              ),
              cpnSub && React.createElement('div', { style: { marginLeft: 50, marginTop: 4, fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: '8px' } },
                React.createElement('span', { style: { color: '#66bb6a' } }, `現金¥${e.amount.toLocaleString()}`),
                React.createElement('span', { style: { color: '#ef5350' } }, `クーポン未収¥${cpnSub.amount.toLocaleString()}`)
              )
            );
          })
        );
      })(),

      // 割引内訳
      React.createElement('div', {
        style: { borderTop: '1px solid var(--border-color)', padding: '8px 0 4px' },
      },
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'center', gap: '12px', fontSize: 'var(--font-size-xs)', marginBottom: 6 },
        },
          React.createElement('span', { style: { color: '#a78bfa', fontWeight: 600 } },
            `割引合計: -¥${todayDiscount.toLocaleString()}`
          ),
          React.createElement('span', { style: { color: 'var(--text-muted)' } },
            `実収入: ¥${(todayTotal - todayDiscount).toLocaleString()}`
          )
        ),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'center', gap: '10px', fontSize: 11, flexWrap: 'wrap' },
        },
          React.createElement('span', { style: { color: '#a78bfa' } },
            `障害者割引: ${todayDiscountDisability.count}件 -¥${todayDiscountDisability.total.toLocaleString()}`
          ),
          React.createElement('span', { style: { color: '#a78bfa' } },
            `クーポン: ${todayDiscountCoupon.sheets}枚 -¥${todayDiscountCoupon.total.toLocaleString()}`
          )
        )
      ),

      // 遠距離割（独立表示）
      React.createElement('div', {
        style: {
          borderTop: '1px solid var(--border-color)', padding: '10px 12px',
          background: 'rgba(96,165,250,0.06)', borderRadius: '0 0 var(--border-radius) var(--border-radius)',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#60a5fa', fontWeight: 600 },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'route'),
            '遠距離割',
            React.createElement('span', { style: { fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' } }, `${todayDiscountLongDistance.count}件`)
          ),
          React.createElement('span', { style: { fontSize: '14px', fontWeight: 700, color: '#60a5fa' } },
            `¥${Math.abs(todayDiscountLongDistance.total).toLocaleString()}`
          )
        )
      ),

      // 件数内訳
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'center', gap: '12px', padding: '8px 0', borderTop: '1px solid var(--border-color)', fontSize: 'var(--font-size-xs)' },
      },
        React.createElement('span', { style: { color: 'var(--text-secondary)', fontWeight: 600 } },
          `本日: ${todayEntries.length}件`
        ),
        React.createElement('span', { style: { color: 'var(--color-accent)' } },
          `現金: ${todayCashEntries.length}件`
        ),
        React.createElement('span', { style: { color: 'var(--color-error)' } },
          `未収: ${todayUncollectedEntries.length}件`
        ),
        React.createElement('span', { style: { color: 'var(--color-warning)' } },
          `DIDI: ${todayDidiEntries.length}件`
        ),
        React.createElement('span', { style: { color: '#fff' } },
          `Uber: ${todayUberEntries.length}件`
        ),
        React.createElement('span', { style: { color: '#4fc3f7' } },
          `チケット: ${todayTicketPayEntries.length}件`
        ),
        React.createElement('span', { style: { color: 'var(--text-muted)' } },
          `当月${monthData.count}件 ¥${monthData.total.toLocaleString()}`
        )
      )
    ),



  );
};

})();
