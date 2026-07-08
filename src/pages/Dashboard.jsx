(function() {
// Dashboard.jsx - ダッシュボード（DataServiceからリアルタイムデータ取得）
window.DashboardPage = () => {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;
  const { navigate, geminiApiKey } = useAppContext();
  const { currentPosition, isTracking } = useMapContext();
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

  // 日種別フィルタ: null=全て, 'weekday'=平日, 'holiday'=土日祝
  const [dayTypeFilter, setDayTypeFilter] = useState(null);
  // 支払方法カード展開: null or 'cash'|'uncollected'|'didi'|'uber'
  const [expandedPayment, setExpandedPayment] = useState(null);

  // セクション折りたたみ状態（localStorageで永続化）
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dashboard_collapsed') || '{}');
    } catch { return {}; }
  });
  const toggleSection = useCallback((key) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('dashboard_collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  // 折りたたみヘッダーコンポーネント
  const SectionHeader = useCallback(({ sectionKey, icon, title, iconColor, extra }) => {
    const isCollapsed = collapsedSections[sectionKey];
    return React.createElement('div', {
      onClick: () => toggleSection(sectionKey),
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCollapsed ? 0 : '12px', cursor: 'pointer', userSelect: 'none' },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: iconColor || 'var(--text-primary)' } }, icon),
        React.createElement('span', { style: { fontWeight: 700, fontSize: 'var(--font-size-sm)' } }, title),
        extra
      ),
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' } }, 'expand_more')
    );
  }, [collapsedSections, toggleSection]);

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
    }).catch(() => {
      if (fetchId === weatherFetchIdRef.current) {
        setWeatherImpact(DataService.getWeatherDemandImpact(null));
      }
    });
    return () => { weatherFetchIdRef.current++; };
  }, [refreshKey]);
  const dayShiftScore = useMemo(() => DataService.getDayShiftDemandScore(weatherImpact), [refreshKey, weatherImpact]);
  const timeline = useMemo(() => DataService.getDayShiftTimeline(weatherImpact), [refreshKey, weatherImpact]);
  const nextAction = useMemo(() => DataService.getNextOptimalAction(currentPosition, weatherImpact), [refreshKey, weatherImpact, currentPosition]);
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

  // リピーター予測（今日来そうな常連客）
  const repeaterForecast = useMemo(() => {
    const entries = DataService.getEntries();
    const repeaters = entries.filter(e => e.isRegisteredUser);
    if (repeaters.length === 0) return null;
    const now = new Date();
    const todayDow = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
    const currentHour = now.getHours();

    // 顧客ごとにパターン分析
    const byName = {};
    repeaters.forEach(e => {
      const name = e.customerName || '名前なし';
      if (!byName[name]) byName[name] = { rides: [], days: {}, hours: {}, areas: {}, totalAmount: 0 };
      const u = byName[name];
      u.rides.push(e);
      const _ld = (() => {
        if (e.discounts && Array.isArray(e.discounts)) { const r = e.discounts.filter(d => d.type === 'longDistance'); if (r.length > 0) return r.reduce((s, d) => s + (d.amount || 0), 0); }
        if (e.discountType && e.discountType.includes('longDistance') && e.discountAmount) { const t = e.discountType.split(',').filter(t => t && t !== 'longDistance'); if (t.length === 0) return e.discountAmount; }
        return 0;
      })();
      u.totalAmount += (e.amount || 0) + (e.discountAmount || 0) + (e.couponAmount || 0) - _ld;
      const dow = e.dayOfWeek || '';
      if (dow) u.days[dow] = (u.days[dow] || 0) + 1;
      if (e.pickupTime) {
        const h = parseInt(e.pickupTime.split(':')[0]);
        if (!isNaN(h)) u.hours[h] = (u.hours[h] || 0) + 1;
      }
      if (e.pickup) u.areas[e.pickup] = (u.areas[e.pickup] || 0) + 1;
    });

    const predictions = [];
    Object.entries(byName).forEach(([name, data]) => {
      const totalRides = data.rides.length;
      const todayDowCount = data.days[todayDow] || 0;
      if (todayDowCount === 0 || totalRides < 2) return;

      const dowRate = todayDowCount / totalRides;
      // この曜日に来る確率が15%以上
      if (dowRate < 0.15) return;

      const topArea = Object.entries(data.areas).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      const avgAmount = Math.round(data.totalAmount / totalRides);

      // 最頻時間帯
      const todayHourRides = data.rides.filter(e => e.dayOfWeek === todayDow && e.pickupTime);
      const hourCounts = {};
      todayHourRides.forEach(e => {
        const h = parseInt(e.pickupTime.split(':')[0]);
        if (!isNaN(h)) hourCounts[h] = (hourCounts[h] || 0) + 1;
      });
      const topHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      const expectedHour = topHour ? parseInt(topHour[0]) : null;

      // 最終来訪日
      const lastDate = data.rides.reduce((latest, e) => {
        const d = e.date || '';
        return d > latest ? d : latest;
      }, '');

      // 今日の乗車済みか
      const todayStr = getLocalDateString();
      const riddenToday = data.rides.some(e => e.date === todayStr);

      predictions.push({
        name, topArea, avgAmount, expectedHour, totalRides, todayDowCount,
        dowRate: Math.round(dowRate * 100), lastDate, riddenToday,
      });
    });

    predictions.sort((a, b) => {
      // まだ来てない人を上に
      if (a.riddenToday !== b.riddenToday) return a.riddenToday ? 1 : -1;
      // 時間が近い順
      if (a.expectedHour !== null && b.expectedHour !== null) {
        const aDiff = Math.abs(a.expectedHour - currentHour);
        const bDiff = Math.abs(b.expectedHour - currentHour);
        return aDiff - bDiff;
      }
      return b.dowRate - a.dowRate;
    });

    return predictions.length > 0 ? predictions : null;
  }, [refreshKey]);

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
      const today = getLocalDateString();
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

  // === 夜勤用データ ===
  const nightData = useMemo(() => {
    if (shiftMode !== 'night') return null;
    const ns = APP_CONSTANTS.NIGHT_SHIFT;
    const now = new Date();
    const nowH = now.getHours();
    const nowM = now.getMinutes();
    const isLateNight = nowH >= ns.lateNightStart || nowH < ns.lateNightEnd;

    // 夜間売上（17:00〜翌5:00）
    const nightEntries = todayEntries.filter(e => {
      if (!e.pickupTime) return false;
      const h = parseInt(e.pickupTime.split(':')[0]);
      return h >= ns.startHour || h < ns.endHour;
    });
    const nightTotal = nightEntries.reduce((s, e) => s + (e.amount || 0), 0);
    const nightLateEntries = nightEntries.filter(e => {
      const h = parseInt(e.pickupTime.split(':')[0]);
      return h >= ns.lateNightStart || h < ns.lateNightEnd;
    });

    // ホテル需要（夜間ピーク）
    const hotels = (APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.hotels) || [];
    const hotelPeaks = (APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.hotelPeakWindows) || {};
    const currentPeak = nowH >= 18 && nowH < 20 ? 'evening' : nowH >= 22 || nowH < 1 ? 'night' : nowH >= 15 && nowH < 17 ? 'checkin' : null;

    // 夜間おすすめ待機スポット
    const spots = (APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.waitingSpots) || [];
    const isWeekend = [0, 6].includes(now.getDay());
    const topSpots = spots.map(sp => {
      const pattern = isWeekend ? sp.basePatternWeekend : sp.basePatternWeekday;
      const demand = (pattern && pattern[nowH]) || 0;
      return { name: sp.name, demand, category: sp.category };
    }).filter(s => s.demand > 0).sort((a, b) => b.demand - a.demand).slice(0, 5);

    // 繁華街需要
    const cruising = (APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.cruisingAreas) || [];
    const downtown = cruising.find(a => a.id === 'downtown');
    const downtownDemand = downtown ? (isWeekend ? downtown.basePatternWeekend : downtown.basePatternWeekday)[nowH] || 0 : 0;

    // 終バス情報
    const lastTransit = (APP_CONSTANTS.LAST_TRANSIT || []).map(t => {
      const [th, tm] = t.time.split(':').map(Number);
      const mins = (th * 60 + tm) - (nowH * 60 + nowM);
      return { ...t, minsLeft: mins < -60 ? mins + 1440 : mins };
    }).filter(t => t.minsLeft > -30).sort((a, b) => a.minsLeft - b.minsLeft);

    return { nightEntries, nightTotal, nightLateEntries, isLateNight, currentPeak, hotels, hotelPeaks, topSpots, downtownDemand, lastTransit, nowH };
  }, [shiftMode, refreshKey, todayEntries]);

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

    // GPS状態（始業中はコンパクト表示）
    shiftInfo.active
      ? React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-sm)', padding: '6px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', fontSize: '11px', color: 'var(--text-muted)' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: isTracking ? 'var(--color-accent)' : 'var(--text-muted)' } }, isTracking ? 'gps_fixed' : 'gps_off'),
          React.createElement('span', null, isTracking ? 'GPS追跡中' : 'GPS未接続'),
          currentPosition && React.createElement('span', { style: { marginLeft: '4px' } }, `${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)}`)
        )
      : React.createElement(Card, {
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


    // JR旭川駅 到着列車情報
    (() => {
      if (!window.JrTimetable) return null;
      const trains = JrTimetable.getUpcomingArrivals(6, shiftMode);
      if (trains.length === 0) return React.createElement(Card, {
        style: { marginBottom: 'var(--space-md)', padding: 'var(--space-md)' },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px' } }, 'train'),
          '本日のJR到着列車はありません'
        )
      );
      return React.createElement(Card, {
        style: { marginBottom: 'var(--space-md)', padding: 'var(--space-md)' },
      },
        React.createElement(SectionHeader, { sectionKey: 'jr-arrivals', icon: 'train', title: shiftMode === 'night' ? 'JR旭川駅 到着予定（17〜終電）' : 'JR旭川駅 到着予定（5〜19時）', iconColor: '#2196F3' }),
        !collapsedSections['jr-arrivals'] && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          ...trains.map((t, i) => React.createElement('div', {
            key: i,
            style: {
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
              borderRadius: '8px', background: i === 0 ? 'rgba(33,150,243,0.08)' : 'rgba(255,255,255,0.02)',
              border: i === 0 ? '1px solid rgba(33,150,243,0.2)' : '1px solid transparent',
            },
          },
            // 到着時刻
            React.createElement('div', { style: { fontSize: '15px', fontWeight: 700, minWidth: '42px', color: i === 0 ? '#64b5f6' : 'var(--text-primary)' } }, t.time),
            // 種別バッジ
            React.createElement('span', {
              style: {
                fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                background: t.type === '特急' ? 'rgba(244,67,54,0.2)' : 'rgba(255,255,255,0.08)',
                color: t.type === '特急' ? '#ef5350' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              },
            }, t.type),
            // 列車名・路線
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { fontSize: '12px', fontWeight: t.name ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                t.name || (t.from + '方面')
              ),
              React.createElement('div', { style: { fontSize: '10px', color: JrTimetable.getLineColor(t.line) } }, t.line + '（' + t.from + 'から）')
            ),
            // あと何分
            React.createElement('div', {
              style: {
                fontSize: t.minsLeft <= 10 ? '13px' : '11px',
                fontWeight: t.minsLeft <= 10 ? 700 : 400,
                color: t.minsLeft <= 5 ? '#ef5350' : t.minsLeft <= 15 ? '#ffa726' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              },
            }, t.minsLeft <= 0 ? '到着' : 'あと' + t.minsLeft + '分')
          ))
        )
      );
    })(),

    // 都市間バス 旭川駅前 到着情報
    (() => {
      if (!window.JrTimetable || !JrTimetable.getUpcomingBusArrivals) return null;
      const buses = JrTimetable.getUpcomingBusArrivals(6, shiftMode);
      if (buses.length === 0) return null;
      return React.createElement(Card, {
        style: { marginBottom: 'var(--space-md)', padding: 'var(--space-md)' },
      },
        React.createElement(SectionHeader, { sectionKey: 'bus-arrivals', icon: 'directions_bus', title: shiftMode === 'night' ? '都市間バス 旭川駅前着（17時〜）' : '都市間バス 旭川駅前着（5〜19時）', iconColor: '#ef5350' }),
        !collapsedSections['bus-arrivals'] && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          ...buses.map((t, i) => React.createElement('div', {
            key: 'bus-' + i,
            style: {
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
              borderRadius: '8px', background: i === 0 ? 'rgba(239,83,80,0.08)' : 'rgba(255,255,255,0.02)',
              border: i === 0 ? '1px solid rgba(239,83,80,0.2)' : '1px solid transparent',
            },
          },
            React.createElement('div', { style: { fontSize: '15px', fontWeight: 700, minWidth: '42px', color: i === 0 ? '#ef5350' : 'var(--text-primary)' } }, t.time),
            React.createElement('span', {
              style: {
                fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                background: t.type === '高速' ? 'rgba(239,83,80,0.2)' : 'rgba(255,152,0,0.2)',
                color: t.type === '高速' ? '#ef5350' : '#ff9800',
                whiteSpace: 'nowrap',
              },
            }, t.type),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.name),
              React.createElement('div', { style: { fontSize: '10px', color: JrTimetable.getLineColor(t.line) } }, t.from + 'から / ' + t.company)
            ),
            React.createElement('div', {
              style: {
                fontSize: t.minsLeft <= 10 ? '13px' : '11px',
                fontWeight: t.minsLeft <= 10 ? 700 : 400,
                color: t.minsLeft <= 5 ? '#ef5350' : t.minsLeft <= 15 ? '#ffa726' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              },
            }, t.minsLeft <= 0 ? '到着' : 'あと' + t.minsLeft + '分')
          ))
        )
      );
    })(),

    // フィルタ表示ラベル
    dayTypeFilter && React.createElement('div', {
      style: { marginBottom: 'var(--space-sm)', fontSize: '12px', color: 'var(--color-primary-light)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'filter_alt'),
      dayTypeFilter === 'weekday' ? '平日データで分析中' : '土日祝データで分析中'
    ),

    // === 夜勤専用セクション ===
    shiftMode === 'night' && nightData && React.createElement(React.Fragment, null,
      // ホテル需要予測
      React.createElement(Card, { style: { marginBottom: 'var(--space-md)', padding: 'var(--space-md)' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', fontWeight: 700, color: '#4fc3f7' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'hotel'),
          'ホテル需要',
          nightData.currentPeak && React.createElement('span', {
            style: { fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(79,195,247,0.2)', color: '#4fc3f7', fontWeight: 600 }
          }, nightData.currentPeak === 'evening' ? '夕食外出ピーク' : nightData.currentPeak === 'night' ? '帰館ピーク' : nightData.currentPeak === 'checkin' ? 'チェックインピーク' : '')
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          ...nightData.hotels.filter(h => h.demandLevel === 'very_high' || h.demandLevel === 'high').map(h =>
            React.createElement('div', { key: h.name, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)' } },
              React.createElement('span', { style: { fontSize: '12px' } }, h.name),
              React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: h.demandLevel === 'very_high' ? '#ff5252' : '#ffa726' } },
                h.demandLevel === 'very_high' ? '需要：高' : '需要：中'
              )
            )
          )
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
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' } },
              new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
              (() => {
                const eDate = entry.date || getLocalDateString(new Date(entry.timestamp));
                if (!entry.shiftDate) return null;
                return entry.shiftDate !== eDate
                  ? React.createElement('span', { style: { fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255,152,0,0.15)', color: '#ffb74d', fontWeight: '600' } }, `${entry.shiftDate}合算`)
                  : React.createElement('span', { style: { fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(0,200,83,0.12)', color: '#66bb6a', fontWeight: '600' } }, '当日合算');
              })()
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

  );
};

})();
