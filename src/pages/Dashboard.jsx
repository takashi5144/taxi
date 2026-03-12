(function() {
// Dashboard.jsx - ダッシュボード（DataServiceからリアルタイムデータ取得）
window.DashboardPage = () => {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;
  const { navigate, geminiApiKey } = useAppContext();
  const { currentPosition, isTracking } = useMapContext();
  const geo = useGeolocation();

  // 日種別フィルタ: null=全て, 'weekday'=平日, 'holiday'=土日祝
  const [dayTypeFilter, setDayTypeFilter] = useState(null);

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
  const overallSummary = useMemo(() => DataService.getOverallSummary(), [refreshKey]);

  const hourlyRate = useMemo(() => {
    if (todaySummary.workMinutes > 0 && todaySummary.rideCount >= 1) {
      return Math.round(todaySummary.totalAmount / (todaySummary.workMinutes / 60));
    }
    return null;
  }, [refreshKey]);

  const utilization = useMemo(() => DataService.getUtilizationRate(), [refreshKey]);
  const goalProgress = useMemo(() => DataService.getGoalProgress(), [refreshKey]);
  const topAreas = useMemo(() => DataService.getTopPickupAreasForNow(dayTypeFilter), [refreshKey, dayTypeFilter]);
  const topPickupClusters = useMemo(() => DataService.getTopPickupClusters(), [refreshKey]);
  // タイムライン時間帯選択
  const [timelineHour, setTimelineHour] = useState(new Date().getHours());
  const timelineClusters = useMemo(() => DataService.getPickupClustersByHour(timelineHour), [refreshKey, timelineHour]);
  const frequentSpots = useMemo(() => DataService.getFrequentPickupSpots({ dayType: dayTypeFilter }), [refreshKey, dayTypeFilter]);
  const frequentSpotsNow = useMemo(() => DataService.getFrequentPickupSpots({ forNow: true, dayType: dayTypeFilter }), [refreshKey, dayTypeFilter]);
  // 機能8: 逆ジオコーディング（非同期）
  const [spotsWithGeoNames, setSpotsWithGeoNames] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setSpotsWithGeoNames(null); // refreshKey変更時に古いデータをクリア
    DataService.getFrequentPickupSpotsWithNames({ dayType: dayTypeFilter }).then(result => {
      if (!cancelled) setSpotsWithGeoNames(result);
    });
    return () => { cancelled = true; };
  }, [refreshKey, dayTypeFilter]);
  // 表示用: geoName があればそちらを優先
  const displaySpots = useMemo(() => {
    const base = frequentSpots;
    if (!spotsWithGeoNames) return base;
    return base.map((s, i) => {
      const geo = spotsWithGeoNames[i];
      return geo && geo.geoName ? { ...s, displayName: geo.geoName, originalName: s.name } : s;
    });
  }, [frequentSpots, spotsWithGeoNames]);
  // スポット詳細の展開状態（修正7: refreshKeyでリセットしない）
  const expandedSpotIdxRef = useRef(null);
  const [expandedSpotIdx, setExpandedSpotIdx] = useState(null);
  const stableSetExpandedSpotIdx = useCallback((v) => { expandedSpotIdxRef.current = v; setExpandedSpotIdx(v); }, []);
  // 修正6: 全期間スポット初期5件表示
  const [showAllSpots, setShowAllSpots] = useState(false);
  // 改善1: topAreas + frequentSpotsNow を統合した「今おすすめスポット」
  const mergedNowSpots = useMemo(() => {
    const merged = [];
    const usedNames = new Set();
    topAreas.forEach(a => {
      merged.push({ name: a.name, count: a.count, avgAmount: a.avg, tags: ['高単価'] });
      usedNames.add(a.name);
    });
    frequentSpotsNow.forEach(s => {
      const dup = [...usedNames].find(n => n.includes(s.name) || s.name.includes(n));
      if (dup) {
        const ex = merged.find(m => m.name === dup);
        if (ex && !ex.tags.includes('頻出')) { ex.tags.push('頻出'); ex.count = Math.max(ex.count, s.count); }
      } else {
        merged.push({ name: s.name, count: s.count, avgAmount: s.avgAmount, tags: ['頻出'] });
        usedNames.add(s.name);
      }
    });
    return merged.slice(0, 5);
  }, [topAreas, frequentSpotsNow]);
  const eventAlerts = useMemo(() => DataService.getUpcomingEventAlerts(), [refreshKey]);

  // 待機スポット需要指数
  const waitingSpotData = useMemo(() => DataService.getWaitingSpotDemandIndex(), [refreshKey]);
  const revenueForecast = useMemo(() => DataService.getWaitingSpotRevenueForecast(), [refreshKey]);

  // 流しエリア需要指数
  const cruisingAreaData = useMemo(() => DataService.getCruisingAreaDemandIndex(), [refreshKey]);

  // 日勤集客強化: 病院・天気・タイムライン・アクション提案
  const hospitalData = useMemo(() => DataService.getHospitalScheduleData(), [refreshKey]);
  const [weatherImpact, setWeatherImpact] = useState(null);
  const weatherFetchIdRef = useRef(0);
  useEffect(() => {
    const fetchId = ++weatherFetchIdRef.current;
    GpsLogService.fetchHourlyForecast().then(forecast => {
      if (fetchId === weatherFetchIdRef.current) {
        setWeatherImpact(DataService.getWeatherDemandImpact(forecast));
      }
    }).catch(() => {});
    return () => { weatherFetchIdRef.current++; };
  }, [refreshKey]);
  const dayShiftScore = useMemo(() => DataService.getDayShiftDemandScore(weatherImpact), [refreshKey, weatherImpact]);
  const timeline = useMemo(() => DataService.getDayShiftTimeline(weatherImpact), [refreshKey, weatherImpact]);
  const nextAction = useMemo(() => DataService.getNextOptimalAction(currentPosition, weatherImpact), [refreshKey, weatherImpact, currentPosition]);
  const strategyData = useMemo(() => DataService.getStrategySimulation(new Date().getHours()), [refreshKey]);
  const [strategyHour, setStrategyHour] = useState(new Date().getHours());
  const strategyForHour = useMemo(() => DataService.getStrategySimulation(strategyHour), [refreshKey, strategyHour]);
  const slowPeriodRoutes = useMemo(() => DataService.getSlowPeriodCruisingRoutes(), [refreshKey, weatherImpact]);
  const waitVsCruise = useMemo(() => DataService.getWaitingVsCruisingEfficiency(dayTypeFilter), [refreshKey, dayTypeFilter]);
  const [standbyAnalysis, setStandbyAnalysis] = useState(null);
  const [standbyAnalysisLoading, setStandbyAnalysisLoading] = useState(false);
  const [standbyDetailPlace, setStandbyDetailPlace] = useState(null);
  const [cruisingPerf, setCruisingPerf] = useState(null);
  const [cruisingPerfLoading, setCruisingPerfLoading] = useState(false);
  const [cruisingDetailArea, setCruisingDetailArea] = useState(null);

  // 時間帯別実車グラフ
  const [hourlyMode, setHourlyMode] = useState('month'); // 'month' | 'all'
  const hourlyOccupancy = useMemo(() => DataService.getHourlyOccupancy(hourlyMode), [refreshKey, hourlyMode]);

  // エリア別レコメンド
  const areaRecommendation = useMemo(() => DataService.getAreaRecommendation(), [refreshKey]);

  // 日次レポート
  const dailyReport = useMemo(() => DataService.getDailyReport(), [refreshKey]);

  // 空車対策レコメンド
  const vacancyAdvice = useMemo(() => DataService.getVacancyCountermeasures(), [refreshKey]);

  // 待機場所分析のロード（リクエストIDで競合防止）
  const standbyFetchIdRef = useRef(0);
  useEffect(() => {
    if (!window.GpsLogService) return;
    const fetchId = ++standbyFetchIdRef.current;
    setStandbyAnalysisLoading(true);
    GpsLogService.getStandbyLocationAnalysis().then(data => {
      if (fetchId === standbyFetchIdRef.current) {
        setStandbyAnalysis(data);
        setStandbyAnalysisLoading(false);
      }
    }).catch(() => {
      if (fetchId === standbyFetchIdRef.current) setStandbyAnalysisLoading(false);
    });
  }, [refreshKey]);

  // 流しエリア分析のロード（リクエストIDで競合防止）
  const cruisingFetchIdRef = useRef(0);
  useEffect(() => {
    if (!window.GpsLogService || !GpsLogService.getCruisingAreaPerformance) return;
    const fetchId = ++cruisingFetchIdRef.current;
    setCruisingPerfLoading(true);
    GpsLogService.getCruisingAreaPerformance().then(data => {
      if (fetchId === cruisingFetchIdRef.current) {
        setCruisingPerf(data);
        setCruisingPerfLoading(false);
      }
    }).catch(() => {
      if (fetchId === cruisingFetchIdRef.current) setCruisingPerfLoading(false);
    });
  }, [refreshKey]);

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
      }
      const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
      const activeBreak = breaks.find(b => !b.endTime);
      if (activeBreak) {
        setBreakInfo({ active: true, startTime: activeBreak.startTime });
      }
    } catch (e) {
      AppLogger.warn('シフト/休憩データの読み込みに失敗', e.message);
    }
  }, []);

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
      // 休憩中なら終了させる
      if (breakInfo.active) {
        const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
        const ab = breaks.find(b => !b.endTime);
        if (ab) ab.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
        DataService.syncBreaksToCloud();
        setBreakInfo({ active: false, startTime: null });
      }
      const newShift = { id: Date.now().toString(), startTime: now.toISOString(), endTime: null };
      shifts.push(newShift);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
      DataService.syncShiftsToCloud();
      setShiftInfo({ active: true, startTime: now.toISOString() });
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      // GPS追跡を開始
      if (!geo.isTracking) geo.startTracking();
      GpsLogService.startWeatherPolling();
      AppLogger.info(`始業: ${now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      AppLogger.error('始業処理に失敗', e.message);
    }
  }, [breakInfo.active, geo]);

  const handleShiftEnd = useCallback(() => {
    try {
      const now = new Date();
      // 休憩中なら終了させる
      if (breakInfo.active) {
        const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
        const ab = breaks.find(b => !b.endTime);
        if (ab) ab.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
        DataService.syncBreaksToCloud();
        setBreakInfo({ active: false, startTime: null });
      }
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const activeShift = shifts.find(s => !s.endTime);
      if (activeShift) {
        activeShift.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
        DataService.syncShiftsToCloud();
        AppLogger.info(`終業: ${now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
      }
      setShiftInfo({ active: false, startTime: null });
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      // 未確定の空車待機を記録してからGPS追跡を停止
      if (window.GpsLogService && GpsLogService.flushRealtimeStandby) GpsLogService.flushRealtimeStandby();
      if (geo.isTracking) geo.stopTracking();
      GpsLogService.stopWeatherPolling();
      AppLogger.info('GPS追跡を停止（終業）');
    } catch (e) {
      AppLogger.error('終業処理に失敗', e.message);
    }
  }, [breakInfo.active, geo]);

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
  const dailySchedule = useMemo(() => DataService.getDailyDemandSchedule(), [refreshKey]);
  const [demandPlanLoading, setDemandPlanLoading] = useState(false);
  const demandPlanFetched = useRef(false);
  const demandPlanLoadingRef = useRef(false);

  const handleFetchDemandPlan = useCallback(async () => {
    if (!geminiApiKey || demandPlanLoadingRef.current) return;
    demandPlanLoadingRef.current = true;
    setDemandPlanLoading(true);
    const result = await GeminiService.fetchDailyDemandPlan(geminiApiKey, '旭川');
    if (result.success && result.data) {
      const today = new Date().toISOString().slice(0, 10);
      AppStorage.set(APP_CONSTANTS.STORAGE_KEYS.DAILY_DEMAND_PLAN, { date: today, data: result.data, fetchedAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('taxi-data-changed', { detail: { type: 'demand-plan' } }));
    }
    demandPlanLoadingRef.current = false;
    setDemandPlanLoading(false);
  }, [geminiApiKey]);

  // Gemini APIキーがありプランが未取得なら初回自動fetch
  useEffect(() => {
    if (geminiApiKey && !dailySchedule.available && !demandPlanFetched.current) {
      demandPlanFetched.current = true;
      handleFetchDemandPlan();
    }
  }, [geminiApiKey, dailySchedule.available, handleFetchDemandPlan]);

  // 本日の売上合計用データ（Revenue.jsxから移動）
  const todayEntries = todaySummary.entries || [];
  const todayTotal = todayEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const todayCashEntries = todayEntries.filter(e => (e.paymentMethod || 'cash') === 'cash' && e.source !== 'Uber');
  const todayUncollectedEntries = todayEntries.filter(e => e.paymentMethod === 'uncollected');
  const todayDidiEntries = todayEntries.filter(e => e.paymentMethod === 'didi');
  const todayUberEntries = todayEntries.filter(e => e.paymentMethod === 'uber' || e.source === 'Uber');
  const todayCash = todayCashEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayUncollected = todayUncollectedEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayDidi = todayDidiEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayUber = todayUberEntries.reduce((sum, e) => sum + e.amount, 0);
  const todayDiscount = todayEntries.reduce((sum, e) => sum + (e.discountAmount || 0), 0);
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
  const todayUncollectedTotal = todayUncollected + todayDidi + todayUber + Math.abs(todayDiscountDisability.total) + Math.abs(todayDiscountLongDistance.total) + Math.abs(todayDiscountCoupon.total) + Math.abs(todayDiscountTicket.total);
  const todayUncollectedTotalCount = todayUncollectedEntries.length + todayDidiEntries.length + todayUberEntries.length + todayDiscountDisability.count + todayDiscountLongDistance.count + todayDiscountCoupon.count + todayDiscountTicket.count;
  const todayCouponEntries = todayUncollectedEntries.filter(e => e.memo && e.memo.includes('クーポン未収'));
  const todayCouponUncollected = todayCouponEntries.reduce((sum, e) => sum + e.amount, 0);
  const currentMonth = getLocalDateString().slice(0, 7);
  const allEntries = useMemo(() => DataService.getEntries(), [refreshKey]);
  const monthEntries = allEntries.filter(e => (e.date || e.timestamp.split('T')[0]).startsWith(currentMonth));
  const monthTotal = monthEntries.reduce((sum, e) => sum + e.amount, 0);

  const quickActions = [
    { label: '地図を開く', icon: 'map', page: 'map', color: 'var(--color-primary)' },
    { label: '売上を記録', icon: 'add_circle', page: 'revenue', color: 'var(--color-accent)' },
    { label: '分析を見る', icon: 'analytics', page: 'analytics', color: 'var(--color-secondary)' },
    { label: '開発者ツール', icon: 'code', page: 'dev', color: 'var(--color-warning)' },
  ];

  return React.createElement('div', null,
    // タイトル
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'dashboard'),
      'ダッシュボード'
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

    // GPS状態
    React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)', padding: 'var(--space-md)' },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '24px', color: isTracking ? 'var(--color-accent)' : 'var(--text-muted)' },
        }, isTracking ? 'gps_fixed' : 'gps_off'),
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } },
            isTracking ? 'GPS追跡中' : 'GPS未接続'
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } },
            currentPosition
              ? `${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)}`
              : '地図ページでGPSを有効にしてください'
          )
        )
      )
    ),

    // 日種別フィルタ切替
    React.createElement('div', {
      style: {
        display: 'flex', gap: '4px', marginBottom: 'var(--space-md)',
        background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '4px',
      },
    },
      [
        { key: null, label: '全て' },
        { key: 'weekday', label: '平日' },
        { key: 'holiday', label: '土日祝' },
      ].map(opt =>
        React.createElement('button', {
          key: String(opt.key),
          onClick: () => setDayTypeFilter(opt.key),
          style: {
            flex: 1, padding: '8px 0', border: 'none', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-family)',
            background: dayTypeFilter === opt.key ? 'rgba(26,115,232,0.2)' : 'transparent',
            color: dayTypeFilter === opt.key ? 'var(--color-primary-light)' : 'var(--text-muted)',
            transition: 'all 0.2s ease',
          },
        }, opt.label)
      )
    ),

    // フィルタ表示ラベル
    dayTypeFilter && React.createElement('div', {
      style: { marginBottom: 'var(--space-sm)', fontSize: '12px', color: 'var(--color-primary-light)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'filter_alt'),
      dayTypeFilter === 'weekday' ? '平日データで分析中' : '土日祝データで分析中'
    ),

    // リアルタイム時給
    hourlyRate !== null && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(249,168,37,0.15), rgba(255,152,0,0.08))',
        border: '1px solid rgba(249,168,37,0.3)',
        textAlign: 'center',
      },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '28px', color: 'var(--color-secondary)' } }, 'speed'),
        React.createElement('span', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, 'リアルタイム時給')
      ),
      React.createElement('div', {
        style: { fontSize: '2rem', fontWeight: 700, color: 'var(--color-secondary)' },
      }, `¥${hourlyRate.toLocaleString()}/h`)
    ),

    // 本日の売上合計（Revenue.jsxから移動）
    React.createElement(Card, { style: { marginBottom: 'var(--space-lg)' } },
      // 合計金額セクション
      React.createElement('div', { style: { textAlign: 'center', paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-sm)', borderBottom: '1px solid var(--border-color)' } },
        React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 4 } }, '本日の売上合計'),
        React.createElement('div', {
          style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-secondary)', margin: '4px 0' },
        }, `¥${todayTotal.toLocaleString()}`),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'center', gap: '16px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' },
        },
          React.createElement('span', null, `税抜: ¥${Math.floor(todayTotal / 1.1).toLocaleString()}`),
          React.createElement('span', { style: { color: 'var(--color-warning)' } }, `消費税: ¥${(todayTotal - Math.floor(todayTotal / 1.1)).toLocaleString()}`)
        )
      ),

      // 現金・未収・DIDI決済・Uber 内訳
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' },
      },
        // 現金
        React.createElement('div', {
          style: { padding: '10px', borderRadius: 'var(--border-radius)', background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.2)' },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-accent)', fontWeight: 600, marginBottom: 6 },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'payments'),
            '現金'
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-accent)' } },
            `¥${todayCash.toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
            `税抜: ¥${Math.floor(todayCash / 1.1).toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
            `消費税: ¥${(todayCash - Math.floor(todayCash / 1.1)).toLocaleString()}`
          )
        ),
        // 未収
        React.createElement('div', {
          style: { padding: '10px', borderRadius: 'var(--border-radius)', background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)' },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-error)', fontWeight: 600, marginBottom: 6 },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'pending'),
            '未収'
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-error)' } },
            `¥${todayUncollected.toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
            `税抜: ¥${Math.floor(todayUncollected / 1.1).toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
            `消費税: ¥${(todayUncollected - Math.floor(todayUncollected / 1.1)).toLocaleString()}`
          ),
          todayCouponUncollected > 0 && React.createElement('div', {
            style: { borderTop: '1px solid rgba(229,57,53,0.2)', marginTop: 4, paddingTop: 4 },
          },
            React.createElement('div', { style: { fontSize: 11, color: '#a78bfa', fontWeight: 600 } },
              `うちクーポン未収: ¥${todayCouponUncollected.toLocaleString()}`
            )
          )
        ),
        // DIDI決済
        React.createElement('div', {
          style: { padding: '10px', borderRadius: 'var(--border-radius)', background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)' },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)', fontWeight: 600, marginBottom: 6 },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'smartphone'),
            'DIDI決済',
            React.createElement('span', { style: { fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 } }, `${todayDidiEntries.length}件`)
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-warning)' } },
            `¥${todayDidi.toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
            `税抜: ¥${Math.floor(todayDidi / 1.1).toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
            `消費税: ¥${(todayDidi - Math.floor(todayDidi / 1.1)).toLocaleString()}`
          )
        ),
        // Uber
        React.createElement('div', {
          style: { padding: '10px', borderRadius: 'var(--border-radius)', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.15)' },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: '#fff', fontWeight: 600, marginBottom: 6 },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'hail'),
            'Uber',
            React.createElement('span', { style: { fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 } }, `${todayUberEntries.length}件`)
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: '#fff' } },
            `¥${todayUber.toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } },
            `税抜: ¥${Math.floor(todayUber / 1.1).toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
            `消費税: ¥${(todayUber - Math.floor(todayUber / 1.1)).toLocaleString()}`
          )
        )
      ),

      // 未収合計
      React.createElement('div', {
        style: {
          padding: '12px', borderRadius: 'var(--border-radius)', marginBottom: 'var(--space-sm)',
          background: 'rgba(156,39,176,0.08)', border: '1px solid rgba(156,39,176,0.25)',
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
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: '#ce93d8' } },
            `¥${todayUncollectedTotal.toLocaleString()}`
          )
        ),
        React.createElement('div', {
          style: { display: 'flex', gap: '10px', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' },
        },
          React.createElement('span', null, `未収: ${todayUncollectedEntries.length}件 ¥${todayUncollected.toLocaleString()}`),
          React.createElement('span', null, `DIDI: ${todayDidiEntries.length}件 ¥${todayDidi.toLocaleString()}`),
          React.createElement('span', null, `Uber: ${todayUberEntries.length}件 ¥${todayUber.toLocaleString()}`),
          React.createElement('span', null, `障害者割引: ${todayDiscountDisability.count}件 ¥${Math.abs(todayDiscountDisability.total).toLocaleString()}`),
          todayDiscountLongDistance.count > 0 && React.createElement('span', null, `遠距離割: ${todayDiscountLongDistance.count}件 ¥${Math.abs(todayDiscountLongDistance.total).toLocaleString()}`),
          todayDiscountCoupon.count > 0 && React.createElement('span', null, `クーポン: ¥${Math.abs(todayDiscountCoupon.total).toLocaleString()}${todayDiscountCoupon.sheets ? ` (${todayDiscountCoupon.sheets}枚)` : ''}`),
          todayDiscountTicket.count > 0 && React.createElement('span', null, `チケット: ¥${Math.abs(todayDiscountTicket.total).toLocaleString()}${todayDiscountTicket.sheets ? ` (${todayDiscountTicket.sheets}枚)` : ''}`)
        )
      ),

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
          todayDiscountLongDistance.count > 0 && React.createElement('span', { style: { color: '#a78bfa' } },
            `遠距離割: ${todayDiscountLongDistance.count}件 -¥${todayDiscountLongDistance.total.toLocaleString()}`
          ),
          React.createElement('span', { style: { color: '#a78bfa' } },
            `クーポン: ${todayDiscountCoupon.sheets}枚 -¥${todayDiscountCoupon.total.toLocaleString()}`
          ),
          React.createElement('span', { style: { color: '#a78bfa' } },
            `チケット: ${todayDiscountTicket.count}件 -¥${todayDiscountTicket.total.toLocaleString()}`
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
        React.createElement('span', { style: { color: 'var(--text-muted)' } },
          `当月${monthEntries.length}件 ¥${monthTotal.toLocaleString()}`
        )
      )
    ),

    // 目標ペーストラッカー
    goalProgress && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: goalProgress.dailyRate >= 100
          ? 'linear-gradient(135deg, rgba(76,175,80,0.15), rgba(76,175,80,0.05))'
          : 'linear-gradient(135deg, rgba(33,150,243,0.15), rgba(33,150,243,0.05))',
        border: goalProgress.dailyRate >= 100
          ? '1px solid rgba(76,175,80,0.3)'
          : '1px solid rgba(33,150,243,0.3)',
      },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: goalProgress.dailyRate >= 100 ? '#4CAF50' : '#2196F3' } },
          goalProgress.dailyRate >= 100 ? 'emoji_events' : 'flag'
        ),
        React.createElement('span', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, '日額目標進捗')
      ),
      // プログレスバー
      React.createElement('div', { style: { background: 'rgba(255,255,255,0.1)', borderRadius: '8px', height: '12px', overflow: 'hidden', marginBottom: '8px' } },
        React.createElement('div', { style: {
          width: `${Math.min(goalProgress.dailyRate, 100)}%`,
          height: '100%', borderRadius: '8px',
          background: goalProgress.dailyRate >= 100 ? '#4CAF50' : '#2196F3',
          transition: 'width 0.5s ease',
        } })
      ),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)' } },
        React.createElement('span', null, `¥${goalProgress.todayAmount.toLocaleString()} / ¥${goalProgress.dailyGoal.toLocaleString()}`),
        React.createElement('span', { style: { fontWeight: 700, color: goalProgress.dailyRate >= 100 ? '#4CAF50' : '#2196F3' } }, `${goalProgress.dailyRate}%`)
      ),
      // 月間進捗
      goalProgress.monthDays > 0 && React.createElement('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } },
        `今月: ¥${goalProgress.monthAmount.toLocaleString()} / ¥${goalProgress.monthlyGoal.toLocaleString()} (${goalProgress.monthlyRate}%) — ${goalProgress.monthDays}日稼働`
      )
    ),

    // ============================================================
    // エリアレコメンド（今どこに行くべきか）
    // ============================================================
    areaRecommendation && areaRecommendation.ranking.length >= 2 && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(59,130,246,0.08))',
        border: '1px solid rgba(16,185,129,0.25)',
      },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: '#10b981' } }, 'recommend'),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-sm)' } }, 'おすすめエリア')
        ),
        React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, 'schedule'),
          `${areaRecommendation.hour}時台 / ${areaRecommendation.isWeekend ? '休日' : '平日'}`
        )
      ),
      React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' } },
        `過去の実績(${areaRecommendation.totalEntries}件)から現在時間帯の効率を分析`
      ),
      // ランキング
      ...areaRecommendation.ranking.slice(0, 5).map((area, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        const barColor = i === 0 ? '#10b981' : i === 1 ? '#3b82f6' : i === 2 ? '#f59e0b' : 'rgba(255,255,255,0.2)';
        const maxRph = areaRecommendation.ranking[0].revenuePerHour || 1;
        const pct = Math.round((area.revenuePerHour / maxRph) * 100);
        return React.createElement('div', {
          key: area.areaId,
          style: {
            padding: '8px 10px', marginBottom: i < 4 ? '6px' : 0,
            borderRadius: '8px',
            background: i === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
            border: i === 0 ? '1px solid rgba(16,185,129,0.2)' : '1px solid transparent',
          },
        },
          // 上段: エリア名 + 時間あたり売上
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              medal && React.createElement('span', { style: { fontSize: '16px' } }, medal),
              !medal && React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted)', width: '20px', textAlign: 'center' } }, `${i + 1}`),
              React.createElement('span', { style: { fontWeight: 600, fontSize: '13px' } }, area.areaName)
            ),
            React.createElement('span', {
              style: { fontWeight: 700, fontSize: i === 0 ? '16px' : '13px', color: i === 0 ? '#10b981' : i < 3 ? '#fff' : 'var(--text-secondary)' },
            }, `¥${area.revenuePerHour.toLocaleString()}/h`)
          ),
          // プログレスバー
          React.createElement('div', { style: { background: 'rgba(255,255,255,0.06)', borderRadius: '3px', height: '4px', overflow: 'hidden', marginBottom: '4px' } },
            React.createElement('div', { style: { width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s' } })
          ),
          // 下段: 詳細
          React.createElement('div', { style: { display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap' } },
            React.createElement('span', null, `待機 ${area.avgWaitMin}分`),
            React.createElement('span', null, `平均 ¥${area.avgRevenue.toLocaleString()}`),
            React.createElement('span', null, `${area.count}件`),
            ...area.reasons.map((r, ri) =>
              React.createElement('span', {
                key: ri,
                style: { color: '#10b981', fontSize: '10px', background: 'rgba(16,185,129,0.1)', padding: '1px 5px', borderRadius: '3px' },
              }, r)
            )
          )
        );
      })
    ),

    // 実車率トラッキング
    utilization.rideCount >= 2 && React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)', padding: 'var(--space-lg)' },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: 'var(--color-accent)' } }, 'local_taxi'),
        React.createElement('span', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, '実車率')
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' } },
        React.createElement('span', { style: { fontSize: '2rem', fontWeight: 700, color: 'var(--color-accent)' } }, `${utilization.rate}%`),
        React.createElement('span', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } },
          `実車${utilization.occupiedMin}分 / 空車${utilization.vacantMin}分`
        )
      ),
      React.createElement('div', { style: { background: 'rgba(255,255,255,0.1)', borderRadius: '8px', height: '8px', overflow: 'hidden' } },
        React.createElement('div', { style: {
          width: `${utilization.rate}%`, height: '100%', borderRadius: '8px',
          background: utilization.rate >= 50 ? 'var(--color-accent)' : 'var(--color-warning)',
          transition: 'width 0.5s ease',
        } })
      ),
      // GPS実車率（cruisingPerfがある場合）
      cruisingPerf && cruisingPerf.overall && cruisingPerf.overall.totalMin > 0 && React.createElement('div', {
        style: { marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px', color: '#a855f7' } }, 'gps_fixed'),
          React.createElement('span', null, `GPS実車率（${cruisingPerf.overall.daysAnalyzed}日間）`)
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { style: { fontWeight: 700, color: cruisingPerf.overall.rate >= 40 ? '#10b981' : cruisingPerf.overall.rate >= 25 ? '#f59e0b' : '#ef4444' } },
            `${cruisingPerf.overall.rate}%`
          ),
          React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } },
            `${Math.round(cruisingPerf.overall.totalMin / 60)}h走行 ${cruisingPerf.overall.totalRides}回乗車`
          )
        )
      )
    ),

    // ============================================================
    // 時間帯別 実車/非実車グラフ
    // ============================================================
    (() => {
      if (!hourlyOccupancy || !hourlyOccupancy.hours) return null;
      const { hours, days } = hourlyOccupancy;
      const maxMin = Math.max(...hours.map(h => h.work), 1);
      const hasData = hours.some(h => h.work > 0);
      if (!hasData) return null;
      return React.createElement(Card, {
        style: { marginBottom: 'var(--space-md)', padding: 'var(--space-lg)' },
      },
        // ヘッダー
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '22px', color: '#10b981' } }, 'schedule'),
            React.createElement('span', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, '時間帯別 実車状況')
          ),
          // 切替ボタン
          React.createElement('div', { style: { display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px' } },
            ...['month', 'all'].map(m =>
              React.createElement('button', {
                key: m,
                onClick: () => setHourlyMode(m),
                style: {
                  padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 600,
                  background: hourlyMode === m ? 'var(--color-primary)' : 'transparent',
                  color: hourlyMode === m ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                },
              }, m === 'month' ? '当月' : '累計')
            )
          )
        ),
        React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' } },
          `${hourlyMode === 'month' ? '当月' : '全期間'} ${days}日間の1日平均`
        ),
        // 凡例
        React.createElement('div', { style: { display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '11px' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            React.createElement('div', { style: { width: '10px', height: '10px', borderRadius: '2px', background: '#10b981' } }),
            React.createElement('span', { style: { color: 'var(--text-secondary)' } }, '実車')
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            React.createElement('div', { style: { width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)' } }),
            React.createElement('span', { style: { color: 'var(--text-secondary)' } }, '非実車')
          )
        ),
        // グラフ（積み上げバー）
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'flex-end', gap: '1px', height: '140px', padding: '0 2px' },
        },
          ...hours.map((h, i) =>
            React.createElement('div', {
              key: i,
              style: { flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative' },
              title: `${h.label}: 実車${h.occupied}分 / 勤務${h.work}分`,
            },
              // 勤務時間バー（背景=非実車、前景=実車）
              h.work > 0 && React.createElement('div', {
                style: {
                  width: '100%',
                  height: `${Math.max((h.work / maxMin) * 100, 2)}%`,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '2px 2px 0 0',
                  position: 'relative',
                  overflow: 'hidden',
                },
              },
                h.occupied > 0 && React.createElement('div', {
                  style: {
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: `${(h.occupied / h.work) * 100}%`,
                    background: '#10b981',
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 0.3s ease',
                  },
                })
              )
            )
          )
        ),
        // 時間ラベル
        React.createElement('div', {
          style: { display: 'flex', gap: '1px', padding: '3px 2px 0', marginTop: '1px' },
        },
          ...hours.map((h, i) =>
            React.createElement('div', {
              key: i,
              style: { flex: 1, textAlign: 'center', fontSize: '8px', color: 'var(--text-muted)' },
            }, i % 3 === 0 ? `${h.hour}` : '')
          )
        ),
        // サマリー行
        (() => {
          const totalWork = hours.reduce((s, h) => s + h.work, 0);
          const totalOccupied = hours.reduce((s, h) => s + h.occupied, 0);
          const rate = totalWork > 0 ? Math.round((totalOccupied / totalWork) * 100) : 0;
          return React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-around', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '12px' },
          },
            React.createElement('div', { style: { textAlign: 'center' } },
              React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: '10px' } }, '平均勤務'),
              React.createElement('div', { style: { fontWeight: 600 } }, `${Math.floor(totalWork / 60)}h${totalWork % 60}m`)
            ),
            React.createElement('div', { style: { textAlign: 'center' } },
              React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: '10px' } }, '平均実車'),
              React.createElement('div', { style: { fontWeight: 600, color: '#10b981' } }, `${Math.floor(totalOccupied / 60)}h${totalOccupied % 60}m`)
            ),
            React.createElement('div', { style: { textAlign: 'center' } },
              React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: '10px' } }, '実車率'),
              React.createElement('div', { style: { fontWeight: 600, color: rate >= 50 ? '#10b981' : rate >= 30 ? '#f59e0b' : '#ef4444' } }, `${rate}%`)
            )
          );
        })()
      );
    })(),

    // ============================================================
    // 日次レポート（本日の振り返り・改善ポイント）
    // ============================================================
    dailyReport && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(168,85,247,0.06))',
        border: '1px solid rgba(99,102,241,0.25)',
      },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: '#818cf8' } }, 'assessment'),
        React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-sm)' } }, '本日のレポート')
      ),
      // メイン指標
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' } },
        ...[
          { label: '時給', value: `¥${dailyReport.revenuePerHour.toLocaleString()}`, color: '#818cf8' },
          { label: '実車率', value: `${dailyReport.occupancyRate}%`, color: dailyReport.occupancyRate >= 50 ? '#10b981' : '#f59e0b' },
          { label: '平均単価', value: `¥${dailyReport.avgFare.toLocaleString()}`, color: '#fff' },
        ].map((item, i) =>
          React.createElement('div', { key: i, style: { textAlign: 'center', padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' } },
            React.createElement('div', { style: { fontSize: '18px', fontWeight: 700, color: item.color } }, item.value),
            React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } }, item.label)
          )
        )
      ),
      // 過去比較
      dailyReport.comparison.revenueVsPast !== null && React.createElement('div', {
        style: { display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '11px', flexWrap: 'wrap' },
      },
        ...[
          { label: '売上', diff: dailyReport.comparison.revenueVsPast },
          { label: '件数', diff: dailyReport.comparison.ridesVsPast },
          { label: '単価', diff: dailyReport.comparison.fareVsPast },
        ].map((c, i) => {
          const up = c.diff >= 0;
          return React.createElement('div', {
            key: i,
            style: { display: 'flex', alignItems: 'center', gap: '3px', color: up ? '#10b981' : '#ef4444' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } },
              up ? 'arrow_upward' : 'arrow_downward'
            ),
            React.createElement('span', null, `${c.label} ${up ? '+' : ''}${c.diff}%`),
            React.createElement('span', { style: { color: 'var(--text-muted)' } }, `(${dailyReport.pastDayCount}日平均比)`)
          );
        })
      ),
      // 配車方法別
      dailyReport.sourceRanking.length >= 2 && React.createElement('div', {
        style: { marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
      },
        React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' } }, '配車方法別'),
        React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          ...dailyReport.sourceRanking.map((s, i) =>
            React.createElement('div', {
              key: i,
              style: {
                padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
                background: i === 0 ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                border: i === 0 ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.08)',
              },
            },
              React.createElement('span', { style: { fontWeight: 600 } }, s.source),
              React.createElement('span', { style: { color: 'var(--text-muted)', marginLeft: '4px' } },
                `${s.count}件 平均¥${s.avg.toLocaleString()}`
              )
            )
          )
        )
      ),
      // 改善ポイント
      dailyReport.insights.length > 0 && React.createElement('div', null,
        React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'lightbulb'),
          '改善ポイント'
        ),
        ...dailyReport.insights.map((insight, i) =>
          React.createElement('div', {
            key: i,
            style: {
              display: 'flex', gap: '8px', padding: '6px 8px', marginBottom: '4px',
              borderRadius: '6px', background: 'rgba(0,0,0,0.12)',
              borderLeft: `3px solid ${insight.color}`,
              fontSize: '12px',
            },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: insight.color, flexShrink: 0, marginTop: '1px' } }, insight.icon),
            React.createElement('div', null,
              React.createElement('div', null, insight.text),
              insight.suggestion && React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } },
                `→ ${insight.suggestion}`
              )
            )
          )
        )
      ),
      // 空車タイムライン（コンパクト版）
      dailyReport.vacantGaps.length > 0 && React.createElement('div', {
        style: { marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' },
      },
        React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' } }, '空車タイムライン'),
        React.createElement('div', { style: { display: 'flex', gap: '2px', height: '20px', borderRadius: '4px', overflow: 'hidden' } },
          ...(() => {
            // 乗車区間と空車区間をタイムライン表示
            const _t2m = (t) => { if (!t || !t.includes(':')) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
            const segments = [];
            const todaySorted = (todaySummary.entries || [])
              .filter(e => e.pickupTime && e.dropoffTime && !e.noPassenger)
              .sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''));
            // 全体の時間幅
            const times = [];
            todaySorted.forEach(e => {
              times.push(_t2m(e.pickupTime));
              times.push(_t2m(e.dropoffTime));
            });
            const minT = Math.min(...times.filter(t => t !== null));
            const maxT = Math.max(...times.filter(t => t !== null));
            const span = maxT - minT || 1;

            todaySorted.forEach((e, i) => {
              const p = _t2m(e.pickupTime);
              const d = _t2m(e.dropoffTime);
              if (p === null || d === null) return;
              // 空車区間（前のから今の乗車まで）
              if (i > 0) {
                const prevD = _t2m(todaySorted[i - 1].dropoffTime);
                if (prevD !== null && p > prevD) {
                  const vacW = ((p - prevD) / span) * 100;
                  segments.push(React.createElement('div', {
                    key: `v${i}`,
                    title: `空車 ${p - prevD}分`,
                    style: { width: `${vacW}%`, background: 'rgba(239,68,68,0.3)', minWidth: '2px' },
                  }));
                }
              }
              // 実車区間
              const occW = ((d - p) / span) * 100;
              segments.push(React.createElement('div', {
                key: `o${i}`,
                title: `実車 ${d - p}分 ¥${e.amount.toLocaleString()}`,
                style: { width: `${occW}%`, background: '#10b981', minWidth: '2px' },
              }));
            });
            return segments;
          })()
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' } },
          React.createElement('span', null, (() => {
            const t = (todaySummary.entries || []).filter(e => e.pickupTime).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
            return t.length > 0 ? t[0].pickupTime : '';
          })()),
          React.createElement('span', { style: { display: 'flex', gap: '8px' } },
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '2px' } },
              React.createElement('span', { style: { width: '8px', height: '8px', background: '#10b981', borderRadius: '2px', display: 'inline-block' } }),
              '実車'
            ),
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '2px' } },
              React.createElement('span', { style: { width: '8px', height: '8px', background: 'rgba(239,68,68,0.3)', borderRadius: '2px', display: 'inline-block' } }),
              '空車'
            )
          ),
          React.createElement('span', null, (() => {
            const t = (todaySummary.entries || []).filter(e => e.dropoffTime).sort((a, b) => b.dropoffTime.localeCompare(a.dropoffTime));
            return t.length > 0 ? t[0].dropoffTime : '';
          })())
        )
      )
    ),

    // ============================================================
    // 待機 vs 流し 効率比較カード
    // ============================================================
    waitVsCruise && waitVsCruise.totalRides >= 5 && (waitVsCruise.waiting.count >= 2 || waitVsCruise.cruising.count >= 2) && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: waitVsCruise.recommendationType === 'waiting'
          ? 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(16,185,129,0.06))'
          : waitVsCruise.recommendationType === 'cruising'
            ? 'linear-gradient(135deg, rgba(168,85,247,0.10), rgba(245,158,11,0.06))'
            : 'linear-gradient(135deg, rgba(107,114,128,0.08), rgba(59,130,246,0.06))',
        border: waitVsCruise.recommendationType === 'waiting'
          ? '1px solid rgba(59,130,246,0.3)'
          : waitVsCruise.recommendationType === 'cruising'
            ? '1px solid rgba(168,85,247,0.3)'
            : '1px solid rgba(107,114,128,0.2)',
      },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: '#10b981' } }, 'analytics'),
        React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-md)' } }, '待機 vs 流し 効率比較')
      ),

      // 比較テーブル
      React.createElement('div', { style: { overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' } },
        React.createElement('table', { style: { borderCollapse: 'collapse', fontSize: '11px', width: '100%' } },
          React.createElement('thead', null,
            React.createElement('tr', null,
              ...['', '待機', '流し', '配車アプリ'].map(label =>
                React.createElement('th', {
                  key: label || 'h',
                  style: { padding: '6px 8px', fontWeight: 700, textAlign: label ? 'center' : 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap',
                    color: label === '待機' ? '#3b82f6' : label === '流し' ? '#a855f7' : label === '配車アプリ' ? '#f59e0b' : 'var(--text-primary)' },
                }, label || '指標')
              )
            )
          ),
          React.createElement('tbody', null,
            // 乗車回数
            React.createElement('tr', null,
              React.createElement('td', { style: { padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, '乗車回数'),
              ...[waitVsCruise.waiting, waitVsCruise.cruising, waitVsCruise.app].map((g, i) =>
                React.createElement('td', { key: i, style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                  g.count > 0 ? `${g.count}回` : '-'
                )
              )
            ),
            // 平均単価
            React.createElement('tr', null,
              React.createElement('td', { style: { padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, '平均単価'),
              ...[waitVsCruise.waiting, waitVsCruise.cruising, waitVsCruise.app].map((g, i) => {
                const best = Math.max(waitVsCruise.waiting.avgFare, waitVsCruise.cruising.avgFare, waitVsCruise.app.avgFare);
                const isBest = g.avgFare > 0 && g.avgFare === best;
                return React.createElement('td', { key: i, style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: isBest ? '#10b981' : 'var(--text-primary)' } },
                  g.avgFare > 0 ? `\u00A5${g.avgFare.toLocaleString()}` : '-'
                );
              })
            ),
            // 平均空車時間
            React.createElement('tr', null,
              React.createElement('td', { style: { padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, '平均空車時間'),
              ...[waitVsCruise.waiting, waitVsCruise.cruising, waitVsCruise.app].map((g, i) => {
                const vals = [waitVsCruise.waiting.avgVacantMin, waitVsCruise.cruising.avgVacantMin, waitVsCruise.app.avgVacantMin].filter(v => v !== null);
                const best = vals.length > 0 ? Math.min(...vals) : null;
                const isBest = g.avgVacantMin !== null && g.avgVacantMin === best;
                return React.createElement('td', { key: i, style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: isBest ? '#10b981' : 'var(--text-primary)' } },
                  g.avgVacantMin !== null ? `${g.avgVacantMin}分` : '-'
                );
              })
            ),
            // 推定時給
            React.createElement('tr', null,
              React.createElement('td', { style: { padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, '推定時給'),
              ...[waitVsCruise.waiting, waitVsCruise.cruising, waitVsCruise.app].map((g, i) => {
                const best = Math.max(waitVsCruise.waiting.hourlyRevenue, waitVsCruise.cruising.hourlyRevenue, waitVsCruise.app.hourlyRevenue);
                const isBest = g.hourlyRevenue > 0 && g.hourlyRevenue === best;
                return React.createElement('td', { key: i, style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: isBest ? '#10b981' : 'var(--text-primary)' } },
                  g.hourlyRevenue > 0 ? `\u00A5${g.hourlyRevenue.toLocaleString()}` : '-'
                );
              })
            ),
            // GPS実績行（データがある場合のみ表示）
            (waitVsCruise.gpsStandbyEfficiency || waitVsCruise.gpsCruisingEfficiency) && React.createElement('tr', { style: { background: 'rgba(16,185,129,0.04)' } },
              React.createElement('td', { style: { padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '10px', color: '#10b981' } },
                React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '10px' } }, 'gps_fixed'),
                  'GPS実績時給'
                )
              ),
              React.createElement('td', { style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#10b981', fontSize: '10px' } },
                waitVsCruise.gpsStandbyEfficiency ? `\u00A5${waitVsCruise.gpsStandbyEfficiency.avgHourlyRevenue.toLocaleString()}` : '-'
              ),
              React.createElement('td', { style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#10b981', fontSize: '10px' } },
                waitVsCruise.gpsCruisingEfficiency ? `\u00A5${waitVsCruise.gpsCruisingEfficiency.avgHourlyRevenue.toLocaleString()}` : '-'
              ),
              React.createElement('td', { style: { padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '10px', color: 'var(--text-muted)' } }, '-')
            )
          )
        )
      ),

      // 推奨アクション
      React.createElement('div', {
        style: {
          padding: '10px 12px', borderRadius: '8px',
          background: waitVsCruise.recommendationType === 'waiting' ? 'rgba(59,130,246,0.1)' : waitVsCruise.recommendationType === 'cruising' ? 'rgba(168,85,247,0.1)' : 'rgba(107,114,128,0.08)',
          border: `1px solid ${waitVsCruise.recommendationType === 'waiting' ? 'rgba(59,130,246,0.2)' : waitVsCruise.recommendationType === 'cruising' ? 'rgba(168,85,247,0.2)' : 'rgba(107,114,128,0.15)'}`,
          marginBottom: '10px',
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: waitVsCruise.recommendationType === 'waiting' ? '#3b82f6' : waitVsCruise.recommendationType === 'cruising' ? '#a855f7' : '#6b7280' } },
            waitVsCruise.recommendationType === 'waiting' ? 'pin_drop' : waitVsCruise.recommendationType === 'cruising' ? 'directions_car' : 'info'
          ),
          React.createElement('span', { style: { fontSize: '12px', fontWeight: 600 } }, waitVsCruise.recommendation)
        )
      ),

      // 時間帯別ミニ棒グラフ（待機vs流し件数比較）
      (() => {
        const hours = waitVsCruise.hourlyComparison.filter(h => h.waitingCount > 0 || h.cruisingCount > 0);
        if (hours.length === 0) return null;
        const maxCount = Math.max(...hours.map(h => Math.max(h.waitingCount, h.cruisingCount)), 1);
        return React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' } }, '時間帯別 乗車件数'),
          React.createElement('div', { style: { display: 'flex', gap: '2px', alignItems: 'flex-end', height: '40px' } },
            ...hours.map(h =>
              React.createElement('div', { key: h.hour, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', justifyContent: 'flex-end', height: '100%' } },
                React.createElement('div', { style: { display: 'flex', gap: '1px', alignItems: 'flex-end', width: '100%', justifyContent: 'center', flex: 1 } },
                  React.createElement('div', { style: { width: '4px', height: `${Math.max(2, (h.waitingCount / maxCount) * 30)}px`, background: '#3b82f6', borderRadius: '1px' } }),
                  React.createElement('div', { style: { width: '4px', height: `${Math.max(2, (h.cruisingCount / maxCount) * 30)}px`, background: '#a855f7', borderRadius: '1px' } })
                ),
                React.createElement('span', { style: { fontSize: '8px', color: 'var(--text-muted)' } }, String(h.hour))
              )
            )
          ),
          React.createElement('div', { style: { display: 'flex', gap: '12px', marginTop: '4px', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)' } },
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
              React.createElement('span', { style: { width: '6px', height: '6px', borderRadius: '1px', background: '#3b82f6' } }), '待機'
            ),
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
              React.createElement('span', { style: { width: '6px', height: '6px', borderRadius: '1px', background: '#a855f7' } }), '流し'
            )
          )
        );
      })()
    ),

    // ============================================================
    // [NEW] 次の行動ヒーローカード (Feature 2)
    // ============================================================
    nextAction && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: nextAction.urgency === 'now'
          ? 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(249,115,22,0.10))'
          : nextAction.urgency === 'soon'
            ? 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(234,179,8,0.10))'
            : 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(59,130,246,0.10))',
        border: nextAction.urgency === 'now'
          ? '2px solid rgba(239,68,68,0.5)'
          : nextAction.urgency === 'soon'
            ? '2px solid rgba(245,158,11,0.4)'
            : '2px solid rgba(34,197,94,0.3)',
        animation: nextAction.urgency === 'now' ? 'pulse 2s ease-in-out infinite' : 'none',
      },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1 } },
          React.createElement('span', {
            className: 'material-icons-round',
            style: {
              fontSize: '36px',
              color: nextAction.urgency === 'now' ? '#ef4444' : nextAction.urgency === 'soon' ? '#f59e0b' : '#22c55e',
            },
          }, nextAction.action.includes('待機') ? 'pin_drop' : nextAction.action.includes('流し') ? 'directions_car' : 'navigation'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 800 } }, nextAction.action),
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '2px' } }, nextAction.reason),
            nextAction.estimatedWaitMin && nextAction.urgency !== 'plan' && React.createElement('span', {
              style: {
                display: 'inline-block', marginTop: '4px', fontSize: '10px', fontWeight: 700,
                padding: '2px 8px', borderRadius: '8px',
                background: nextAction.urgency === 'now' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                color: nextAction.urgency === 'now' ? '#fca5a5' : '#fcd34d',
              },
            }, `あと${nextAction.estimatedWaitMin}分`)
          )
        ),
        React.createElement('div', {
          style: {
            width: '52px', height: '52px', borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: nextAction.demandScore >= 70 ? 'rgba(239,68,68,0.2)' : nextAction.demandScore >= 50 ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.15)',
          },
        },
          React.createElement('span', {
            style: { fontSize: '20px', fontWeight: 800, color: nextAction.demandScore >= 70 ? '#ef4444' : nextAction.demandScore >= 50 ? '#f59e0b' : '#3b82f6' },
          }, String(nextAction.demandScore))
        )
      ),
      // alternatives
      nextAction.alternatives && nextAction.alternatives.length > 0 && React.createElement('div', {
        style: { marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' },
      },
        nextAction.alternatives.map((alt, i) =>
          React.createElement('div', {
            key: i,
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '11px', color: 'var(--text-secondary)' },
          },
            React.createElement('span', null, alt.action),
            React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `スコア${alt.demandScore}`)
          )
        )
      )
    ),

    // ============================================================
    // [NEW] 日勤タイムラインカード (Feature 1+7+8)
    // ============================================================
    React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.06))',
        border: '1px solid rgba(99,102,241,0.25)',
      },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: '#6366f1' } }, 'timeline'),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-md)' } }, '日勤タイムライン'),
          React.createElement('span', {
            style: {
              fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
              background: new Date().getDate() % 2 === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: new Date().getDate() % 2 === 0 ? '#22c55e' : '#ef4444',
            },
          }, new Date().getDate() % 2 === 0 ? '駅前OK' : '駅前不可')
        )
      ),

      // 天気予報ストリップ (7-17)
      weatherImpact && weatherImpact.upcoming && weatherImpact.upcoming.length > 0 && React.createElement('div', {
        style: { display: 'flex', gap: '2px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '2px' },
      },
        ...weatherImpact.upcoming.filter(u => u.hour >= 7 && u.hour <= 17).map(u => {
          const weatherIcon = u.weather.includes('雨') ? '雨' : u.weather.includes('雪') ? '雪' : u.weather.includes('曇') ? '曇' : '晴';
          return React.createElement('div', {
            key: `wstrip-${u.hour}`,
            style: {
              flex: '1 0 auto', minWidth: '28px', textAlign: 'center', padding: '3px 2px',
              borderRadius: '4px', fontSize: '9px',
              background: u.multiplier > 1.2 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
            },
          },
            React.createElement('div', { style: { fontWeight: 600, color: 'var(--text-muted)' } }, `${u.hour}`),
            React.createElement('div', { style: { fontSize: '11px' } }, weatherIcon),
            React.createElement('div', { style: { color: 'var(--text-muted)' } }, `${u.temp != null ? Math.round(u.temp) : '-'}°`)
          );
        })
      ),

      // タイムラインバー (7-17)
      React.createElement('div', { style: { position: 'relative', marginBottom: '12px' } },
        // セグメントバー
        React.createElement('div', { style: { display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', gap: '1px' } },
          ...Array.from({ length: 11 }, (_, i) => {
            const h = 7 + i;
            const hs = dayShiftScore.hourlyScores.find(s => s.hour === h);
            const score = hs ? hs.score : 0;
            const isPast = h < new Date().getHours();
            const bg = isPast ? 'rgba(107,114,128,0.2)' : score > 70 ? 'rgba(239,68,68,0.4)' : score > 40 ? 'rgba(245,158,11,0.35)' : 'rgba(59,130,246,0.25)';
            return React.createElement('div', {
              key: `seg-${h}`,
              style: { flex: 1, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 600, color: isPast ? '#6b7280' : '#fff' },
              title: `${h}時: スコア${score}`,
            }, h % 2 === 1 ? String(h) : '');
          })
        ),
        // 現在位置マーカー ▼
        new Date().getHours() >= 7 && new Date().getHours() <= 17 && React.createElement('div', {
          style: {
            position: 'absolute', top: '-10px',
            left: `${timeline.nowPosition * 100}%`, transform: 'translateX(-50%)',
            fontSize: '12px', color: '#6366f1', fontWeight: 800,
          },
        }, '\u25BC'),

        // イベントドット
        React.createElement('div', { style: { position: 'relative', height: '10px', marginTop: '2px' } },
          ...timeline.events.filter(e => !e.isPast).slice(0, 12).map(ev => {
            const pos = Math.max(0, Math.min(100, (ev.timeMin - 420) / 600 * 100));
            return React.createElement('div', {
              key: ev.id,
              style: {
                position: 'absolute', left: `${pos}%`, top: '0', transform: 'translateX(-50%)',
                width: '8px', height: '8px', borderRadius: '50%', background: ev.color,
              },
              title: `${ev.time} ${ev.title}`,
            });
          })
        )
      ),

      // 凡例
      React.createElement('div', {
        style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', justifyContent: 'center' },
      },
        ...[
          { label: 'バス', color: '#3b82f6' },
          { label: '病院', color: '#ef4444' },
          { label: 'ホテル', color: '#8b5cf6' },
          { label: 'イベント', color: '#f59e0b' },
          { label: '天気', color: '#06b6d4' },
        ].map(leg => React.createElement('span', {
          key: leg.label,
          style: { fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-muted)' },
        },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: leg.color, display: 'inline-block' } }),
          leg.label
        ))
      ),

      // 次の3イベント
      (() => {
        const upcoming = timeline.events.filter(e => !e.isPast).slice(0, 3);
        if (upcoming.length === 0) return React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' } }, '残りのイベントはありません');
        return React.createElement('div', { style: { borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' } },
          ...upcoming.map(ev => {
            const diff = ev.timeMin - (new Date().getHours() * 60 + new Date().getMinutes());
            return React.createElement('div', {
              key: ev.id,
              style: {
                display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
                opacity: ev.isCurrent ? 1 : 0.85,
              },
            },
              React.createElement('span', {
                className: 'material-icons-round',
                style: { fontSize: '16px', color: ev.color },
              }, ev.icon),
              React.createElement('span', { style: { fontSize: '11px', fontWeight: 700, minWidth: '40px' } }, ev.time),
              React.createElement('span', { style: { fontSize: '11px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, ev.title),
              ev.isCurrent
                ? React.createElement('span', { style: { fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: '#6366f1', color: '#fff', fontWeight: 700 } }, 'NOW')
                : diff > 0 && React.createElement('span', { style: { fontSize: '10px', color: diff <= 15 ? '#ef4444' : '#f59e0b', fontWeight: 600 } }, `あと${diff}分`)
            );
          })
        );
      })()
    ),

    // 改善1+6: 統合「今おすすめのスポット」カード（topAreas + frequentSpotsNow を統合、高い位置に配置）
    mergedNowSpots.length > 0 && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(233,30,99,0.10), rgba(255,152,0,0.06))',
        border: '1px solid rgba(233,30,99,0.2)',
      },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: '#e91e63' } }, 'near_me'),
        React.createElement('div', null,
          React.createElement('span', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, '今おすすめのスポット'),
          React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } },
            `${'日月火水木金土'[new Date().getDay()]}曜 ${new Date().getHours()}時台の実績`
          )
        )
      ),
      mergedNowSpots.map((spot, i) =>
        React.createElement('div', {
          key: `merged-${spot.name}-${i}`,
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0',
            borderBottom: i < mergedNowSpots.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 } },
            React.createElement('span', { style: {
              fontWeight: 700, fontSize: 'var(--font-size-lg)', width: '20px', textAlign: 'center',
              color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32',
            } }, `${i + 1}`),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, spot.name),
              React.createElement('div', { style: { display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' } },
                spot.tags.map(tag =>
                  React.createElement('span', {
                    key: tag,
                    style: {
                      fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '8px',
                      background: tag === '高単価' ? 'rgba(255,152,0,0.2)' : 'rgba(233,30,99,0.2)',
                      color: tag === '高単価' ? '#FFB74D' : '#f48fb1',
                    },
                  }, tag)
                ),
                // 待機場所のGPS実績verdict
                (() => {
                  if (!standbyAnalysis || !standbyAnalysis.locations) return null;
                  const match = standbyAnalysis.locations.find(l => spot.name.includes(l.name) || l.name.includes(spot.name));
                  if (!match) return null;
                  const vMap = { good: { label: '実績良', bg: 'rgba(16,185,129,0.2)', color: '#10b981' }, caution: { label: '注意', bg: 'rgba(245,158,11,0.2)', color: '#f59e0b' }, avoid: { label: '待ち長', bg: 'rgba(239,68,68,0.2)', color: '#ef4444' } };
                  const v = vMap[match.verdict];
                  if (!v) return null;
                  return React.createElement('span', {
                    key: 'verdict',
                    style: { fontSize: '8px', fontWeight: 700, padding: '1px 5px', borderRadius: '6px', background: v.bg, color: v.color },
                  }, `${v.label} ${match.avgWaitMin}分待`);
                })(),
                React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${spot.count}回`)
              )
            )
          ),
          React.createElement('span', { style: { fontWeight: 700, color: 'var(--color-secondary)', whiteSpace: 'nowrap', flexShrink: 0 } }, `¥${spot.avgAmount.toLocaleString()}`)
        )
      ),

      // Feature 5: チェーン提案（最新売上の降車座標がある場合）
      (() => {
        const latest = todaySummary.entries && todaySummary.entries[0];
        if (!latest || !latest.dropoffCoords || !latest.dropoffCoords.lat) return null;
        const chain = DataService.getChainSuggestion(latest.dropoff, latest.dropoffCoords);
        if (!chain.suggestions || chain.suggestions.length === 0) return null;
        return React.createElement('div', {
          style: { marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#f59e0b' } }, 'alt_route'),
            React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#f59e0b' } }, '降車後おすすめ'),
            React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' } }, `(${latest.dropoff || '直近降車地'}付近)`)
          ),
          ...chain.suggestions.map((sug, i) =>
            React.createElement('div', {
              key: `chain-${i}`,
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px' },
            },
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('span', { style: { fontWeight: 600 } }, sug.name),
                React.createElement('span', { style: { color: 'var(--text-muted)', marginLeft: '6px', fontSize: '10px' } }, sug.distance)
              ),
              React.createElement('span', {
                style: {
                  fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px',
                  background: sug.demandScore >= 60 ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.1)',
                  color: sug.demandScore >= 60 ? '#ef4444' : '#3b82f6',
                },
              }, `${sug.demandScore}`)
            )
          )
        );
      })()
    ),

    // 修正4: mergedNowSpotsが空の場合のデータ不足メッセージ
    mergedNowSpots.length === 0 && displaySpots.length === 0 && React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)', padding: 'var(--space-lg)', textAlign: 'center' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '32px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' } }, 'explore'),
      React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' } }, '乗車データが蓄積されるとスポット分析が表示されます'),
      React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '4px' } }, 'GPS付きの売上記録が3件以上で自動検出')
    ),

    // よく乗車される場所（全期間・詳細版）改善2,3,4,5
    displaySpots.length > 0 && React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)', padding: 'var(--space-lg)' },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: '#e91e63' } }, 'place'),
          React.createElement('span', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, 'よく乗車される場所')
        ),
        // 改善5: アフォーダンス
        React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, 'タップで詳細')
      ),
      // 修正6: 初期5件表示
      displaySpots.slice(0, showAllSpots ? displaySpots.length : 5).map((spot, i) => {
        const isExpanded = expandedSpotIdx === i;
        const tierTotal = spot.tiers ? spot.tiers.short + spot.tiers.mid + spot.tiers.long : 0;
        return React.createElement('div', {
          key: `spot-${spot.name}-${i}`,
          style: {
            padding: '10px 8px', marginBottom: '4px', cursor: 'pointer',
            borderRadius: '8px', transition: 'background 0.15s',
            background: isExpanded ? 'rgba(233,30,99,0.06)' : 'transparent',
          },
          onClick: () => stableSetExpandedSpotIdx(isExpanded ? null : i),
        },
          // メイン行
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 } },
              React.createElement('span', { style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px', borderRadius: '50%', fontSize: 'var(--font-size-xs)',
                fontWeight: 700, color: '#fff', background: '#e91e63', flexShrink: 0,
              } }, `${spot.count}`),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  spot.displayName || spot.name
                ),
                spot.displayName && spot.originalName && spot.displayName !== spot.originalName &&
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', opacity: 0.7 } }, spot.originalName),
                React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
                  spot.peakDay && React.createElement('span', null, `${spot.peakDay}曜`),
                  spot.peakHour !== null && React.createElement('span', null, `${spot.peakHour}時台`),
                  spot.eventMultiplier > 1.2 && React.createElement('span', {
                    style: { fontSize: '9px', padding: '0 4px', borderRadius: '4px', background: 'rgba(255,152,0,0.2)', color: '#FFB74D', fontWeight: 600 },
                  }, `イベント${spot.eventMultiplier}x`),
                  // 改善4: 金額帯ミニバー（メイン行に表示）
                  // 修正2: filter(Boolean)でfalse除去
                  tierTotal > 0 && React.createElement('span', { style: { display: 'inline-flex', borderRadius: '3px', overflow: 'hidden', height: '6px', width: '40px', flexShrink: 0 } },
                    ...[
                      spot.tiers.short > 0 && React.createElement('span', { key: 's', style: { width: `${spot.tiers.short / tierTotal * 100}%`, background: '#4CAF50', height: '100%' } }),
                      spot.tiers.mid > 0 && React.createElement('span', { key: 'm', style: { width: `${spot.tiers.mid / tierTotal * 100}%`, background: '#FF9800', height: '100%' } }),
                      spot.tiers.long > 0 && React.createElement('span', { key: 'l', style: { width: `${spot.tiers.long / tierTotal * 100}%`, background: '#e91e63', height: '100%' } }),
                    ].filter(Boolean)
                  )
                )
              )
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 } },
              React.createElement('span', { style: { fontWeight: 700, color: 'var(--color-secondary)', whiteSpace: 'nowrap' } }, `¥${spot.avgAmount.toLocaleString()}`),
              React.createElement('span', { className: 'material-icons-round', style: {
                fontSize: '18px', color: isExpanded ? '#e91e63' : 'var(--text-muted)',
                transition: 'transform 0.2s, color 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none',
              } }, 'expand_more')
            )
          ),

          // 展開時の詳細パネル（改善2: 情報量整理、改善3: ヒストグラム拡大）
          isExpanded && React.createElement('div', { style: { marginTop: '12px', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', fontSize: 'var(--font-size-xs)' } },

            // 修正1+5: ヒストグラム（時間軸修正、今ラベル余白確保）
            spot.hourly && (() => {
              const maxH = Math.max(...spot.hourly, 1);
              const nowH = new Date().getHours();
              return React.createElement('div', { style: { marginBottom: '14px' } },
                React.createElement('div', { style: { color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'schedule'),
                  '時間帯分布'
                ),
                // バーエリア（上に「今」ラベル用余白16px）
                React.createElement('div', { style: { paddingTop: '16px' } },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '1px', height: '48px' } },
                    spot.hourly.map((v, h) => {
                      const pct = v / maxH * 100;
                      const isNow = h === nowH;
                      return React.createElement('div', {
                        key: h,
                        style: {
                          flex: 1, height: `${Math.max(pct, v > 0 ? 10 : 3)}%`,
                          background: isNow ? '#e91e63' : v > 0 ? 'rgba(233,30,99,0.4)' : 'rgba(255,255,255,0.06)',
                          borderRadius: '2px 2px 0 0', position: 'relative',
                        },
                        title: `${h}時: ${v}件`,
                      },
                        isNow && React.createElement('div', {
                          style: { position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                            fontSize: '8px', fontWeight: 700, color: '#e91e63', whiteSpace: 'nowrap' },
                        }, '今')
                      );
                    })
                  )
                ),
                // 修正1: 時間軸ラベル — バーと同じflex配置で正確に位置合わせ
                React.createElement('div', { style: { display: 'flex', gap: '1px', marginTop: '2px' } },
                  Array.from({ length: 24 }, (_, h) =>
                    React.createElement('div', { key: h, style: { flex: 1, textAlign: 'center', fontSize: '8px', color: 'var(--text-muted)' } },
                      h % 3 === 0 ? `${h}` : ''
                    )
                  )
                )
              );
            })(),

            // 改善4: 金額帯（色付きドット凡例）
            tierTotal > 0 && React.createElement('div', { style: { marginBottom: '14px' } },
              React.createElement('div', { style: { color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'payments'),
                '金額帯'
              ),
              React.createElement('div', { style: { display: 'flex', borderRadius: '4px', overflow: 'hidden', height: '10px', marginBottom: '6px' } },
                ...[
                  spot.tiers.short > 0 && React.createElement('div', { key: 's', style: { width: `${spot.tiers.short / tierTotal * 100}%`, background: '#4CAF50' } }),
                  spot.tiers.mid > 0 && React.createElement('div', { key: 'm', style: { width: `${spot.tiers.mid / tierTotal * 100}%`, background: '#FF9800' } }),
                  spot.tiers.long > 0 && React.createElement('div', { key: 'l', style: { width: `${spot.tiers.long / tierTotal * 100}%`, background: '#e91e63' } }),
                ].filter(Boolean)
              ),
              React.createElement('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                [
                  { label: `〜¥1,000`, count: spot.tiers.short, color: '#4CAF50', pct: Math.round(spot.tiers.short / tierTotal * 100) },
                  { label: `¥1,001〜1,999`, count: spot.tiers.mid, color: '#FF9800', pct: Math.round(spot.tiers.mid / tierTotal * 100) },
                  { label: `¥2,000〜`, count: spot.tiers.long, color: '#e91e63', pct: Math.round(spot.tiers.long / tierTotal * 100) },
                ].map(t =>
                  React.createElement('span', { key: t.label, style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                    React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: t.color, flexShrink: 0 } }),
                    React.createElement('span', { style: { color: 'var(--text-secondary)' } }, `${t.label} ${t.count}件(${t.pct}%)`)
                  )
                )
              )
            ),

            // 曜日×時間帯TOP3
            spot.topDayHours && spot.topDayHours.length > 0 && React.createElement('div', { style: { marginBottom: '14px' } },
              React.createElement('div', { style: { color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'calendar_today'),
                'ピーク曜日×時間帯'
              ),
              React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                spot.topDayHours.map((dh, di) =>
                  React.createElement('span', {
                    key: di,
                    style: {
                      padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: di === 0 ? 600 : 400,
                      background: di === 0 ? 'rgba(233,30,99,0.2)' : 'rgba(255,255,255,0.08)',
                      color: di === 0 ? '#f48fb1' : 'var(--text-secondary)',
                    },
                  }, `${dh.day}曜 ${dh.hour}時 ${dh.count}件`)
                )
              )
            ),

            // 修正3: eventMultiplier null安全 + イベント影響 + 行き先（横並び2列）
            (spot.eventMultiplier > 1.0 || (spot.topDropoffs && spot.topDropoffs.length > 0)) &&
            React.createElement('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
              // イベント倍率
              spot.eventMultiplier > 1.0 && React.createElement('div', { style: { flex: '1 1 120px' } },
                React.createElement('div', { style: { color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'event'),
                  'イベント影響'
                ),
                React.createElement('div', { style: {
                  padding: '6px 10px', borderRadius: '8px', textAlign: 'center', fontWeight: 600,
                  background: spot.eventMultiplier >= 2 ? 'rgba(255,152,0,0.15)' : 'rgba(255,255,255,0.06)',
                  color: spot.eventMultiplier >= 2 ? '#FFB74D' : 'var(--text-secondary)',
                  fontSize: spot.eventMultiplier >= 2 ? '13px' : '11px',
                } }, `${spot.eventMultiplier}倍`)
              ),
              // 行き先TOP3
              spot.topDropoffs && spot.topDropoffs.length > 0 && React.createElement('div', { style: { flex: '2 1 180px' } },
                React.createElement('div', { style: { color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'flag'),
                  'よくある行き先'
                ),
                spot.topDropoffs.map((d, di) =>
                  React.createElement('div', {
                    key: di,
                    style: { display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: di < spot.topDropoffs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' },
                  },
                    React.createElement('span', { style: { color: 'var(--text-secondary)' } }, d.name),
                    React.createElement('span', { style: { color: 'var(--text-muted)', fontWeight: 600 } }, `${d.count}`)
                  )
                )
              )
            )
          )
        );
      }),
      // 修正6: 「もっと見る」ボタン
      !showAllSpots && displaySpots.length > 5 && React.createElement('div', {
        style: { textAlign: 'center', paddingTop: '8px' },
      },
        React.createElement('button', {
          onClick: (e) => { e.stopPropagation(); setShowAllSpots(true); },
          style: {
            border: 'none', background: 'rgba(233,30,99,0.1)', color: '#f48fb1',
            padding: '6px 20px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-family)',
          },
        }, `残り${displaySpots.length - 5}件を表示`)
      ),
      showAllSpots && displaySpots.length > 5 && React.createElement('div', {
        style: { textAlign: 'center', paddingTop: '8px' },
      },
        React.createElement('button', {
          onClick: (e) => { e.stopPropagation(); setShowAllSpots(false); stableSetExpandedSpotIdx(null); },
          style: {
            border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
            padding: '6px 20px', borderRadius: '16px', fontSize: '12px',
            cursor: 'pointer', fontFamily: 'var(--font-family)',
          },
        }, '折りたたむ')
      )
    ),

    // ============================================================
    // [NEW] 天候予報バーカード (Feature 8) — 天気変化がある場合のみ
    // ============================================================
    weatherImpact && weatherImpact.alerts && weatherImpact.alerts.length > 0 && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: '12px var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(59,130,246,0.06))',
        border: '1px solid rgba(6,182,212,0.25)',
      },
    },
      // コンパクト1行
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: '#06b6d4' } }, 'cloud'),
        React.createElement('div', { style: { flex: 1, fontSize: '12px' } },
          React.createElement('span', { style: { fontWeight: 600 } },
            `現在: ${weatherImpact.current.weather} ${weatherImpact.current.temp != null ? Math.round(weatherImpact.current.temp) + '°C' : ''}`
          ),
          weatherImpact.alerts[0] && React.createElement('span', { style: { color: '#fcd34d', marginLeft: '8px' } },
            ` → ${weatherImpact.alerts[0].message}`
          )
        )
      ),
      // 展開: 時間別テーブル
      weatherImpact.upcoming && weatherImpact.upcoming.length > 0 && React.createElement('div', {
        style: { marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(65px, 1fr))', gap: '4px' },
      },
        ...weatherImpact.upcoming.filter(u => u.hour >= new Date().getHours() && u.hour <= 17).map(u =>
          React.createElement('div', {
            key: `wdet-${u.hour}`,
            style: {
              textAlign: 'center', padding: '4px', borderRadius: '4px', fontSize: '10px',
              background: u.multiplier > 1.2 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
            },
          },
            React.createElement('div', { style: { fontWeight: 700, color: 'var(--text-secondary)' } }, `${u.hour}時`),
            React.createElement('div', null, u.weather),
            React.createElement('div', { style: { color: 'var(--text-muted)' } }, `${u.temp != null ? Math.round(u.temp) : '-'}°C`),
            u.multiplier > 1.0 && React.createElement('div', {
              style: { fontSize: '9px', fontWeight: 700, color: '#ef4444' },
            }, `+${Math.round((u.multiplier - 1) * 100)}%`)
          )
        )
      )
    ),

    // ============================================================
    // [NEW] 日勤需要スコアカード (Feature 4)
    // ============================================================
    dayShiftScore && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(168,85,247,0.06))',
        border: '1px solid rgba(59,130,246,0.25)',
      },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: '#3b82f6' } }, 'analytics'),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-md)' } }, '日勤需要スコア')
        ),
        React.createElement('span', {
          style: {
            fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
            background: dayShiftScore.overallShiftRating === 'excellent' ? 'rgba(239,68,68,0.15)' :
              dayShiftScore.overallShiftRating === 'good' ? 'rgba(245,158,11,0.15)' :
              dayShiftScore.overallShiftRating === 'normal' ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.15)',
            color: dayShiftScore.overallShiftRating === 'excellent' ? '#ef4444' :
              dayShiftScore.overallShiftRating === 'good' ? '#f59e0b' :
              dayShiftScore.overallShiftRating === 'normal' ? '#3b82f6' : '#6b7280',
          },
        }, dayShiftScore.overallShiftRating === 'excellent' ? '非常に良い' :
          dayShiftScore.overallShiftRating === 'good' ? '良好' :
          dayShiftScore.overallShiftRating === 'normal' ? '普通' : '低調')
      ),

      // 現在スコア
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '14px' },
      },
        React.createElement('div', {
          style: {
            width: '64px', height: '64px', borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: dayShiftScore.currentScore > 70 ? 'rgba(239,68,68,0.2)' : dayShiftScore.currentScore > 50 ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.15)',
            border: `3px solid ${dayShiftScore.currentScore > 70 ? '#ef4444' : dayShiftScore.currentScore > 50 ? '#f59e0b' : '#3b82f6'}`,
          },
        },
          React.createElement('span', {
            style: { fontSize: '24px', fontWeight: 800, color: dayShiftScore.currentScore > 70 ? '#ef4444' : dayShiftScore.currentScore > 50 ? '#f59e0b' : '#3b82f6' },
          }, String(dayShiftScore.currentScore))
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' } }, 'ベストスポット'),
          React.createElement('div', { style: { fontSize: '14px', fontWeight: 700 } }, dayShiftScore.bestSpot.name),
          React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } },
            `ピーク: ${dayShiftScore.peakHours.map(p => p.hour + '時').join(', ')}`
          )
        )
      ),

      // 待機TOP3 + 流しTOP3 コンパクト
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' } },
        // 待機スポットTOP3
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' } }, '待機スポット'),
          ...waitingSpotData.spots.filter(s => !s.currentDisabled && s.hasHistory).slice(0, 3).map(spot => {
            const barColor = spot.currentIndex >= 70 ? '#ef4444' : spot.currentIndex >= 50 ? '#f59e0b' : '#3b82f6';
            return React.createElement('div', {
              key: `ws-${spot.id}`, style: { marginBottom: '4px' },
            },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '1px' } },
                React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 } },
                  spot.shortName,
                  spot.zooStatus && spot.zooStatus.isOpen && React.createElement('span', {
                    style: { fontSize: '8px', padding: '0 3px', borderRadius: '3px', fontWeight: 700,
                      background: spot.zooStatus.season === 'winter' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)',
                      color: spot.zooStatus.season === 'winter' ? '#3b82f6' : '#10b981' },
                  }, spot.zooStatus.season === 'winter' ? '冬期' : spot.zooStatus.season === 'autumn' ? '秋期' : '夏期')
                ),
                React.createElement('span', { style: { fontWeight: 700, color: barColor } }, String(spot.currentIndex))
              ),
              React.createElement('div', { style: { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)' } },
                React.createElement('div', { style: { width: `${spot.currentIndex}%`, height: '100%', borderRadius: '2px', background: barColor } })
              )
            );
          }),
          // 動物園休園表示
          (() => {
            const zoo = waitingSpotData.spots.find(s => s.id === 'asahiyama_zoo');
            if (!zoo || !zoo.zooStatus || zoo.zooStatus.isOpen) return null;
            return React.createElement('div', {
              style: { marginTop: '2px', fontSize: '9px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '3px' },
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '10px' } }, 'event_busy'),
              `動物園: ${zoo.zooStatus.reason}`
            );
          })()
        ),
        // 流しエリアTOP3
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' } }, '流しエリア'),
          ...cruisingAreaData.areas.filter(a => a.hasHistory).slice(0, 3).map(area => {
            const barColor = area.currentIndex >= 70 ? '#ef4444' : area.currentIndex >= 50 ? '#f59e0b' : '#3b82f6';
            const gpsArea = cruisingPerf && cruisingPerf.areas ? cruisingPerf.areas.find(a => a.id === area.id) : null;
            return React.createElement('div', {
              key: `ca-${area.id}`, style: { marginBottom: '4px' },
            },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '1px' } },
                React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 } },
                  area.shortName,
                  gpsArea && React.createElement('span', {
                    style: { fontSize: '7px', fontWeight: 700, padding: '0 3px', borderRadius: '3px',
                      background: gpsArea.rate >= 30 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                      color: gpsArea.rate >= 30 ? '#10b981' : '#ef4444' },
                  }, `${gpsArea.rate}%`)
                ),
                React.createElement('span', { style: { fontWeight: 700, color: barColor } }, String(area.currentIndex))
              ),
              React.createElement('div', { style: { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)' } },
                React.createElement('div', { style: { width: `${area.currentIndex}%`, height: '100%', borderRadius: '2px', background: barColor } })
              )
            );
          })
        )
      ),

      // 7-17時コンパクト時間軸
      React.createElement('div', {
        style: { overflowX: 'auto', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' },
      },
        React.createElement('table', {
          style: { borderCollapse: 'collapse', fontSize: '10px', width: '100%' },
        },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', { style: { padding: '3px 6px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' } }, '時'),
              ...dayShiftScore.hourlyScores.map(hs => {
                const isCurrent = hs.hour === new Date().getHours();
                return React.createElement('th', {
                  key: hs.hour,
                  style: {
                    padding: '3px 4px', textAlign: 'center', fontWeight: isCurrent ? 800 : 500,
                    background: isCurrent ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: isCurrent ? '#3b82f6' : 'var(--text-muted)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                  },
                }, String(hs.hour));
              })
            )
          ),
          React.createElement('tbody', null,
            React.createElement('tr', null,
              React.createElement('td', { style: { padding: '3px 6px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, 'スコア'),
              ...dayShiftScore.hourlyScores.map(hs => {
                const isCurrent = hs.hour === new Date().getHours();
                const isPast = hs.hour < new Date().getHours();
                const bg = isPast ? 'rgba(107,114,128,0.08)' : hs.score > 70 ? 'rgba(239,68,68,0.2)' : hs.score > 50 ? 'rgba(245,158,11,0.18)' : hs.score > 30 ? 'rgba(59,130,246,0.12)' : 'rgba(107,114,128,0.06)';
                const color = isPast ? '#6b7280' : hs.score > 70 ? '#fca5a5' : hs.score > 50 ? '#fcd34d' : hs.score > 30 ? '#93c5fd' : '#6b7280';
                return React.createElement('td', {
                  key: hs.hour,
                  style: {
                    padding: '3px 4px', textAlign: 'center', fontWeight: 700,
                    background: isCurrent ? `linear-gradient(180deg, rgba(59,130,246,0.12), ${bg})` : bg,
                    color: color, borderBottom: '1px solid rgba(255,255,255,0.05)',
                  },
                }, String(hs.score));
              })
            )
          )
        )
      )
    ),

    // ============================================================
    // [NEW] 戦略シミュレーションカード (Feature 6)
    // ============================================================
    strategyForHour && strategyForHour.strategies.length > 0 && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(245,158,11,0.06))',
        border: '1px solid rgba(16,185,129,0.25)',
      },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: '#10b981' } }, 'compare_arrows'),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-md)' } }, '戦略シミュレーション')
        ),
        // 時間帯セレクタ
        React.createElement('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
          React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, '時間帯:'),
          ...Array.from({ length: 11 }, (_, i) => 7 + i).map(h =>
            React.createElement('button', {
              key: `sh-${h}`,
              onClick: () => setStrategyHour(h),
              style: {
                padding: '2px 5px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                fontSize: '10px', fontWeight: h === strategyHour ? 700 : 400, fontFamily: 'var(--font-family)',
                background: h === strategyHour ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)',
                color: h === strategyHour ? '#10b981' : 'var(--text-muted)',
              },
            }, String(h))
          )
        )
      ),

      // ベスト戦略ハイライト
      strategyForHour.bestStrategy !== '---' && React.createElement('div', {
        style: {
          padding: '8px 12px', borderRadius: '8px', marginBottom: '10px',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))',
          border: '1px solid rgba(16,185,129,0.25)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: '#10b981' } }, 'emoji_events'),
        React.createElement('span', { style: { fontSize: '12px', fontWeight: 700 } }, `${strategyHour}時台のベスト: ${strategyForHour.bestStrategy}`)
      ),

      // 戦略テーブル
      React.createElement('div', { style: { overflowX: 'auto', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' } },
        React.createElement('table', {
          style: { borderCollapse: 'collapse', fontSize: '11px', width: '100%' },
        },
          React.createElement('thead', null,
            React.createElement('tr', null,
              ...['スポット', '時給予測', '待ち', 'リスク', 'スコア'].map(label =>
                React.createElement('th', {
                  key: label,
                  style: { padding: '5px 8px', fontWeight: 700, textAlign: label === 'スポット' ? 'left' : 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' },
                }, label)
              )
            )
          ),
          React.createElement('tbody', null,
            ...strategyForHour.strategies.filter(s => !s.disabled).slice(0, 8).map((s, i) => {
              const isBest = s.location === strategyForHour.bestStrategy;
              const riskColor = s.riskLevel === 'high' ? '#ef4444' : s.riskLevel === 'medium' ? '#f59e0b' : '#10b981';
              return React.createElement('tr', {
                key: `strat-${i}`,
                style: { background: isBest ? 'rgba(16,185,129,0.08)' : 'transparent' },
              },
                React.createElement('td', {
                  style: { padding: '5px 8px', fontWeight: isBest ? 700 : 500, borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' },
                },
                  React.createElement('span', {
                    style: { display: 'inline-flex', alignItems: 'center', gap: '3px' },
                  },
                    React.createElement('span', {
                      style: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
                        background: s.type === 'waiting' ? '#3b82f6' : '#a855f7' },
                    }),
                    s.shortName,
                    // GPS verdict badge for waiting spots
                    s.gpsVerdict && React.createElement('span', {
                      style: { fontSize: '7px', fontWeight: 700, padding: '0 3px', borderRadius: '3px',
                        background: s.gpsVerdict === 'good' ? 'rgba(16,185,129,0.2)' : s.gpsVerdict === 'caution' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                        color: s.gpsVerdict === 'good' ? '#10b981' : s.gpsVerdict === 'caution' ? '#f59e0b' : '#ef4444' },
                    }, s.gpsVerdict === 'good' ? '実績良' : s.gpsVerdict === 'caution' ? '注意' : '非推奨'),
                    // GPS occupancy rate badge for cruising areas
                    s.gpsOccupancyRate != null && React.createElement('span', {
                      style: { fontSize: '7px', fontWeight: 700, padding: '0 3px', borderRadius: '3px',
                        background: s.gpsOccupancyRate >= 30 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                        color: s.gpsOccupancyRate >= 30 ? '#10b981' : '#ef4444' },
                    }, `実車${s.gpsOccupancyRate}%`)
                  )
                ),
                React.createElement('td', {
                  style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: isBest ? '#10b981' : 'var(--text-primary)' },
                },
                  `\u00A5${s.expectedHourlyRevenue.toLocaleString()}`,
                  // Show GPS hourly efficiency as sub-text
                  (s.gpsHourlyEff || s.gpsHourlyRevenue) && React.createElement('div', { style: { fontSize: '8px', color: '#10b981', fontWeight: 600 } },
                    `GPS:\u00A5${(s.gpsHourlyEff || s.gpsHourlyRevenue).toLocaleString()}`
                  )
                ),
                React.createElement('td', {
                  style: { padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)' },
                },
                  s.type === 'waiting' ? `${s.expectedWaitMin}分` : '流し',
                  s.gpsAvgWait != null && React.createElement('div', { style: { fontSize: '8px', color: '#10b981' } }, `実績${s.gpsAvgWait}分`)
                ),
                React.createElement('td', {
                  style: { padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' },
                },
                  React.createElement('span', {
                    style: { fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: `${riskColor}20`, color: riskColor },
                  }, s.riskLevel === 'high' ? '高' : s.riskLevel === 'medium' ? '中' : '低')
                ),
                React.createElement('td', {
                  style: { padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: s.demandScore >= 60 ? '#ef4444' : s.demandScore >= 40 ? '#f59e0b' : '#3b82f6' },
                }, String(s.demandScore))
              );
            })
          )
        )
      ),

      // 凡例
      React.createElement('div', { style: { display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)' } },
        React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' } }), '待機'
        ),
        React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#a855f7' } }), '流し'
        )
      )
    ),

    // ============================================================
    // 待機場所パフォーマンス比較カード
    // ============================================================
    standbyAnalysis && standbyAnalysis.locations.length > 0 && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(59,130,246,0.06))',
        border: '1px solid rgba(139,92,246,0.25)',
      },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: '#8b5cf6' } }, 'leaderboard'),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-md)' } }, '待機場所パフォーマンス比較')
        ),
        React.createElement('span', {
          style: { fontSize: '10px', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px', background: 'rgba(139,92,246,0.12)' },
        }, `${standbyAnalysis.locations.length}箇所`)
      ),

      // 全体サマリー
      React.createElement('div', {
        style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
      },
        ...[
          { label: '最高効率', value: standbyAnalysis.recommendation.best, color: '#10b981' },
          { label: '平均待ち', value: `${standbyAnalysis.recommendation.overallAvgWait}分`, color: standbyAnalysis.recommendation.overallAvgWait >= 60 ? '#ef4444' : standbyAnalysis.recommendation.overallAvgWait >= 30 ? '#f59e0b' : '#10b981' },
          standbyAnalysis.cruisingAvgFare > 0 ? { label: '流し平均', value: `\u00A5${standbyAnalysis.cruisingAvgFare.toLocaleString()}`, color: '#a855f7' } : null,
        ].filter(Boolean).map((item, idx) =>
          React.createElement('div', {
            key: `sa-sum-${idx}`,
            style: { flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' },
          },
            React.createElement('div', { style: { fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' } }, item.label),
            React.createElement('div', { style: { fontSize: '14px', fontWeight: 700, color: item.color } }, item.value)
          )
        )
      ),

      // 場所比較テーブル
      React.createElement('div', { style: { overflowX: 'auto', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '10px' } },
        React.createElement('table', {
          style: { borderCollapse: 'collapse', fontSize: '11px', width: '100%' },
        },
          React.createElement('thead', null,
            React.createElement('tr', null,
              ...['場所', '回数', '平均待ち', '乗車率', '平均売上', '時給効率', '判定'].map(label =>
                React.createElement('th', {
                  key: label,
                  style: { padding: '5px 6px', fontWeight: 700, textAlign: label === '場所' ? 'left' : 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', fontSize: '10px' },
                }, label)
              )
            )
          ),
          React.createElement('tbody', null,
            ...standbyAnalysis.locations.map((loc, i) => {
              const waitColor = loc.avgWaitMin >= 60 ? '#ef4444' : loc.avgWaitMin >= 30 ? '#f59e0b' : '#10b981';
              const crColor = loc.conversionRate >= 50 ? '#10b981' : loc.conversionRate >= 30 ? '#f59e0b' : '#ef4444';
              const verdictMap = { good: { label: '良い', color: '#10b981', bg: 'rgba(16,185,129,0.15)' }, caution: { label: '注意', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' }, avoid: { label: '流し推奨', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' } };
              const v = verdictMap[loc.verdict] || verdictMap.caution;
              const isBest = i === 0;
              return React.createElement('tr', {
                key: `sa-loc-${i}`,
                onClick: () => setStandbyDetailPlace(standbyDetailPlace === loc.name ? null : loc.name),
                style: { background: isBest ? 'rgba(139,92,246,0.06)' : 'transparent', cursor: 'pointer' },
              },
                React.createElement('td', { style: { padding: '5px 6px', fontWeight: isBest ? 700 : 500, borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' } },
                  React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
                    isBest && React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px', color: '#f59e0b' } }, 'emoji_events'),
                    loc.name.replace('旭川', ''),
                    loc.zooSeason && React.createElement('span', { style: { fontSize: '7px', padding: '0 3px', borderRadius: '3px', fontWeight: 700, background: loc.zooSeason === '冬期' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)', color: loc.zooSeason === '冬期' ? '#3b82f6' : '#10b981' } }, loc.zooSeason)
                  )
                ),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${loc.totalStandbys}`),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: waitColor, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${loc.avgWaitMin}分`),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', fontWeight: 600, color: crColor, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${loc.conversionRate}%`),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, loc.avgFare > 0 ? `\u00A5${loc.avgFare.toLocaleString()}` : '-'),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: loc.hourlyEfficiency >= 3000 ? '#10b981' : loc.hourlyEfficiency >= 1500 ? '#f59e0b' : '#ef4444' } },
                  `\u00A5${loc.hourlyEfficiency.toLocaleString()}/h`
                ),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                  React.createElement('span', { style: { fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: v.bg, color: v.color } }, v.label)
                )
              );
            })
          )
        )
      ),

      // 詳細タイムライン（場所タップ時に展開）
      standbyDetailPlace && (() => {
        const loc = standbyAnalysis.locations.find(l => l.name === standbyDetailPlace);
        if (!loc || Object.keys(loc.hourly).length === 0) return null;
        const hours = Object.values(loc.hourly).sort((a, b) => a.hour - b.hour);
        return React.createElement('div', {
          style: { padding: '10px', borderRadius: '8px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', marginBottom: '8px' },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#8b5cf6' } }, 'timeline'),
            React.createElement('span', { style: { fontWeight: 700, fontSize: '12px' } }, `${loc.name.replace('旭川', '')} 時間帯別パフォーマンス`)
          ),
          React.createElement('div', { style: { overflowX: 'auto' } },
            React.createElement('table', { style: { borderCollapse: 'collapse', fontSize: '10px', width: '100%' } },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  ...['時間', 'データ数', '平均待ち', '乗車率', '平均売上'].map(label =>
                    React.createElement('th', { key: label, style: { padding: '4px 6px', fontWeight: 700, textAlign: label === '時間' ? 'left' : 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' } }, label)
                  )
                )
              ),
              React.createElement('tbody', null,
                ...hours.map(h => {
                  const wc = h.avgWaitMin >= 60 ? '#ef4444' : h.avgWaitMin >= 30 ? '#f59e0b' : '#10b981';
                  const cc = h.conversionRate >= 50 ? '#10b981' : h.conversionRate >= 30 ? '#f59e0b' : '#ef4444';
                  const recommend = h.avgWaitMin >= 60 ? '流し推奨' : h.avgWaitMin >= 40 ? '注意' : null;
                  return React.createElement('tr', { key: `h-${h.hour}` },
                    React.createElement('td', { style: { padding: '4px 6px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                      `${h.hour}時`,
                      recommend && React.createElement('span', {
                        style: { marginLeft: '4px', fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px',
                          background: recommend === '流し推奨' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: recommend === '流し推奨' ? '#ef4444' : '#f59e0b' },
                      }, recommend)
                    ),
                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${h.count}回`),
                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: wc, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${h.avgWaitMin}分`),
                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', fontWeight: 600, color: cc, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${h.conversionRate}%`),
                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, h.avgFare > 0 ? `\u00A5${h.avgFare.toLocaleString()}` : '-')
                  );
                })
              )
            )
          ),
          // 流し比較のアドバイス
          loc.verdict === 'avoid' && React.createElement('div', {
            style: { marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#ef4444' } }, 'warning'),
            React.createElement('span', { style: { color: '#ef4444', fontWeight: 600 } },
              `平均待ち時間${loc.avgWaitMin}分は長すぎます。この場所では流しで客を探した方が効率的です。`
            )
          ),
          loc.verdict === 'caution' && React.createElement('div', {
            style: { marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#f59e0b' } }, 'info'),
            React.createElement('span', { style: { color: '#f59e0b' } },
              `待ち時間がやや長めです。時間帯を選んで待機するか、流しを検討してください。`
            )
          )
        );
      })(),

      // 凡例
      React.createElement('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)', flexWrap: 'wrap' } },
        React.createElement('span', null, '時給効率 = (乗車率 × 平均売上) ÷ (待ち+乗車)時間'),
        React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' } }), '良い'
        ),
        React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' } }), '注意'
        ),
        React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' } }), '流し推奨'
        )
      )
    ),

    // ローディング表示
    standbyAnalysisLoading && !standbyAnalysis && React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)', padding: 'var(--space-lg)', textAlign: 'center' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: '#8b5cf6', animation: 'spin 1s linear infinite' } }, 'sync'),
      React.createElement('span', { style: { marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' } }, '待機場所分析を読み込み中...')
    ),

    // ============================================================
    // 流しエリア実車率カード
    // ============================================================
    cruisingPerf && cruisingPerf.areas.length > 0 && React.createElement(Card, {
      style: {
        marginBottom: 'var(--space-md)', padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(168,85,247,0.10), rgba(236,72,153,0.06))',
        border: '1px solid rgba(168,85,247,0.25)',
      },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: '#a855f7' } }, 'directions_car'),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-md)' } }, '流しエリア実車率')
        ),
        React.createElement('span', {
          style: { fontSize: '10px', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px', background: 'rgba(168,85,247,0.12)' },
        }, `直近${cruisingPerf.overall.daysAnalyzed}日`)
      ),

      // 全体サマリー
      cruisingPerf.overall && React.createElement('div', {
        style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
      },
        ...[
          { label: '全体実車率', value: `${cruisingPerf.overall.rate}%`, color: cruisingPerf.overall.rate >= 40 ? '#10b981' : cruisingPerf.overall.rate >= 25 ? '#f59e0b' : '#ef4444' },
          { label: '総走行', value: `${Math.round(cruisingPerf.overall.totalMin / 60)}h`, color: '#a855f7' },
          { label: '乗車数', value: `${cruisingPerf.overall.totalRides}回`, color: '#3b82f6' },
          { label: '総売上', value: `\u00A5${cruisingPerf.overall.totalAmount.toLocaleString()}`, color: '#10b981' },
        ].map((item, idx) =>
          React.createElement('div', {
            key: `cp-sum-${idx}`,
            style: { flex: 1, minWidth: '70px', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' },
          },
            React.createElement('div', { style: { fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' } }, item.label),
            React.createElement('div', { style: { fontSize: '13px', fontWeight: 700, color: item.color } }, item.value)
          )
        )
      ),

      // エリア比較テーブル
      React.createElement('div', { style: { overflowX: 'auto', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '10px' } },
        React.createElement('table', {
          style: { borderCollapse: 'collapse', fontSize: '11px', width: '100%' },
        },
          React.createElement('thead', null,
            React.createElement('tr', null,
              ...['エリア', '滞在', '実車率', '乗車数', '平均単価', '時給'].map(label =>
                React.createElement('th', {
                  key: label,
                  style: { padding: '5px 6px', fontWeight: 700, textAlign: label === 'エリア' ? 'left' : 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', fontSize: '10px' },
                }, label)
              )
            )
          ),
          React.createElement('tbody', null,
            ...cruisingPerf.areas.map((area, i) => {
              const rateColor = area.rate >= 40 ? '#10b981' : area.rate >= 25 ? '#f59e0b' : '#ef4444';
              const isBest = i === 0;
              return React.createElement('tr', {
                key: `cp-area-${i}`,
                onClick: () => setCruisingDetailArea(cruisingDetailArea === area.id ? null : area.id),
                style: { background: isBest ? 'rgba(168,85,247,0.06)' : 'transparent', cursor: 'pointer' },
              },
                React.createElement('td', { style: { padding: '5px 6px', fontWeight: isBest ? 700 : 500, borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' } },
                  React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
                    isBest && React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px', color: '#f59e0b' } }, 'emoji_events'),
                    area.shortName
                  )
                ),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '10px' } }, `${Math.round(area.totalMin)}分`),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: rateColor, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${area.rate}%`),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${area.totalRides}`),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, area.avgFare > 0 ? `\u00A5${area.avgFare.toLocaleString()}` : '-'),
                React.createElement('td', { style: { padding: '5px 6px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', color: area.hourlyRevenue >= 3000 ? '#10b981' : area.hourlyRevenue >= 1500 ? '#f59e0b' : '#ef4444' } },
                  area.hourlyRevenue > 0 ? `\u00A5${area.hourlyRevenue.toLocaleString()}` : '-'
                )
              );
            })
          )
        )
      ),

      // 詳細タイムライン（エリアタップ時に展開）
      cruisingDetailArea && (() => {
        const area = cruisingPerf.areas.find(a => a.id === cruisingDetailArea);
        if (!area || Object.keys(area.hourly).length === 0) return null;
        const hours = Object.values(area.hourly).sort((a, b) => a.hour - b.hour);
        return React.createElement('div', {
          style: { padding: '10px', borderRadius: '8px', background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', marginBottom: '8px' },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#a855f7' } }, 'timeline'),
            React.createElement('span', { style: { fontWeight: 700, fontSize: '12px' } }, `${area.shortName} 時間帯別実車率`)
          ),
          React.createElement('div', { style: { overflowX: 'auto' } },
            React.createElement('table', { style: { borderCollapse: 'collapse', fontSize: '10px', width: '100%' } },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  ...['時間', '滞在', '実車率', '乗車', '売上', '回/h'].map(label =>
                    React.createElement('th', { key: label, style: { padding: '4px 5px', fontWeight: 700, textAlign: label === '時間' ? 'left' : 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' } }, label)
                  )
                )
              ),
              React.createElement('tbody', null,
                ...hours.map(h => {
                  const rc = h.rate >= 40 ? '#10b981' : h.rate >= 25 ? '#f59e0b' : '#ef4444';
                  return React.createElement('tr', { key: `ch-${h.hour}` },
                    React.createElement('td', { style: { padding: '4px 5px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                      `${h.hour}時`,
                      h.rate === 0 && h.totalMin >= 10 && React.createElement('span', {
                        style: { marginLeft: '3px', fontSize: '8px', fontWeight: 700, padding: '1px 3px', borderRadius: '3px', background: 'rgba(239,68,68,0.15)', color: '#ef4444' },
                      }, '空車')
                    ),
                    React.createElement('td', { style: { padding: '4px 5px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '9px' } },
                      `${h.avgMinPerDay}分/日`
                    ),
                    React.createElement('td', { style: { padding: '4px 5px', textAlign: 'center', fontWeight: 700, color: rc, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${h.rate}%`),
                    React.createElement('td', { style: { padding: '4px 5px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, `${h.rides}回`),
                    React.createElement('td', { style: { padding: '4px 5px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, h.amount > 0 ? `\u00A5${h.amount.toLocaleString()}` : '-'),
                    React.createElement('td', { style: { padding: '4px 5px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', color: h.ridesPerHour >= 2 ? '#10b981' : h.ridesPerHour >= 1 ? '#f59e0b' : '#ef4444' } }, `${h.ridesPerHour}`)
                  );
                })
              )
            )
          )
        );
      })(),

      // 凡例
      React.createElement('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)', flexWrap: 'wrap' } },
        React.createElement('span', null, '実車率 = 実車時間 ÷ 総滞在時間'),
        React.createElement('span', null, '時給 = 売上 ÷ 滞在時間(h)'),
        React.createElement('span', null, 'タップで時間帯別を表示')
      )
    ),

    // 流し分析ローディング
    cruisingPerfLoading && !cruisingPerf && React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)', padding: 'var(--space-lg)', textAlign: 'center' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: '#a855f7', animation: 'spin 1s linear infinite' } }, 'sync'),
      React.createElement('span', { style: { marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' } }, '流しエリア分析を読み込み中...')
    ),

    // 空車対策カード
    vacancyAdvice && vacancyAdvice.actions.length > 0 && React.createElement(Card, {
      style: { marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', border: '1px solid rgba(99,102,241,0.3)', background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(79,70,229,0.04) 100%)' },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: '#6366f1' } }, 'tips_and_updates'),
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 700, fontSize: '13px', color: '#6366f1' } }, '空車対策'),
            React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, vacancyAdvice.periodLabel)
          )
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          vacancyAdvice.currentVacantMin != null && vacancyAdvice.currentVacantMin >= 10 && React.createElement('span', {
            style: { fontSize: '9px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: vacancyAdvice.currentVacantMin >= 30 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: vacancyAdvice.currentVacantMin >= 30 ? '#ef4444' : '#f59e0b' },
          }, `空車${vacancyAdvice.currentVacantMin}分`),
          vacancyAdvice.isValley && React.createElement('span', {
            style: { fontSize: '9px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', color: '#6366f1' },
          }, '谷間')
        )
      ),
      // 天気情報
      vacancyAdvice.weather && React.createElement('div', {
        style: { fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } },
          vacancyAdvice.weather.w === '雨' ? 'water_drop' : vacancyAdvice.weather.w === '雪' ? 'ac_unit' : vacancyAdvice.weather.w === '晴れ' ? 'wb_sunny' : 'cloud'
        ),
        `${vacancyAdvice.weather.w} ${vacancyAdvice.weather.tp}℃`
      ),
      // アクションリスト
      ...vacancyAdvice.actions.map((action, idx) =>
        React.createElement('div', {
          key: idx,
          style: { marginBottom: '8px', padding: '10px', borderRadius: '8px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)' },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: action.color } }, action.icon),
            React.createElement('span', { style: { fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' } }, action.title)
          ),
          React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '3px', paddingLeft: '26px' } }, action.description),
          React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '26px', fontStyle: 'italic' } }, action.detail)
        )
      ),
      // シフトアドバイス
      vacancyAdvice.shiftAdvice && React.createElement('div', {
        style: { marginTop: '8px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(99,102,241,0.06)', borderLeft: '3px solid #6366f1' },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#6366f1' } }, vacancyAdvice.shiftAdvice.icon),
          React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#6366f1' } }, vacancyAdvice.shiftAdvice.text)
        ),
        React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '20px' } }, vacancyAdvice.shiftAdvice.detail)
      )
    ),

    // 閑散期流しルート
    slowPeriodRoutes && slowPeriodRoutes.isSlowPeriod && React.createElement(Card, {
      style: { marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', border: '1px solid rgba(245,158,11,0.3)', background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(217,119,6,0.04) 100%)' },
    },
      // ヘッダー
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { style: { fontSize: '12px', fontWeight: 700, color: '#f59e0b', border: '1.5px solid #f59e0b', borderRadius: '4px', padding: '1px 4px' } }, '流'),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-sm)', color: '#f59e0b' } }, '閑散期流しルート')
        ),
        React.createElement('span', {
          style: { fontSize: '9px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
        }, slowPeriodRoutes.trigger === '両方' ? '需要低+売上不足' : slowPeriodRoutes.trigger === '需要低' ? '需要低' : '売上不足')
      ),

      // ステータス行
      React.createElement('div', { style: { display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '11px' } },
        React.createElement('span', { style: { color: 'var(--text-secondary)' } },
          '需要スコア: ',
          React.createElement('span', { style: { fontWeight: 700, color: slowPeriodRoutes.currentScore <= 20 ? '#ef4444' : '#f59e0b' } }, String(slowPeriodRoutes.currentScore))
        ),
        React.createElement('span', { style: { color: 'var(--text-secondary)' } },
          '目標達成率: ',
          React.createElement('span', { style: { fontWeight: 700, color: slowPeriodRoutes.dailyRate < 40 ? '#ef4444' : '#f59e0b' } }, `${slowPeriodRoutes.dailyRate}%`)
        )
      ),

      // ルートリスト
      ...slowPeriodRoutes.routes.map((route, idx) =>
        React.createElement('div', {
          key: route.id,
          style: { marginBottom: '12px', padding: '10px', borderRadius: '8px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' } },
            React.createElement('span', {
              style: { width: '20px', height: '20px', borderRadius: '50%', background: '#f59e0b', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 },
            }, String(idx + 1)),
            React.createElement('span', { style: { fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' } }, route.label)
          ),
          // エリア矢印表示
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginBottom: '6px', fontSize: '11px' } },
            ...route.areas.flatMap((area, aIdx) => {
              const items = [React.createElement('span', {
                key: `a-${aIdx}`,
                style: { padding: '2px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#d97706', fontWeight: 600, fontSize: '10px' },
              }, area)];
              if (aIdx < route.areas.length - 1) {
                items.push(React.createElement('span', { key: `arr-${aIdx}`, style: { color: '#f59e0b', fontSize: '10px' } }, '\u2192'));
              }
              return items;
            })
          ),
          // 詳細行
          React.createElement('div', { style: { display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' } },
            React.createElement('span', null, `滞在: ${route.stayMinutes.join('→')}分`),
            React.createElement('span', { style: { fontWeight: 600, color: '#f59e0b' } }, `期待: ¥${route.expectedRevenue.toLocaleString()}/h`)
          ),
          // 要因
          React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' } }, route.factor),
          // Tip
          React.createElement('div', { style: { fontSize: '10px', color: '#d97706', fontStyle: 'italic' } }, `Tip: ${route.tip}`)
        )
      ),

      // 一般アドバイス
      slowPeriodRoutes.generalTips.length > 0 && React.createElement('div', {
        style: { marginTop: '8px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.05)', borderLeft: '3px solid #f59e0b' },
      },
        React.createElement('div', { style: { fontSize: '10px', fontWeight: 600, color: '#f59e0b', marginBottom: '4px' } }, 'ポイント'),
        ...slowPeriodRoutes.generalTips.map((tip, i) =>
          React.createElement('div', { key: i, style: { fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' } }, `・${tip}`)
        )
      )
    ),

    // 乗車地ベスト15（タイムライン方式）
    React.createElement(Card, {
      style: { marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' },
    },
      // ヘッダー
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '22px', color: '#f97316' } }, 'emoji_events'),
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 700, fontSize: '14px', color: '#f97316' } }, '乗車地ベスト15'),
            React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, '時間帯別 乗車実績ランキング')
          )
        ),
        React.createElement('button', {
          onClick: () => navigate('map'),
          style: {
            padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-family)',
            background: 'rgba(249,115,22,0.15)', color: '#f97316',
          },
        }, 'マップで見る')
      ),

      // タイムラインスライダー
      React.createElement('div', {
        style: {
          marginBottom: '12px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: '#f97316' } }, 'schedule'),
            React.createElement('span', { style: { fontSize: '12px', fontWeight: 600, color: '#f97316' } }, '時間帯を選択')
          ),
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px' },
          },
            React.createElement('span', {
              style: { fontSize: '18px', fontWeight: 800, color: timelineHour === new Date().getHours() ? '#22c55e' : '#f97316' },
            }, timelineHour + '時台'),
            timelineHour === new Date().getHours() && React.createElement('span', {
              style: { fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: 'rgba(34,197,94,0.2)', color: '#22c55e', fontWeight: 600 },
            }, '現在'),
            timelineHour !== new Date().getHours() && React.createElement('button', {
              onClick: () => setTimelineHour(new Date().getHours()),
              style: {
                padding: '2px 8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-family)',
                background: 'rgba(34,197,94,0.15)', color: '#22c55e',
              },
            }, '現在に戻す')
          )
        ),
        React.createElement('input', {
          type: 'range', min: 0, max: 23, step: 1,
          value: timelineHour,
          onChange: (e) => setTimelineHour(parseInt(e.target.value, 10)),
          style: { width: '100%', accentColor: '#f97316' },
        }),
        // 時刻ラベル
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' },
        },
          ...[0, 3, 6, 9, 12, 15, 18, 21].map(h =>
            React.createElement('span', {
              key: h,
              onClick: () => setTimelineHour(h),
              style: { cursor: 'pointer', fontWeight: h === timelineHour ? 700 : 400, color: h === timelineHour ? '#f97316' : 'var(--text-muted)' },
            }, h + '時')
          )
        )
      ),

      // ランキング表示
      timelineClusters.length === 0 && React.createElement('div', {
        style: {
          padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.4 } }, 'search_off'),
        timelineHour + '時台の乗車データがありません'
      ),

      // 1位を強調表示
      timelineClusters.length > 0 && (() => {
        const top = timelineClusters[0];
        return React.createElement('div', {
          style: {
            padding: '12px', borderRadius: '10px', marginBottom: '8px',
            background: 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0.04))',
            border: '1px solid rgba(249,115,22,0.2)',
          },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' },
          },
            React.createElement('div', {
              style: {
                width: '36px', height: '36px', borderRadius: '50%',
                background: '#ef4444', color: '#fff', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', flexShrink: 0,
              },
            }, '1'),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { style: { fontSize: '16px', fontWeight: 700, color: '#fff' } }, top.name),
              React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } },
                timelineHour + '時台に' + top.count + '回乗車（' + top.activeDays + '日間）'
              )
            ),
            React.createElement('div', { style: { textAlign: 'right' } },
              React.createElement('div', { style: { fontSize: '18px', fontWeight: 800, color: '#ef4444' } },
                '¥' + top.avgAmountPerHour.toLocaleString()
              ),
              React.createElement('div', { style: { fontSize: '9px', color: 'var(--text-muted)' } }, '1h平均売上')
            )
          ),
          React.createElement('div', {
            style: { display: 'flex', gap: '12px', fontSize: '11px', flexWrap: 'wrap' },
          },
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-secondary)' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px' } }, 'paid'),
              '客単価¥' + top.avgAmount.toLocaleString()
            ),
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-secondary)' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px' } }, 'speed'),
              top.ridesPerDay + '回/日'
            ),
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px', color: top.occupancyRate >= 50 ? '#22c55e' : top.occupancyRate >= 30 ? '#f59e0b' : 'var(--text-secondary)' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px' } }, 'directions_car'),
              '実車率' + top.occupancyRate + '%' + (top.avgRideMin > 0 ? '(平均' + top.avgRideMin + '分)' : '')
            ),
            top.topSource && React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-secondary)' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px' } }, 'local_taxi'),
              top.topSource
            )
          )
        );
      })(),

      // 2位以下
      timelineClusters.length > 1 && React.createElement('div', null,
        timelineClusters.slice(1).map((cl, i) => {
          const rank = i + 2;
          const rankColors = ['', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#0ea5e9', '#10b981'];
          const color = rankColors[rank] || '#8b5cf6';
          const maxCount = timelineClusters[0].count || 1;
          const barW = Math.max(8, Math.round((cl.count / maxCount) * 100));
          return React.createElement('div', {
            key: i,
            style: {
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 0',
              borderBottom: i < timelineClusters.length - 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            },
          },
            React.createElement('div', {
              style: {
                width: '24px', height: '24px', borderRadius: '50%',
                background: rank <= 3 ? color : 'rgba(255,255,255,0.08)',
                color: rank <= 3 ? '#fff' : color, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', flexShrink: 0,
                border: rank > 3 ? '1px solid ' + color + '40' : 'none',
              },
            }, String(rank)),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', {
                style: { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' },
              },
                React.createElement('span', {
                  style: { fontSize: '12px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                }, cl.name),
                React.createElement('span', {
                  style: { fontSize: '10px', color: 'var(--text-muted)' },
                }, cl.count + '回')
              ),
              React.createElement('div', {
                style: { height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', marginBottom: '2px' },
              },
                React.createElement('div', {
                  style: { height: '100%', width: barW + '%', borderRadius: '2px', background: color, transition: 'width 0.3s ease' },
                })
              ),
              React.createElement('div', {
                style: { display: 'flex', gap: '8px', fontSize: '10px', color: 'var(--text-muted)' },
              },
                React.createElement('span', null, '客単価¥' + cl.avgAmount.toLocaleString()),
                React.createElement('span', null, cl.ridesPerDay + '回/日'),
                React.createElement('span', {
                  style: { color: cl.occupancyRate >= 50 ? '#22c55e' : cl.occupancyRate >= 30 ? '#f59e0b' : 'var(--text-muted)' },
                }, '実車' + cl.occupancyRate + '%'),
                cl.topSource && React.createElement('span', null, cl.topSource)
              )
            ),
            React.createElement('div', {
              style: { textAlign: 'right', flexShrink: 0 },
            },
              React.createElement('div', { style: { fontSize: '13px', fontWeight: 700, color: color } },
                '¥' + cl.avgAmountPerHour.toLocaleString()
              ),
              React.createElement('div', { style: { fontSize: '9px', color: 'var(--text-muted)' } }, '1h平均')
            )
          );
        })
      )
    ),

    // 累計情報
    overallSummary.rideCount > 0 && React.createElement(Card, {
      style: { marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' },
    },
      React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '8px' } },
        '累計実績'
      ),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-secondary)' } },
            `¥${overallSummary.totalAmount.toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(overallSummary.totalAmount / 1.1).toLocaleString()}`),
          React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税¥${(overallSummary.totalAmount - Math.floor(overallSummary.totalAmount / 1.1)).toLocaleString()}`),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, '累計売上（税込）')
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 } },
            `${overallSummary.rideCount}回`
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, '累計乗車')
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 } },
            `¥${overallSummary.dailyAvg.toLocaleString()}`
          ),
          React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(overallSummary.dailyAvg / 1.1).toLocaleString()}`),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, '日平均売上（税込）')
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 } },
            `${overallSummary.activeDays}日`
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, '稼働日数')
        )
      )
    ),

    // 最近の売上（本日分）
    todaySummary.entries.length > 0 && React.createElement(Card, {
      title: `本日の記録（${todaySummary.entries.length}件）`,
      style: { marginBottom: 'var(--space-lg)' },
    },
      todaySummary.entries.slice(0, 5).map(entry =>
        React.createElement('div', {
          key: entry.id,
          style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
          },
        },
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 'var(--font-size-sm)' } },
              `${entry.pickup || '---'} → ${entry.dropoff || '---'}`
            ),
            (entry.pickupLandmark || entry.dropoffLandmark) && React.createElement('div', { style: { fontSize: '10px', color: 'var(--color-accent)', opacity: 0.8 } },
              `${entry.pickupLandmark || ''} → ${entry.dropoffLandmark || ''}`
            ),
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } },
              new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            )
          ),
          React.createElement('div', { style: { textAlign: 'right' } },
            entry.noPassenger
              ? React.createElement('div', null,
                  React.createElement('div', { style: { fontWeight: 700, color: '#d32f2f' } }, '¥0（空車）'),
                  entry.memo && entry.memo.includes('自動記録') && React.createElement('div', { style: { fontSize: '9px', color: '#ff9800', marginTop: '1px' } }, 'GPS自動検出')
                )
              : React.createElement('div', { style: { fontWeight: 700, color: 'var(--color-secondary)' } }, `¥${entry.amount.toLocaleString()}`),
            !entry.noPassenger && React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(entry.amount / 1.1).toLocaleString()} 税¥${(entry.amount - Math.floor(entry.amount / 1.1)).toLocaleString()}`)
          )
        )
      ),
      todaySummary.entries.length > 5 && React.createElement(Button, {
        variant: 'secondary', icon: 'arrow_forward',
        onClick: () => navigate('revenue'),
        style: { marginTop: 'var(--space-sm)', width: '100%' },
      }, 'すべての記録を見る')
    ),

    // クイックアクション
    React.createElement('h2', {
      style: { fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 500 },
    }, 'クイックアクション'),

    React.createElement('div', { className: 'grid grid--4' },
      quickActions.map((action, i) =>
        React.createElement(Card, {
          key: i,
          onClick: () => navigate(action.page),
          style: { textAlign: 'center', cursor: 'pointer', padding: 'var(--space-lg)' },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '36px', color: action.color, marginBottom: '8px' },
          }, action.icon),
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, action.label)
        )
      )
    )
  );
};

})();
