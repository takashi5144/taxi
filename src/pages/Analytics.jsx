(function() {
// Analytics.jsx - 売上分析ページ（DataServiceによるリアルデータ分析）
// v0.3.1: useMemoの依存配列修正 — データ追加後に分析結果が更新されるようにrefreshKeyを導入

// バーチャートコンポーネント（ページ外定義で毎レンダー再生成を防止）
const BarChart = ({ data, valueKey, labelKey, color, maxBars = 30, height = 200, prefix = '¥', showLabels = false, labelInterval = 5 }) => {
  const [activeIdx, setActiveIdx] = React.useState(null);
  const maxVal = Math.max(...data.map(d => d[valueKey]), 1);
  const barData = data.slice(-maxBars);

  const formatLabel = (label) => {
    if (!label) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
      const parts = label.split('-');
      return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
    }
    return label;
  };

  return React.createElement('div', { style: { position: 'relative' } },
    activeIdx !== null && barData[activeIdx] && React.createElement('div', {
      style: {
        position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '6px 12px',
        borderRadius: '8px', fontSize: '13px', fontWeight: 600,
        whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      },
    }, `${formatLabel(barData[activeIdx][labelKey])}  ${prefix}${barData[activeIdx][valueKey].toLocaleString()}`),
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'flex-end', gap: '2px', height: `${height}px`, padding: '0 4px' },
      onMouseLeave: () => setActiveIdx(null),
    },
      barData.map((d, i) => {
        const pct = (d[valueKey] / maxVal) * 100;
        const isActive = activeIdx === i;
        return React.createElement('div', {
          key: i,
          style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', cursor: 'pointer' },
          onMouseEnter: () => setActiveIdx(i),
          onClick: () => setActiveIdx(isActive ? null : i),
        },
          React.createElement('div', {
            style: {
              width: '100%', minHeight: '2px',
              height: `${Math.max(pct, 1)}%`,
              background: d[valueKey] === 0 ? 'rgba(255,255,255,0.05)' : isActive ? '#fff' : color,
              borderRadius: '3px 3px 0 0',
              transition: 'height 0.3s ease, background 0.15s ease',
              opacity: activeIdx !== null && !isActive ? 0.5 : 1,
            },
          })
        );
      })
    ),
    React.createElement('div', {
      style: { display: 'flex', gap: '2px', padding: '4px 4px 0', marginTop: '2px' },
    },
      barData.map((d, i) => {
        const label = formatLabel(d[labelKey]);
        const show = i === 0 || i === barData.length - 1 || (i % labelInterval === 0);
        return React.createElement('div', {
          key: i,
          style: { flex: 1, textAlign: 'center', fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap' },
        }, show ? label : '');
      })
    )
  );
};

const HBarChart = ({ data, nameKey, valueKey, color, prefix = '¥' }) => {
  const maxVal = Math.max(...data.map(d => d[valueKey]), 1);
  return React.createElement('div', { style: { display: 'grid', gap: '6px' } },
    data.map((d, i) => {
      const pct = (d[valueKey] / maxVal) * 100;
      return React.createElement('div', { key: i },
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: '2px' },
        },
          React.createElement('span', null, d[nameKey]),
          React.createElement('span', { style: { fontWeight: 500, color: 'var(--text-primary)' } }, `${prefix}${d[valueKey].toLocaleString()}`)
        ),
        React.createElement('div', {
          style: { background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '8px', overflow: 'hidden' },
        },
          React.createElement('div', {
            style: { width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.3s ease' },
          })
        )
      );
    })
  );
};
window.AnalyticsPage = () => {
  const { useState, useEffect, useMemo, useCallback } = React;
  const [tab, setTab] = useState('daily');
  const [refreshKey, setRefreshKey] = useState(0);
  const [dayTypeFilter, setDayTypeFilter] = useState(null);
  const [gpsDate, setGpsDate] = useState(getLocalDateString());
  const [owDate, setOwDate] = useState(getLocalDateString());
  const [owData, setOwData] = useState(null);
  const [owLoading, setOwLoading] = useState(false);
  const [gpsData, setGpsData] = useState(null);
  const [gpsMultiDay, setGpsMultiDay] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsView, setGpsView] = useState('timeline');

  // localStorageの変更を監視して自動更新（Dashboardと同じパターン）
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA || e.key === APP_CONSTANTS.STORAGE_KEYS.RIVAL_RIDES) {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('storage', handleStorage);

    // 画面に戻った時も更新
    const handleVisibility = () => {
      if (!document.hidden) setRefreshKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('taxi-data-changed', handleDataChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
    };
  }, []);

  // 実車率・天候タブデータ読み込み
  useEffect(() => {
    if (tab !== 'occupancyWeather') return;
    let cancelled = false;
    setOwLoading(true);
    (async () => {
      if (window.GpsLogService) {
        const [todayOcc, hourlyOcc, trend, weatherCorr] = await Promise.all([
          GpsLogService.getDistanceBasedOccupancy(owDate),
          GpsLogService.getHourlyOccupancyFromGps(owDate),
          GpsLogService.getOccupancyTrend(30),
          GpsLogService.getWeatherOccupancyCorrelation(90),
        ]);
        const weatherTimeMatrix = DataService.getWeatherTimeDemandMatrix(dt);
        const tempBands = DataService.getTemperatureBandAnalysis(dt);
        const areaOcc = DataService.getAreaOccupancyAnalysis(dt);
        const sourceEff = DataService.getSourceEfficiencyAnalysis(dt);
        const dayWeather = DataService.getDayWeatherCrossAnalysis(dt);
        const shiftOcc = DataService.getShiftOccupancyAnalysis();
        const passenger = DataService.getPassengerWeatherAnalysis(dt);
        const purposeW = DataService.getPurposeWeatherAnalysis(dt);
        const paymentW = DataService.getPaymentWeatherAnalysis(dt);
        const rivalW = DataService.getRivalWeatherOccupancyAnalysis();
        const waitingOcc = DataService.getWaitingTimeOccupancyAnalysis(dt);
        if (!cancelled) setOwData({ todayOcc, hourlyOcc, trend, weatherCorr, weatherTimeMatrix, tempBands, areaOcc, sourceEff, dayWeather, shiftOcc, passenger, purposeW, paymentW, rivalW, waitingOcc });
      }
      if (!cancelled) setOwLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tab, owDate, refreshKey, dt]);

  // GPS分析データ読み込み
  useEffect(() => {
    if (tab !== 'gps') return;
    let cancelled = false;
    setGpsLoading(true);
    (async () => {
      if (window.GpsLogService) {
        if (gpsView === 'timeline') {
          const data = await GpsLogService.getGpsSegmentAnalysis(gpsDate);
          if (!cancelled) setGpsData(data);
        } else {
          const multi = await GpsLogService.getGpsMultiDaySummary();
          if (!cancelled) setGpsMultiDay(multi);
        }
      }
      if (!cancelled) setGpsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tab, gpsDate, gpsView, refreshKey]);

  // 常に必要なデータ
  const overall = useMemo(() => DataService.getOverallSummary(dayTypeFilter), [refreshKey, dayTypeFilter]);

  // アクティブタブのデータのみ計算（遅延評価）
  const dt = dayTypeFilter;
  const daily = useMemo(() => tab === 'daily' ? DataService.getDailyBreakdown(30, dt) : [], [refreshKey, tab, dt]);
  const monthly = useMemo(() => tab === 'daily' ? DataService.getMonthlyBreakdown(dt) : [], [refreshKey, tab, dt]);
  const dayOfWeek = useMemo(() => tab === 'dayOfWeek' ? DataService.getDayOfWeekBreakdown(dt) : [], [refreshKey, tab, dt]);
  const hourly = useMemo(() => tab === 'hourly' ? DataService.getHourlyBreakdown(dt) : [], [refreshKey, tab, dt]);
  const areas = useMemo(() => tab === 'area' ? DataService.getAreaBreakdown(dt) : { pickups: [], dropoffs: [] }, [refreshKey, tab, dt]);
  const weather = useMemo(() => tab === 'weather' ? DataService.getWeatherBreakdown(dt) : [], [refreshKey, tab, dt]);
  const weatherCorrelation = useMemo(() => tab === 'weather' ? DataService.getWeatherRevenueCorrelation(dt) : [], [refreshKey, tab, dt]);
  const shiftProductivity = useMemo(() => tab === 'shift' ? DataService.getShiftProductivity(dt) : { shifts: [], totals: null }, [refreshKey, tab, dt]);

  const rivalHourly = useMemo(() => tab === 'rival' ? DataService.getRivalHourlyBreakdown() : [], [refreshKey, tab]);
  const rivalDow = useMemo(() => tab === 'rival' ? DataService.getRivalDayOfWeekBreakdown() : [], [refreshKey, tab]);
  const rivalLocs = useMemo(() => tab === 'rival' ? DataService.getRivalLocationBreakdown() : [], [refreshKey, tab]);
  const rivalWeather = useMemo(() => tab === 'rival' ? DataService.getRivalWeatherBreakdown() : [], [refreshKey, tab]);
  const rivalTotal = useMemo(() => tab === 'rival' ? DataService.getRivalEntries().length : 0, [refreshKey, tab]);

  const sourceData = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getSourceBreakdown(dt) : [], [refreshKey, tab, dt]);
  const purposeData = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getPurposeBreakdown(dt) : [], [refreshKey, tab, dt]);
  const areaTime = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getAreaTimeBreakdown(dt) : [], [refreshKey, tab, dt]);
  const unitPrice = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getUnitPriceAnalysis(dt) : null, [refreshKey, tab, dt]);
  const recommendation = useMemo(() => (tab === 'forecast') ? DataService.getBusinessRecommendation(dt) : null, [refreshKey, tab, dt]);
  const sourceAreaPrice = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getSourceAreaPriceBreakdown(dt) : null, [refreshKey, tab, dt]);
  const purposeDay = useMemo(() => (tab === 'purposeDay' || tab === 'forecast') ? DataService.getPurposeDayAnalysis(dt) : null, [refreshKey, tab, dt]);

  // リピーター分析データ
  const repeaterData = useMemo(() => {
    if (tab !== 'repeater') return null;
    const entries = DataService.getFilteredEntries(dt);
    const all = entries;
    const repeaters = all.filter(e => e.isRegisteredUser);
    const nonRepeaters = all.filter(e => !e.isRegisteredUser);
    if (repeaters.length === 0) return { hasData: false };

    // 基本比較
    const rTotal = repeaters.reduce((s, e) => s + (e.amount || 0), 0);
    const nTotal = nonRepeaters.reduce((s, e) => s + (e.amount || 0), 0);
    const rAvg = repeaters.length > 0 ? Math.round(rTotal / repeaters.length) : 0;
    const nAvg = nonRepeaters.length > 0 ? Math.round(nTotal / nonRepeaters.length) : 0;
    const rRate = all.length > 0 ? Math.round((repeaters.length / all.length) * 1000) / 10 : 0;

    // 顧客別ランキング
    const byName = {};
    repeaters.forEach(e => {
      const name = e.customerName || '名前なし';
      if (!byName[name]) byName[name] = { count: 0, total: 0, areas: {}, days: {}, hours: {}, lastDate: '', sources: {} };
      const u = byName[name];
      u.count++;
      u.total += e.amount || 0;
      if (e.pickup) u.areas[e.pickup] = (u.areas[e.pickup] || 0) + 1;
      const dow = e.dayOfWeek || '';
      if (dow) u.days[dow] = (u.days[dow] || 0) + 1;
      if (e.pickupTime) {
        const h = parseInt(e.pickupTime.split(':')[0]);
        if (!isNaN(h)) u.hours[h] = (u.hours[h] || 0) + 1;
      }
      if (e.source) u.sources[e.source] = (u.sources[e.source] || 0) + 1;
      const d = e.date || '';
      if (d > u.lastDate) u.lastDate = d;
    });
    const ranking = Object.entries(byName)
      .map(([name, d]) => ({
        name, count: d.count, total: d.total, avg: Math.round(d.total / d.count),
        topArea: Object.entries(d.areas).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
        topDay: Object.entries(d.days).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
        topHour: Object.entries(d.hours).sort((a, b) => b[1] - a[1])[0]?.[0],
        topSource: Object.entries(d.sources).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
        lastDate: d.lastDate,
        days: d.days, hours: d.hours, areas: d.areas,
      }))
      .sort((a, b) => b.total - a.total);

    // 曜日別リピーター率
    const dowNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dowStats = dowNames.map(d => {
      const dayAll = all.filter(e => e.dayOfWeek === d);
      const dayR = dayAll.filter(e => e.isRegisteredUser);
      return {
        name: d, total: dayAll.length, repeaters: dayR.length,
        rate: dayAll.length > 0 ? Math.round((dayR.length / dayAll.length) * 1000) / 10 : 0,
        amount: dayR.reduce((s, e) => s + (e.amount || 0), 0),
      };
    });

    // 時間帯別リピーター率
    const hourStats = [];
    for (let h = 5; h <= 28; h++) {
      const displayH = h >= 24 ? h - 24 : h;
      const hAll = all.filter(e => {
        if (!e.pickupTime) return false;
        const eh = parseInt(e.pickupTime.split(':')[0]);
        return eh === displayH;
      });
      const hR = hAll.filter(e => e.isRegisteredUser);
      if (hAll.length > 0) {
        hourStats.push({
          hour: displayH, label: `${displayH}時`,
          total: hAll.length, repeaters: hR.length,
          rate: Math.round((hR.length / hAll.length) * 1000) / 10,
          amount: hR.reduce((s, e) => s + (e.amount || 0), 0),
        });
      }
    }

    // エリア別リピーター分析
    const areaMap = {};
    all.forEach(e => {
      const area = e.pickup || '不明';
      if (!areaMap[area]) areaMap[area] = { total: 0, repeaters: 0, rAmount: 0 };
      areaMap[area].total++;
      if (e.isRegisteredUser) {
        areaMap[area].repeaters++;
        areaMap[area].rAmount += e.amount || 0;
      }
    });
    const areaStats = Object.entries(areaMap)
      .filter(([, d]) => d.repeaters > 0)
      .map(([area, d]) => ({
        area, total: d.total, repeaters: d.repeaters,
        rate: Math.round((d.repeaters / d.total) * 1000) / 10,
        amount: d.rAmount, avg: Math.round(d.rAmount / d.repeaters),
      }))
      .sort((a, b) => b.repeaters - a.repeaters)
      .slice(0, 15);

    // 月別リピーター推移
    const monthMap = {};
    all.forEach(e => {
      const m = (e.date || '').substring(0, 7);
      if (!m) return;
      if (!monthMap[m]) monthMap[m] = { total: 0, repeaters: 0, rAmount: 0 };
      monthMap[m].total++;
      if (e.isRegisteredUser) {
        monthMap[m].repeaters++;
        monthMap[m].rAmount += e.amount || 0;
      }
    });
    const monthlyTrend = Object.entries(monthMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, d]) => ({
        month, total: d.total, repeaters: d.repeaters,
        rate: Math.round((d.repeaters / d.total) * 1000) / 10,
        amount: d.rAmount,
      }));

    return {
      hasData: true,
      comparison: {
        rCount: repeaters.length, nCount: nonRepeaters.length,
        rTotal, nTotal, rAvg, nAvg, rRate,
        allCount: all.length, allTotal: rTotal + nTotal,
      },
      ranking, dowStats, hourStats, areaStats, monthlyTrend,
    };
  }, [refreshKey, tab, dt]);

  const hasData = overall.rideCount > 0;

  // データなし画面
  if (!hasData) {
    return React.createElement('div', null,
      React.createElement('h1', { className: 'page-title' },
        React.createElement('span', { className: 'material-icons-round' }, 'analytics'),
        '売上分析'
      ),
      React.createElement(Card, { style: { textAlign: 'center', padding: 'var(--space-2xl)' } },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '64px', color: 'var(--text-muted)', marginBottom: '16px' },
        }, 'bar_chart'),
        React.createElement('h3', { style: { marginBottom: '8px' } }, 'まだデータがありません'),
        React.createElement('p', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } },
          '売上記録ページからデータを追加すると、ここに分析結果が表示されます。'
        )
      )
    );
  }

  const tabs = [
    { id: 'daily', label: '日別', icon: 'calendar_today' },
    { id: 'dayOfWeek', label: '曜日別', icon: 'date_range' },
    { id: 'hourly', label: '時間帯別', icon: 'schedule' },
    { id: 'area', label: 'エリア別', icon: 'place' },
    { id: 'weather', label: '天候別', icon: 'cloud' },
    { id: 'shift', label: '稼働分析', icon: 'work_history' },
    { id: 'purposeDay', label: '用途別', icon: 'category' },
    { id: 'rival', label: '他社分析', icon: 'local_taxi' },
    { id: 'forecast', label: '業務予測', icon: 'tips_and_updates' },
    { id: 'repeater', label: 'リピーター', icon: 'people' },
    { id: 'occupancyWeather', label: '実車率・天候', icon: 'speed' },
    { id: 'gps', label: 'GPS分析', icon: 'gps_fixed' },
  ];

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'analytics'),
      '売上分析'
    ),

    // フィルタ表示ラベル
    dayTypeFilter && React.createElement('div', {
      style: { marginBottom: 'var(--space-sm)', fontSize: '12px', color: 'var(--color-primary-light)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'filter_alt'),
      dayTypeFilter === 'weekday' ? '平日のデータのみ表示中' : '土日祝のデータのみ表示中'
    ),

    // サマリーカード
    React.createElement('div', { className: 'grid grid--4', style: { marginBottom: 'var(--space-lg)' } },
      [
        { label: '累計売上（税込）', value: `¥${overall.totalAmount.toLocaleString()}`, sub: `税抜¥${Math.floor(overall.totalAmount / 1.1).toLocaleString()} 税¥${(overall.totalAmount - Math.floor(overall.totalAmount / 1.1)).toLocaleString()}`, icon: 'payments', color: 'var(--color-secondary)' },
        { label: '累計乗車', value: `${overall.rideCount}回`, icon: 'people', color: 'var(--color-primary-light)' },
        { label: '平均単価（税込）', value: `¥${overall.avgAmount.toLocaleString()}`, sub: `税抜¥${Math.floor(overall.avgAmount / 1.1).toLocaleString()} 税¥${(overall.avgAmount - Math.floor(overall.avgAmount / 1.1)).toLocaleString()}`, icon: 'price_check', color: 'var(--color-accent)' },
        { label: '日平均（税込）', value: `¥${overall.dailyAvg.toLocaleString()}`, sub: `税抜¥${Math.floor(overall.dailyAvg / 1.1).toLocaleString()} 税¥${(overall.dailyAvg - Math.floor(overall.dailyAvg / 1.1)).toLocaleString()}`, icon: 'trending_up', color: 'var(--color-warning)' },
      ].map((s, i) =>
        React.createElement(Card, { key: i, className: 'stat-card' },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '28px', color: s.color, marginBottom: '4px' },
          }, s.icon),
          React.createElement('div', { className: 'stat-card__value', style: { fontSize: 'var(--font-size-xl)' } }, s.value),
          s.sub && React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } }, s.sub),
          React.createElement('div', { className: 'stat-card__label' }, s.label)
        )
      )
    ),

    // 当月合計
    (() => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const cm = monthly.find(m => m.month === currentMonth);
      const amt = cm ? cm.amount : 0;
      const cnt = cm ? cm.count : 0;
      const taxExcl = Math.floor(amt / 1.1);
      const tax = amt - taxExcl;
      return React.createElement('div', {
        style: { background: 'linear-gradient(135deg, rgba(26,115,232,0.15), rgba(255,167,38,0.10))', border: '1px solid rgba(26,115,232,0.3)', borderRadius: '12px', padding: '16px 20px', marginBottom: 'var(--space-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: 'var(--color-primary-light)' } }, 'calendar_month'),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, `${now.getFullYear()}年${now.getMonth() + 1}月の売上合計`),
            React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } }, `${cnt}回乗車`)
          )
        ),
        React.createElement('div', { style: { textAlign: 'right' } },
          React.createElement('div', { style: { fontSize: '24px', fontWeight: 800, color: 'var(--color-secondary)' } }, `¥${amt.toLocaleString()}`),
          React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } }, `税抜¥${taxExcl.toLocaleString()}　税¥${tax.toLocaleString()}`)
        )
      );
    })(),

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

    // タブ切り替え
    React.createElement('div', {
      style: { display: 'flex', gap: '4px', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' },
    },
      tabs.map(t =>
        React.createElement('button', {
          key: t.id,
          onClick: () => setTab(t.id),
          style: {
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', border: 'none', borderRadius: '20px', cursor: 'pointer',
            fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)',
            background: tab === t.id ? 'rgba(26,115,232,0.2)' : 'rgba(255,255,255,0.04)',
            color: tab === t.id ? 'var(--color-primary-light)' : 'var(--text-secondary)',
            transition: 'all 0.2s ease',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, t.icon),
          t.label
        )
      )
    ),

    // 日別タブ
    tab === 'daily' && React.createElement(React.Fragment, null,
      React.createElement(Card, { title: '過去30日間の売上推移', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, { data: daily, valueKey: 'amount', labelKey: 'date', color: 'var(--color-primary-light)', height: 180, showLabels: true, labelInterval: 5 })
      ),
      monthly.length > 0 && React.createElement(Card, { title: '月別集計', style: { marginBottom: 'var(--space-lg)' } },
        monthly.map((m, i) =>
          React.createElement('div', {
            key: i,
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
          },
            React.createElement('span', { style: { fontWeight: 500 } }, m.month),
            React.createElement('div', { style: { textAlign: 'right' } },
              React.createElement('div', { style: { display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-end' } },
                React.createElement('span', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, `${m.count}回`),
                React.createElement('span', { style: { fontWeight: 700, color: 'var(--color-secondary)' } }, `¥${m.amount.toLocaleString()}`)
              ),
              React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(m.amount / 1.1).toLocaleString()} 税¥${(m.amount - Math.floor(m.amount / 1.1)).toLocaleString()}`)
            )
          )
        )
      )
    ),

    // 曜日別タブ
    tab === 'dayOfWeek' && React.createElement(React.Fragment, null,
      React.createElement(Card, { title: '曜日別売上合計', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, { data: dayOfWeek, valueKey: 'amount', labelKey: 'name', color: 'var(--color-accent)', height: 160, showLabels: true, labelInterval: 1 })
      ),
      React.createElement(Card, { title: '曜日別詳細' },
        dayOfWeek.map((d, i) =>
          React.createElement('div', {
            key: i,
            style: { display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px', gap: '8px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
          },
            React.createElement('span', {
              style: { fontWeight: 700, color: (d.index === 0 || d.index === 6) ? 'var(--color-danger)' : 'var(--text-primary)' },
            }, d.name),
            React.createElement('div', {
              style: { background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '6px', overflow: 'hidden' },
            },
              React.createElement('div', {
                style: { width: `${d.count > 0 ? (d.amount / Math.max(...dayOfWeek.map(x => x.amount), 1)) * 100 : 0}%`, height: '100%', background: 'var(--color-accent)', borderRadius: '4px' },
              })
            ),
            React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', textAlign: 'right' } }, `${d.count}回`),
            React.createElement('div', { style: { textAlign: 'right' } },
              React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', fontWeight: 500 } }, `¥${d.amount.toLocaleString()}`),
              React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(d.amount / 1.1).toLocaleString()} 税¥${(d.amount - Math.floor(d.amount / 1.1)).toLocaleString()}`)
            )
          )
        )
      )
    ),

    // 時間帯別タブ
    tab === 'hourly' && React.createElement(React.Fragment, null,
      React.createElement(Card, { title: '時間帯別売上平均', subtitle: '各時間帯の平均売上額', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, { data: hourly, valueKey: 'avg', labelKey: 'label', color: 'var(--color-warning)', height: 160, maxBars: 24, showLabels: true, labelInterval: 3 })
      ),
      React.createElement(Card, { title: '売上上位の時間帯' },
        (() => {
          const sorted = [...hourly].filter(h => h.count > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
          return sorted.length > 0
            ? React.createElement(HBarChart, { data: sorted, nameKey: 'label', valueKey: 'amount', color: 'var(--color-warning)' })
            : React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' } }, 'データなし');
        })()
      )
    ),

    // エリア別タブ
    tab === 'area' && React.createElement('div', { className: 'grid grid--2', style: { gap: 'var(--space-lg)' } },
      // 乗車地
      React.createElement(Card, { title: '乗車地ランキング', subtitle: `上位 ${Math.min(areas.pickups.length, 10)} 件` },
        areas.pickups.length === 0
          ? React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' } }, '乗車地データなし')
          : areas.pickups.map((p, i) =>
              React.createElement('div', {
                key: i,
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  React.createElement('span', {
                    style: {
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: i < 3 ? 'var(--color-secondary)' : 'rgba(255,255,255,0.1)',
                      color: i < 3 ? 'var(--text-dark)' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-xs)', fontWeight: 700,
                    },
                  }, `${i + 1}`),
                  React.createElement('span', { style: { fontSize: 'var(--font-size-sm)' } }, p.name)
                ),
                React.createElement('div', { style: { textAlign: 'right' } },
                  React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', fontWeight: 500 } }, `${p.count}回`),
                  React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--color-secondary)' } }, `¥${p.amount.toLocaleString()}`),
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(p.amount / 1.1).toLocaleString()} 税¥${(p.amount - Math.floor(p.amount / 1.1)).toLocaleString()}`)
                )
              )
            )
      ),
      // 降車地
      React.createElement(Card, { title: '降車地ランキング', subtitle: `上位 ${Math.min(areas.dropoffs.length, 10)} 件` },
        areas.dropoffs.length === 0
          ? React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' } }, '降車地データなし')
          : areas.dropoffs.map((p, i) =>
              React.createElement('div', {
                key: i,
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  React.createElement('span', {
                    style: {
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: i < 3 ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)',
                      color: i < 3 ? '#fff' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-xs)', fontWeight: 700,
                    },
                  }, `${i + 1}`),
                  React.createElement('span', { style: { fontSize: 'var(--font-size-sm)' } }, p.name)
                ),
                React.createElement('div', { style: { textAlign: 'right' } },
                  React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', fontWeight: 500 } }, `${p.count}回`),
                  React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--color-accent)' } }, `¥${p.amount.toLocaleString()}`),
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(p.amount / 1.1).toLocaleString()} 税¥${(p.amount - Math.floor(p.amount / 1.1)).toLocaleString()}`)
                )
              )
            )
      )
    ),

    // 天候別タブ
    tab === 'weather' && React.createElement(React.Fragment, null,
      React.createElement(Card, { title: '天候別 平均売上', style: { marginBottom: 'var(--space-lg)' } },
        (() => {
          const withData = weather.filter(w => w.count > 0);
          return withData.length > 0
            ? React.createElement(BarChart, { data: withData, valueKey: 'avg', labelKey: 'name', color: 'var(--color-primary-light)', height: 160 })
            : React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' } }, 'データなし');
        })(),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-around', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '6px' },
        }, weather.filter(w => w.count > 0).map(w => React.createElement('span', { key: w.name, style: { display: 'flex', alignItems: 'center', gap: '2px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } },
            w.name === '晴れ' ? 'wb_sunny' : w.name === '曇り' ? 'cloud' : w.name === '雨' ? 'water_drop' : w.name === '雪' ? 'ac_unit' : 'help_outline'
          ), w.name
        )))
      ),
      React.createElement(Card, { title: '天候別 合計売上', style: { marginBottom: 'var(--space-lg)' } },
        (() => {
          const withData = weather.filter(w => w.count > 0);
          return withData.length > 0
            ? React.createElement(HBarChart, { data: withData, nameKey: 'name', valueKey: 'amount', color: 'var(--color-primary-light)' })
            : React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' } }, 'データなし');
        })()
      ),
      React.createElement(Card, { title: '天候別 詳細' },
        weather.map((w, i) =>
          React.createElement('div', {
            key: i,
            style: { display: 'grid', gridTemplateColumns: '80px 1fr 60px 80px 80px', gap: '8px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
          },
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } },
                w.name === '晴れ' ? 'wb_sunny' : w.name === '曇り' ? 'cloud' : w.name === '雨' ? 'water_drop' : w.name === '雪' ? 'ac_unit' : 'help_outline'
              ), w.name
            ),
            React.createElement('div', {
              style: { background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '6px', overflow: 'hidden' },
            },
              React.createElement('div', {
                style: { width: `${w.count > 0 ? (w.amount / Math.max(...weather.map(x => x.amount), 1)) * 100 : 0}%`, height: '100%', background: 'var(--color-primary-light)', borderRadius: '4px' },
              })
            ),
            React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', textAlign: 'right' } }, `${w.count}回`),
            React.createElement('div', { style: { textAlign: 'right' } },
              React.createElement('div', { style: { fontSize: 'var(--font-size-sm)' } }, `¥${w.avg.toLocaleString()}`),
              React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(w.avg / 1.1).toLocaleString()}`)
            ),
            React.createElement('div', { style: { textAlign: 'right' } },
              React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-secondary)' } }, `¥${w.amount.toLocaleString()}`),
              React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(w.amount / 1.1).toLocaleString()} 税¥${(w.amount - Math.floor(w.amount / 1.1)).toLocaleString()}`)
            )
          )
        )
      ),

      // 天気×売上相関カード
      weatherCorrelation.filter(wc => wc.dayCount > 0).length > 0 && React.createElement(Card, { title: '天気×売上 相関分析', style: { marginTop: 'var(--space-lg)' } },
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' } },
          ...weatherCorrelation.filter(wc => wc.dayCount > 0).map(wc => {
            const weatherIcon = wc.name === '晴れ' ? 'wb_sunny' : wc.name === '曇り' ? 'cloud' : wc.name === '雨' ? 'water_drop' : 'ac_unit';
            return React.createElement('div', {
              key: wc.name,
              style: { padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' },
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-primary-light)' } }, weatherIcon),
                React.createElement('span', { style: { fontWeight: 600, fontSize: '14px' } }, wc.name)
              ),
              React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 } },
                React.createElement('div', null, `日平均売上: ¥${wc.dailyAvgAmount.toLocaleString()}`),
                React.createElement('div', null, `平均単価: ¥${wc.avgPrice.toLocaleString()}`),
                React.createElement('div', null, `日平均乗車: ${wc.dailyAvgRides}回`),
                React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: '11px' } }, `(${wc.dayCount}日分)`)
              )
            );
          })
        )
      )
    ),

    // 稼働分析タブ
    tab === 'shift' && React.createElement(React.Fragment, null,
      shiftProductivity.shifts.length === 0
        ? React.createElement(Card, { style: { textAlign: 'center', padding: 'var(--space-2xl)' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--text-muted)', marginBottom: '12px' } }, 'work_history'),
            React.createElement('p', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, 'シフトデータがありません。始業/終業を記録すると、ここに稼働分析が表示されます。')
          )
        : React.createElement(React.Fragment, null,
            // サマリ
            shiftProductivity.totals && React.createElement('div', { className: 'grid grid--4', style: { marginBottom: 'var(--space-lg)' } },
              [
                { label: '勤務回数', value: `${shiftProductivity.totals.shiftCount}回`, icon: 'event_available', color: 'var(--color-primary-light)' },
                { label: '合計売上', value: `¥${shiftProductivity.totals.totalAmount.toLocaleString()}`, icon: 'payments', color: 'var(--color-secondary)' },
                { label: '平均時給', value: `¥${shiftProductivity.totals.avgHourlyRate.toLocaleString()}`, icon: 'speed', color: 'var(--color-accent)' },
                { label: '平均単価', value: `¥${shiftProductivity.totals.avgPrice.toLocaleString()}`, icon: 'price_check', color: 'var(--color-warning)' },
              ].map((s, i) =>
                React.createElement(Card, { key: i, className: 'stat-card' },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: s.color, marginBottom: '4px' } }, s.icon),
                  React.createElement('div', { className: 'stat-card__value', style: { fontSize: 'var(--font-size-lg)' } }, s.value),
                  React.createElement('div', { className: 'stat-card__label' }, s.label)
                )
              )
            ),

            // テーブル
            React.createElement(Card, { title: '勤務別 詳細' },
              React.createElement('div', { style: { overflowX: 'auto' } },
                React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '600px' } },
                  React.createElement('thead', null,
                    React.createElement('tr', null,
                      ['日付', '曜日', '勤務時間', '休憩', '実働', '売上', '乗車数', '時給', '平均単価'].map(h =>
                        React.createElement('th', { key: h, style: { padding: '8px 6px', textAlign: h === '日付' || h === '曜日' ? 'left' : 'right', borderBottom: '2px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' } }, h)
                      )
                    )
                  ),
                  React.createElement('tbody', null,
                    ...shiftProductivity.shifts.map((s, i) => {
                      const fmtMin = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
                      const isSun = s.dayOfWeek === '日';
                      const isSat = s.dayOfWeek === '土';
                      return React.createElement('tr', { key: i, style: { borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                        React.createElement('td', { style: { padding: '8px 6px', whiteSpace: 'nowrap' } }, `${s.date} ${s.startTime}-${s.endTime}`),
                        React.createElement('td', { style: { padding: '8px 6px', color: isSun ? '#ef4444' : isSat ? '#3b82f6' : 'var(--text-primary)' } }, s.dayOfWeek),
                        React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right' } }, fmtMin(s.workMinutesGross)),
                        React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right', color: 'var(--text-muted)' } }, fmtMin(s.breakMinutes)),
                        React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right' } }, fmtMin(s.actualMinutes)),
                        React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: 'var(--color-secondary)' } }, `¥${s.totalAmount.toLocaleString()}`),
                        React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right' } }, `${s.rideCount}回`),
                        React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right', fontWeight: 500, color: s.hourlyRate >= (shiftProductivity.totals?.avgHourlyRate || 0) ? '#4caf50' : '#ff9800' } }, `¥${s.hourlyRate.toLocaleString()}`),
                        React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right' } }, `¥${s.avgPrice.toLocaleString()}`)
                      );
                    }),
                    // 合計/平均行
                    shiftProductivity.totals && React.createElement('tr', { style: { borderTop: '2px solid rgba(255,255,255,0.15)', fontWeight: 700 } },
                      React.createElement('td', { style: { padding: '8px 6px' } }, '合計/平均'),
                      React.createElement('td', null, ''),
                      React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right' } }, `${Math.floor(shiftProductivity.totals.totalWorkMinutes / 60)}h${String(shiftProductivity.totals.totalWorkMinutes % 60).padStart(2, '0')}m`),
                      React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right', color: 'var(--text-muted)' } }, `${Math.floor(shiftProductivity.totals.totalBreakMinutes / 60)}h${String(shiftProductivity.totals.totalBreakMinutes % 60).padStart(2, '0')}m`),
                      React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right' } }, `${Math.floor(shiftProductivity.totals.totalActualMinutes / 60)}h${String(shiftProductivity.totals.totalActualMinutes % 60).padStart(2, '0')}m`),
                      React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--color-secondary)' } }, `¥${shiftProductivity.totals.totalAmount.toLocaleString()}`),
                      React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right' } }, `${shiftProductivity.totals.totalRides}回`),
                      React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right', color: '#4caf50' } }, `¥${shiftProductivity.totals.avgHourlyRate.toLocaleString()}`),
                      React.createElement('td', { style: { padding: '8px 6px', textAlign: 'right' } }, `¥${shiftProductivity.totals.avgPrice.toLocaleString()}`)
                    )
                  )
                )
              )
            )
          )
    ),

    // 他社分析タブ
    tab === 'rival' && React.createElement(React.Fragment, null,
      // サマリー
      React.createElement(Card, {
        style: { marginBottom: 'var(--space-lg)', textAlign: 'center', padding: 'var(--space-lg)' },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '28px', color: 'var(--color-warning)' } }, 'local_taxi'),
          React.createElement('span', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, '他社乗車記録数')
        ),
        React.createElement('div', { style: { fontSize: '2rem', fontWeight: 700 } }, `${rivalTotal}件`)
      ),

      rivalTotal === 0 && React.createElement(Card, { style: { textAlign: 'center', padding: 'var(--space-2xl)' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--text-muted)', marginBottom: '12px' } }, 'info'),
        React.createElement('p', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, '他社乗車データを記録すると、ここに分析結果が表示されます。')
      ),

      // 時間帯別
      rivalTotal > 0 && React.createElement(Card, { title: '時間帯別 他社乗車件数', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, { data: rivalHourly, valueKey: 'count', labelKey: 'label', color: 'var(--color-warning)', height: 140, maxBars: 24, prefix: '' }),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '6px', padding: '0 4px' },
        },
          React.createElement('span', null, '0時'),
          React.createElement('span', null, '6時'),
          React.createElement('span', null, '12時'),
          React.createElement('span', null, '18時'),
          React.createElement('span', null, '23時')
        )
      ),

      // 曜日別
      rivalTotal > 0 && React.createElement(Card, { title: '曜日別 他社乗車件数', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, { data: rivalDow, valueKey: 'count', labelKey: 'name', color: 'var(--color-accent)', height: 140, prefix: '' }),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-around', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '6px' },
        }, rivalDow.map(d => React.createElement('span', { key: d.name }, d.name)))
      ),

      // 場所ランキング
      rivalTotal > 0 && rivalLocs.length > 0 && React.createElement(Card, { title: '乗車場所ランキング TOP10', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(HBarChart, { data: rivalLocs, nameKey: 'name', valueKey: 'count', color: 'var(--color-warning)', prefix: '' })
      ),

      // 天候別
      rivalTotal > 0 && React.createElement(Card, { title: '天候別 他社乗車件数' },
        React.createElement(HBarChart, { data: rivalWeather.filter(w => w.count > 0), nameKey: 'name', valueKey: 'count', color: 'var(--color-primary-light)', prefix: '' })
      )
    ),

    // 用途別分析タブ
    tab === 'purposeDay' && React.createElement(React.Fragment, null,

      // A. 用途×曜日ヒートマップ
      React.createElement(Card, {
        title: '用途×曜日 乗車パターン',
        subtitle: '各曜日にどの用途が多いか',
        style: { marginBottom: 'var(--space-lg)' },
      },
        React.createElement('div', { style: { overflowX: 'auto' } },
          React.createElement('table', {
            style: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' },
          },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', { style: { padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.1)' } }, '用途'),
                ...purposeDay.dayNames.map(d =>
                  React.createElement('th', {
                    key: d,
                    style: { padding: '8px 4px', textAlign: 'center', color: (d === '日' ? '#ef4444' : d === '土' ? '#3b82f6' : 'var(--text-secondary)'), fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', minWidth: '36px' },
                  }, d)
                )
              )
            ),
            React.createElement('tbody', null,
              (() => {
                const allCounts = purposeDay.purposes.flatMap(p => purposeDay.dayNames.map(d => purposeDay.matrix[p][d].count));
                const maxCount = Math.max(...allCounts, 1);
                return purposeDay.purposes.map(p => {
                  const rowTotal = purposeDay.dayNames.reduce((s, d) => s + purposeDay.matrix[p][d].count, 0);
                  if (rowTotal === 0) return null;
                  return React.createElement('tr', { key: p },
                    React.createElement('td', {
                      style: { padding: '6px', fontWeight: 500, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.05)' },
                    }, p),
                    ...purposeDay.dayNames.map(d => {
                      const c = purposeDay.matrix[p][d].count;
                      const intensity = c / maxCount;
                      return React.createElement('td', {
                        key: d,
                        style: {
                          padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: c > 0 ? `rgba(26,115,232,${0.1 + intensity * 0.6})` : 'transparent',
                          color: c > 0 ? '#fff' : 'var(--text-muted)',
                          fontWeight: c > 0 ? 600 : 400, borderRadius: '4px',
                        },
                        title: `${p} ${d}曜: ${c}件 ¥${purposeDay.matrix[p][d].amount.toLocaleString()}`,
                      }, c > 0 ? c : '-');
                    })
                  );
                });
              })()
            )
          )
        )
      ),

      // B. 日種別（平日/休日/大型連休）分析
      React.createElement(Card, {
        title: '日種別×用途 分析',
        subtitle: '平日・休日・大型連休での乗車傾向',
        style: { marginBottom: 'var(--space-lg)' },
      },
        React.createElement('div', {
          style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' },
        },
          React.createElement('span', null, `平日: ${purposeDay.dayTypeCounts.weekday}日分`),
          React.createElement('span', null, `休日: ${purposeDay.dayTypeCounts.holiday}日分`),
          React.createElement('span', null, `大型連休: ${purposeDay.dayTypeCounts.longHoliday}日分`)
        ),
        React.createElement('div', { style: { display: 'grid', gap: 'var(--space-md)' } },
          [
            { key: 'weekday', label: '平日', color: 'rgba(26,115,232,0.7)', icon: 'work' },
            { key: 'holiday', label: '休日', color: 'rgba(76,175,80,0.7)', icon: 'weekend' },
            { key: 'longHoliday', label: '大型連休', color: 'rgba(255,152,0,0.7)', icon: 'celebration' },
          ].map(dt => {
            const sorted = purposeDay.purposes
              .map(p => ({ name: p, count: purposeDay.typeMatrix[p][dt.key].count, amount: purposeDay.typeMatrix[p][dt.key].amount }))
              .filter(x => x.count > 0)
              .sort((a, b) => b.count - a.count);
            if (sorted.length === 0) return null;
            const totalCount = sorted.reduce((s, x) => s + x.count, 0);
            return React.createElement('div', { key: dt.key },
              React.createElement('div', {
                style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: dt.color } }, dt.icon),
                React.createElement('span', { style: { fontWeight: 600 } }, dt.label),
                React.createElement('span', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, `(${totalCount}件)`)
              ),
              // 積み上げバー
              React.createElement('div', {
                style: { display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', marginBottom: '6px' },
              },
                ...sorted.slice(0, 5).map((s, i) => {
                  const pct = (s.count / totalCount) * 100;
                  const colors = ['rgba(26,115,232,0.8)', 'rgba(76,175,80,0.8)', 'rgba(255,193,7,0.8)', 'rgba(244,67,54,0.8)', 'rgba(156,39,176,0.8)'];
                  return React.createElement('div', {
                    key: s.name,
                    style: {
                      width: pct + '%', background: colors[i % colors.length],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap',
                    },
                    title: `${s.name}: ${s.count}件 (${Math.round(pct)}%) ¥${s.amount.toLocaleString()}`,
                  }, pct >= 12 ? s.name : '');
                })
              ),
              // ラベル行
              React.createElement('div', {
                style: { display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)' },
              },
                ...sorted.slice(0, 5).map((s, i) => {
                  const colors = ['#1a73e8', '#4caf50', '#ffc107', '#f44336', '#9c27b0'];
                  return React.createElement('span', {
                    key: s.name,
                    style: { display: 'flex', alignItems: 'center', gap: '4px' },
                  },
                    React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: colors[i % colors.length], display: 'inline-block' } }),
                    `${s.name} ${s.count}件`
                  );
                })
              )
            );
          })
        )
      ),

      // C. 今後30日の用途予測
      React.createElement(Card, {
        title: '今後30日間の用途予測',
        subtitle: '過去データから予測される乗車用途',
        style: { marginBottom: 'var(--space-lg)' },
      },
        purposeDay.predictions.length === 0
          ? React.createElement('div', { style: { textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-lg)' } }, 'データが不足しています')
          : React.createElement('div', { style: { display: 'grid', gap: '4px' } },
              purposeDay.predictions.map(pred => {
                const dayTypeLabel = pred.dayType === 'weekday' ? '平日' : pred.dayType === 'holiday' ? '休日' : '大型連休';
                const dayTypeColor = pred.dayType === 'weekday' ? 'rgba(26,115,232,0.15)' : pred.dayType === 'holiday' ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.15)';
                const dowColor = pred.dayOfWeek === '日' ? '#ef4444' : pred.dayOfWeek === '土' ? '#3b82f6' : 'var(--text-primary)';
                // 日付をM/D形式に
                const parts = pred.date.split('-');
                const dateLabel = `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                return React.createElement('div', {
                  key: pred.date,
                  style: {
                    display: 'grid', gridTemplateColumns: '60px 30px 60px 1fr', gap: '8px', alignItems: 'center',
                    padding: '8px 10px', borderRadius: '6px', background: dayTypeColor,
                  },
                },
                  React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', fontWeight: 600 } }, dateLabel),
                  React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', fontWeight: 600, color: dowColor } }, `(${pred.dayOfWeek})`),
                  React.createElement('span', {
                    style: { fontSize: '10px', padding: '2px 6px', borderRadius: '10px', textAlign: 'center',
                      background: pred.dayType === 'weekday' ? 'rgba(26,115,232,0.3)' : pred.dayType === 'holiday' ? 'rgba(76,175,80,0.3)' : 'rgba(255,152,0,0.3)',
                      color: '#fff', fontWeight: 500 },
                  }, dayTypeLabel),
                  React.createElement('div', {
                    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
                  },
                    ...pred.topPurposes.map((tp, i) =>
                      React.createElement('span', {
                        key: tp.purpose,
                        style: {
                          fontSize: '11px', padding: '2px 8px', borderRadius: '12px',
                          background: i === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                          color: i === 0 ? '#fff' : 'var(--text-secondary)',
                          fontWeight: i === 0 ? 600 : 400,
                        },
                        title: `曜日実績: ${tp.dowCount}件 / 日種別実績: ${tp.typeCount}件`,
                      }, tp.purpose)
                    ),
                    pred.holiday && React.createElement('span', {
                      style: { fontSize: '10px', color: '#ef4444', fontWeight: 500 },
                    }, pred.holiday)
                  )
                );
              })
            )
      ),

      // D. 月別トレンド
      Object.keys(purposeDay.monthPurpose).length > 0 && React.createElement(Card, {
        title: '月別 用途トレンド',
        subtitle: '月ごとの用途別乗車件数推移',
        style: { marginBottom: 'var(--space-lg)' },
      },
        React.createElement('div', { style: { overflowX: 'auto' } },
          React.createElement('table', {
            style: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' },
          },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', { style: { padding: '6px', textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.1)' } }, '月'),
                ...purposeDay.purposes.filter(p => {
                  return Object.values(purposeDay.monthPurpose).some(mp => mp[p] > 0);
                }).map(p =>
                  React.createElement('th', { key: p, style: { padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.1)', minWidth: '40px' } }, p)
                )
              )
            ),
            React.createElement('tbody', null,
              ...Object.entries(purposeDay.monthPurpose)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([month, data]) => {
                  const activePurposes = purposeDay.purposes.filter(p => Object.values(purposeDay.monthPurpose).some(mp => mp[p] > 0));
                  const maxInRow = Math.max(...activePurposes.map(p => data[p] || 0), 1);
                  // YYYY-MM → YYYY年M月
                  const [y, m] = month.split('-');
                  const monthLabel = `${y}年${parseInt(m)}月`;
                  return React.createElement('tr', { key: month },
                    React.createElement('td', {
                      style: { padding: '6px', fontWeight: 500, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.05)' },
                    }, monthLabel),
                    ...activePurposes.map(p => {
                      const cnt = data[p] || 0;
                      const allMonthMax = Math.max(...Object.values(purposeDay.monthPurpose).map(mp => mp[p] || 0), 1);
                      const intensity = cnt / allMonthMax;
                      return React.createElement('td', {
                        key: p,
                        style: {
                          padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: cnt > 0 ? `rgba(76,175,80,${0.1 + intensity * 0.5})` : 'transparent',
                          color: cnt > 0 ? '#fff' : 'var(--text-muted)', fontWeight: cnt > 0 ? 600 : 400, borderRadius: '3px',
                        },
                      }, cnt > 0 ? cnt : '-');
                    })
                  );
                })
            )
          )
        )
      )
    ),

    // 業務予測タブ
    tab === 'forecast' && React.createElement(React.Fragment, null,

      // A. 今日のおすすめカード
      recommendation && React.createElement(Card, {
        style: { marginBottom: 'var(--space-lg)', padding: 'var(--space-lg)' },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '28px', color: 'var(--color-accent)' } }, 'tips_and_updates'),
          React.createElement('h3', { style: { margin: 0 } }, '今日のおすすめ')
        ),
        React.createElement('div', {
          style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' },
        },
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'calendar_today'),
            recommendation.currentCondition.dayOfWeek + '曜日'
          ),
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'schedule'),
            recommendation.currentCondition.hour + '時台'
          )
        ),

        // 推定客単価
        React.createElement('div', {
          style: {
            textAlign: 'center', padding: 'var(--space-lg)', marginBottom: 'var(--space-md)',
            background: 'rgba(0,200,83,0.08)', borderRadius: '12px', border: '1px solid rgba(0,200,83,0.2)',
          },
        },
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: '4px' } }, '推定客単価'),
          React.createElement('div', { style: { fontSize: '2rem', fontWeight: 700, color: 'var(--color-accent)' } },
            recommendation.estimatedUnitPrice > 0 ? '¥' + recommendation.estimatedUnitPrice.toLocaleString() : 'データ不足'
          ),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '4px' } },
            recommendation.currentCondition.dayOfWeek + '曜 ' + recommendation.currentCondition.hour + '時台の平均'
          )
        ),

        // TOP3エリア & 時間帯を横並び
        React.createElement('div', {
          style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' },
        },
          // 売上が高いエリアTOP3
          React.createElement('div', null,
            React.createElement('div', {
              style: { fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' },
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)' } }, 'place'),
              '売上が高いエリア'
            ),
            recommendation.topAreas.length > 0
              ? recommendation.topAreas.map((a, i) =>
                  React.createElement('div', {
                    key: i,
                    style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 'var(--font-size-sm)' },
                  },
                    React.createElement('span', null, (i + 1) + '. ' + a.name),
                    React.createElement('span', { style: { fontWeight: 500, color: 'var(--color-secondary)' } }, '¥' + a.amount.toLocaleString())
                  )
                )
              : React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, 'この時間帯のデータなし')
          ),

          // 単価が高い時間帯TOP3
          React.createElement('div', null,
            React.createElement('div', {
              style: { fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' },
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-warning)' } }, 'schedule'),
              '単価が高い時間帯'
            ),
            recommendation.topHours.length > 0
              ? recommendation.topHours.map((h, i) =>
                  React.createElement('div', {
                    key: i,
                    style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 'var(--font-size-sm)' },
                  },
                    React.createElement('span', null, (i + 1) + '. ' + h.name),
                    React.createElement('span', { style: { fontWeight: 500, color: 'var(--color-secondary)' } }, '¥' + h.avg.toLocaleString())
                  )
                )
              : React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, 'この曜日のデータなし')
          )
        )
      ),

      // B. エリア×時間帯クロス分析
      areaTime.length > 0 && React.createElement(Card, { title: 'エリア×時間帯クロス分析', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement('div', { style: { overflowX: 'auto' } },
          React.createElement('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: '120px repeat(6, 1fr)',
              gap: '2px',
              fontSize: 'var(--font-size-xs)',
              minWidth: '500px',
            },
          },
            // ヘッダー行
            React.createElement('div', { style: { padding: '6px 4px', fontWeight: 600, color: 'var(--text-secondary)' } }, 'エリア'),
            ...['0-3', '4-7', '8-11', '12-15', '16-19', '20-23'].map(label =>
              React.createElement('div', { key: label, style: { padding: '6px 4px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' } }, label + '時')
            ),

            // データ行（上位5エリア）
            ...areaTime.slice(0, 5).flatMap((a) => {
              const timeSlots = [
                { start: 0, end: 3 }, { start: 4, end: 7 }, { start: 8, end: 11 },
                { start: 12, end: 15 }, { start: 16, end: 19 }, { start: 20, end: 23 },
              ];
              const slotData = timeSlots.map(slot => {
                let count = 0, amount = 0;
                for (let h = slot.start; h <= slot.end; h++) {
                  count += a.hours[h].count;
                  amount += a.hours[h].amount;
                }
                return { count, amount };
              });
              const maxCount = Math.max(...slotData.map(s => s.count), 1);

              return [
                React.createElement('div', {
                  key: a.area + '-label',
                  style: { padding: '8px 4px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid rgba(255,255,255,0.06)' },
                  title: a.area,
                }, a.area.length > 10 ? a.area.slice(0, 10) + '…' : a.area),
                ...slotData.map((s, si) => {
                  const intensity = s.count > 0 ? Math.max(0.1, s.count / maxCount) : 0;
                  return React.createElement('div', {
                    key: a.area + '-' + si,
                    style: {
                      padding: '8px 4px', textAlign: 'center', borderRadius: '4px',
                      background: intensity > 0 ? 'rgba(26,115,232,' + (intensity * 0.5) + ')' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      color: intensity > 0.5 ? '#fff' : 'var(--text-secondary)',
                    },
                    title: a.area + ' ' + ['0-3', '4-7', '8-11', '12-15', '16-19', '20-23'][si] + '時: ' + s.count + '件 ¥' + s.amount.toLocaleString(),
                  }, s.count > 0 ? s.count + '件' : '-');
                })
              ];
            })
          )
        ),
        React.createElement('div', {
          style: { marginTop: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' },
        },
          React.createElement('span', null, '色の濃さ = 件数の多さ'),
          React.createElement('span', null, '|'),
          React.createElement('span', null, 'セルをタップで詳細表示')
        )
      ),

      // C. 客単価分析
      unitPrice && React.createElement(Card, { title: '客単価分析', style: { marginBottom: 'var(--space-lg)' } },
        // 曜日別
        React.createElement('div', { style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('h4', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '8px' } }, '曜日別 平均客単価'),
          React.createElement(BarChart, {
            data: unitPrice.byDayOfWeek, valueKey: 'avg', labelKey: 'name', color: 'var(--color-primary-light)', height: 140,
          }),
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-around', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '6px' },
          }, unitPrice.byDayOfWeek.map(d => React.createElement('span', { key: d.name }, d.name)))
        ),

        // 時間帯別
        React.createElement('div', { style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('h4', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '8px' } }, '時間帯別 平均客単価'),
          React.createElement(BarChart, {
            data: unitPrice.byHour, valueKey: 'avg', labelKey: 'name', color: 'var(--color-accent)', height: 140, maxBars: 24,
          }),
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '6px', padding: '0 4px' },
          },
            React.createElement('span', null, '0時'),
            React.createElement('span', null, '6時'),
            React.createElement('span', null, '12時'),
            React.createElement('span', null, '18時'),
            React.createElement('span', null, '23時')
          )
        ),

        // 用途別
        React.createElement('div', { style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('h4', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '8px' } }, '用途別 平均客単価'),
          React.createElement(HBarChart, {
            data: unitPrice.byPurpose.filter(p => p.count > 0), nameKey: 'name', valueKey: 'avg', color: 'var(--color-warning)',
          })
        ),

        // 人数別
        React.createElement('div', null,
          React.createElement('h4', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '8px' } }, '人数別 平均客単価'),
          React.createElement(HBarChart, {
            data: unitPrice.byPassengers.filter(p => p.count > 0), nameKey: 'name', valueKey: 'avg', color: 'var(--color-secondary)',
          })
        )
      ),

      // D. 配車方法・用途分析
      sourceData.length > 0 && React.createElement(Card, { title: '配車方法・用途分析' },
        // 配車方法別
        React.createElement('div', { style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('h4', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '8px' } }, '配車方法別'),
          React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement(HBarChart, {
              data: sourceData.filter(s => s.count > 0), nameKey: 'name', valueKey: 'amount', color: 'var(--color-primary-light)',
            })
          ),
          React.createElement('div', {
            style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' },
          },
            sourceData.filter(s => s.count > 0).map((s, i) =>
              React.createElement('div', {
                key: i,
                style: {
                  padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
                  fontSize: 'var(--font-size-xs)', textAlign: 'center',
                },
              },
                React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px' } }, s.name),
                React.createElement('div', { style: { color: 'var(--text-secondary)' } }, s.count + '件'),
                React.createElement('div', { style: { color: 'var(--color-secondary)', fontWeight: 500 } }, '平均¥' + s.avg.toLocaleString())
              )
            )
          )
        ),

        // 用途別
        React.createElement('div', null,
          React.createElement('h4', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '8px' } }, '用途別'),
          React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement(HBarChart, {
              data: purposeData.filter(p => p.count > 0), nameKey: 'name', valueKey: 'amount', color: 'var(--color-accent)',
            })
          ),
          React.createElement('div', {
            style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' },
          },
            purposeData.filter(p => p.count > 0).map((p, i) =>
              React.createElement('div', {
                key: i,
                style: {
                  padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
                  fontSize: 'var(--font-size-xs)', textAlign: 'center',
                },
              },
                React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px' } }, p.name),
                React.createElement('div', { style: { color: 'var(--text-secondary)' } }, p.count + '件'),
                React.createElement('div', { style: { color: 'var(--color-secondary)', fontWeight: 500 } }, '平均¥' + p.avg.toLocaleString())
              )
            )
          )
        )
      ),

      // E. 配車方法×エリア×単価ランク クロス分析
      sourceAreaPrice && sourceAreaPrice.matrixData && sourceAreaPrice.matrixData.length > 0 && React.createElement(Card, {
        title: '配車方法×エリア×単価 クロス分析',
        style: { marginBottom: 'var(--space-lg)' },
      },
        // 凡例
        React.createElement('div', {
          style: { display: 'flex', gap: '12px', marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', flexWrap: 'wrap' },
        },
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(244,67,54,0.6)', display: 'inline-block' } }),
            '¥2,000以上'
          ),
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(255,193,7,0.6)', display: 'inline-block' } }),
            '¥1,001〜1,999'
          ),
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(76,175,80,0.6)', display: 'inline-block' } }),
            '¥1,000以下'
          )
        ),

        // エリア×配車方法マトリクス（平均単価 + 単価ランク内訳バー）
        React.createElement('div', { style: { overflowX: 'auto' } },
          React.createElement('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: '100px repeat(5, 1fr)',
              gap: '2px',
              fontSize: 'var(--font-size-xs)',
              minWidth: '480px',
            },
          },
            // ヘッダー
            React.createElement('div', { style: { padding: '8px 4px', fontWeight: 600, color: 'var(--text-secondary)' } }, 'エリア'),
            ...sourceAreaPrice.sources.map(s =>
              React.createElement('div', { key: s, style: { padding: '8px 4px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' } }, s)
            ),

            // データ行
            ...sourceAreaPrice.matrixData.flatMap(row => [
              React.createElement('div', {
                key: row.area + '-lbl',
                style: { padding: '8px 4px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center' },
                title: row.area,
              }, row.area.length > 8 ? row.area.slice(0, 8) + '…' : row.area),

              ...sourceAreaPrice.sources.map(src => {
                const d = row[src];
                if (d.count === 0) {
                  return React.createElement('div', {
                    key: row.area + '-' + src,
                    style: { padding: '8px 4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-muted)' },
                  }, '-');
                }
                const total = d.tiers.short + d.tiers.mid + d.tiers.long;
                const pctS = total > 0 ? (d.tiers.short / total) * 100 : 0;
                const pctM = total > 0 ? (d.tiers.mid / total) * 100 : 0;
                const pctL = total > 0 ? (d.tiers.long / total) * 100 : 0;
                return React.createElement('div', {
                  key: row.area + '-' + src,
                  style: { padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' },
                  title: row.area + ' × ' + src + ': ' + d.count + '件 平均¥' + d.avg.toLocaleString() + ' (短' + d.tiers.short + '/中' + d.tiers.mid + '/長' + d.tiers.long + ')',
                },
                  React.createElement('div', { style: { fontWeight: 600, marginBottom: '3px' } }, '¥' + d.avg.toLocaleString()),
                  React.createElement('div', { style: { fontSize: '9px', color: 'var(--text-muted)', marginBottom: '3px' } }, d.count + '件'),
                  // 単価ランク内訳バー
                  React.createElement('div', {
                    style: { display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)' },
                  },
                    pctS > 0 && React.createElement('div', { style: { width: pctS + '%', background: 'rgba(76,175,80,0.7)' } }),
                    pctM > 0 && React.createElement('div', { style: { width: pctM + '%', background: 'rgba(255,193,7,0.7)' } }),
                    pctL > 0 && React.createElement('div', { style: { width: pctL + '%', background: 'rgba(244,67,54,0.7)' } })
                  )
                );
              })
            ])
          )
        ),

        React.createElement('div', {
          style: { marginTop: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' },
        }, 'セルをタップで詳細表示 | バー: 緑=短距離 黄=中距離 赤=長距離')
      ),

      // 配車方法別 単価ランク構成
      sourceAreaPrice && sourceAreaPrice.sourceTierList && sourceAreaPrice.sourceTierList.some(s => s.totalCount > 0) && React.createElement(Card, {
        title: '配車方法別 単価ランク構成',
        style: { marginBottom: 'var(--space-lg)' },
      },
        React.createElement('div', { style: { display: 'grid', gap: 'var(--space-md)' } },
          sourceAreaPrice.sourceTierList.filter(s => s.totalCount > 0).map(s =>
            React.createElement('div', { key: s.source },
              React.createElement('div', {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
              },
                React.createElement('span', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, s.source),
                React.createElement('span', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, s.totalCount + '件')
              ),
              // 積み上げバー
              React.createElement('div', {
                style: { display: 'flex', height: '20px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)' },
              },
                ...s.tiers.map(t => {
                  const pct = s.totalCount > 0 ? (t.count / s.totalCount) * 100 : 0;
                  if (pct === 0) return null;
                  const colors = { short: 'rgba(76,175,80,0.7)', mid: 'rgba(255,193,7,0.7)', long: 'rgba(244,67,54,0.7)' };
                  return React.createElement('div', {
                    key: t.key,
                    style: {
                      width: pct + '%', background: colors[t.key],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '9px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap',
                      minWidth: pct > 8 ? 'auto' : '0',
                    },
                    title: t.label + ': ' + t.count + '件 平均¥' + t.avg.toLocaleString(),
                  }, pct >= 15 ? Math.round(pct) + '%' : '');
                })
              ),
              // ラベル
              React.createElement('div', {
                style: { display: 'flex', justifyContent: 'space-between', marginTop: '3px', fontSize: '10px', color: 'var(--text-muted)' },
              },
                ...s.tiers.filter(t => t.count > 0).map(t =>
                  React.createElement('span', { key: t.key }, t.label + ' ' + t.count + '件 avg¥' + t.avg.toLocaleString())
                )
              )
            )
          )
        )
      ),

      // エリア別 単価ランク構成
      sourceAreaPrice && sourceAreaPrice.areaTierList && sourceAreaPrice.areaTierList.length > 0 && React.createElement(Card, {
        title: 'エリア別 単価ランク構成',
        style: { marginBottom: 'var(--space-lg)' },
      },
        React.createElement('div', { style: { display: 'grid', gap: 'var(--space-md)' } },
          sourceAreaPrice.areaTierList.map(a =>
            React.createElement('div', { key: a.area },
              React.createElement('div', {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
              },
                React.createElement('span', {
                  style: { fontWeight: 600, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' },
                  title: a.area,
                }, a.area),
                React.createElement('span', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, a.total + '件')
              ),
              // 積み上げバー
              React.createElement('div', {
                style: { display: 'flex', height: '16px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)' },
              },
                ...a.tiers.map(t => {
                  if (t.pct === 0) return null;
                  const colors = { short: 'rgba(76,175,80,0.7)', mid: 'rgba(255,193,7,0.7)', long: 'rgba(244,67,54,0.7)' };
                  return React.createElement('div', {
                    key: t.key,
                    style: {
                      width: t.pct + '%', background: colors[t.key],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '9px', fontWeight: 600, color: '#fff',
                    },
                    title: t.label + ': ' + t.count + '件 (' + t.pct + '%)',
                  }, t.pct >= 15 ? t.pct + '%' : '');
                })
              )
            )
          )
        )
      )
    ),

    // ============================================================
    // リピーター分析タブ
    // ============================================================
    tab === 'repeater' && React.createElement(React.Fragment, null,
      !repeaterData || !repeaterData.hasData
        ? React.createElement(Card, { style: { textAlign: 'center', padding: 'var(--space-2xl)' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--text-muted)', marginBottom: '12px' } }, 'person_off'),
            React.createElement('h3', { style: { marginBottom: '8px' } }, 'リピーターデータがありません'),
            React.createElement('p', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } },
              '売上記録で「登録ユーザー」をONにして名前を入力すると、リピーター分析が表示されます。'
            )
          )
        : React.createElement(React.Fragment, null,

          // --- 比較サマリー ---
          React.createElement('div', { className: 'grid grid--2', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement(Card, { className: 'stat-card', style: { border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '28px', color: '#f59e0b', marginBottom: '4px' } }, 'people'),
              React.createElement('div', { className: 'stat-card__value', style: { fontSize: 'var(--font-size-xl)' } }, `${repeaterData.comparison.rCount}回`),
              React.createElement('div', { className: 'stat-card__label' }, 'リピーター乗車'),
              React.createElement('div', { style: { fontSize: '11px', color: '#f59e0b', fontWeight: 600, marginTop: '4px' } }, `全体の${repeaterData.comparison.rRate}%`)
            ),
            React.createElement(Card, { className: 'stat-card' },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '28px', color: 'var(--color-secondary)', marginBottom: '4px' } }, 'payments'),
              React.createElement('div', { className: 'stat-card__value', style: { fontSize: 'var(--font-size-xl)' } }, `¥${repeaterData.comparison.rTotal.toLocaleString()}`),
              React.createElement('div', { className: 'stat-card__label' }, 'リピーター売上合計'),
              React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' } },
                `全売上の${repeaterData.comparison.allTotal > 0 ? Math.round((repeaterData.comparison.rTotal / repeaterData.comparison.allTotal) * 1000) / 10 : 0}%`
              )
            )
          ),

          // 平均単価比較
          React.createElement(Card, { title: '平均単価比較', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '8px' } },
              ...[
                { label: 'リピーター', value: repeaterData.comparison.rAvg, color: '#f59e0b', count: repeaterData.comparison.rCount },
                { label: '一般客', value: repeaterData.comparison.nAvg, color: 'var(--color-primary-light)', count: repeaterData.comparison.nCount },
              ].map(item => {
                const maxVal = Math.max(repeaterData.comparison.rAvg, repeaterData.comparison.nAvg, 1);
                return React.createElement('div', { key: item.label },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)', marginBottom: '4px' } },
                    React.createElement('span', { style: { color: item.color, fontWeight: 600 } }, `${item.label}（${item.count}回）`),
                    React.createElement('span', { style: { fontWeight: 700 } }, `¥${item.value.toLocaleString()}`)
                  ),
                  React.createElement('div', { style: { background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '10px', overflow: 'hidden' } },
                    React.createElement('div', { style: { width: `${(item.value / maxVal) * 100}%`, height: '100%', background: item.color, borderRadius: '4px', transition: 'width 0.3s' } })
                  )
                );
              })
            ),
            repeaterData.comparison.rAvg > repeaterData.comparison.nAvg
              ? React.createElement('div', { style: { marginTop: '10px', fontSize: '12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'trending_up'),
                  `リピーターは一般客より¥${(repeaterData.comparison.rAvg - repeaterData.comparison.nAvg).toLocaleString()}高い`
                )
              : repeaterData.comparison.nAvg > repeaterData.comparison.rAvg
                ? React.createElement('div', { style: { marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' } },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'info'),
                    `一般客がリピーターより¥${(repeaterData.comparison.nAvg - repeaterData.comparison.rAvg).toLocaleString()}高い`
                  )
                : null
          ),

          // --- 顧客ランキング ---
          React.createElement(Card, { title: `顧客ランキング（${repeaterData.ranking.length}名）`, style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '8px' } },
              ...repeaterData.ranking.slice(0, 10).map((r, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                return React.createElement('div', {
                  key: r.name,
                  style: {
                    padding: '10px 12px', borderRadius: '10px',
                    background: i < 3 ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                    border: i === 0 ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  },
                },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                      medal ? React.createElement('span', { style: { fontSize: '16px' } }, medal) : React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted)', width: '20px', textAlign: 'center' } }, `${i + 1}`),
                      React.createElement('span', { style: { fontWeight: 700, fontSize: '13px', color: '#f59e0b' } }, r.name)
                    ),
                    React.createElement('span', { style: { fontWeight: 700, fontSize: i < 3 ? '16px' : '13px', color: 'var(--color-secondary)' } }, `¥${r.total.toLocaleString()}`)
                  ),
                  React.createElement('div', { style: { display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap' } },
                    React.createElement('span', null, `${r.count}回`),
                    React.createElement('span', null, `平均¥${r.avg.toLocaleString()}`),
                    React.createElement('span', null, `主要: ${r.topArea}`),
                    React.createElement('span', null, `${r.topDay}曜日`),
                    r.topHour !== undefined && React.createElement('span', null, `${r.topHour}時台`),
                    React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `最終: ${r.lastDate}`)
                  )
                );
              })
            )
          ),

          // --- 曜日別リピーター率 ---
          React.createElement(Card, { title: '曜日別リピーター率', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '6px' } },
              ...repeaterData.dowStats.map(d => {
                const maxRate = Math.max(...repeaterData.dowStats.map(x => x.rate), 1);
                return React.createElement('div', { key: d.name },
                  React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '30px 1fr 60px 70px', gap: '8px', alignItems: 'center' } },
                    React.createElement('span', { style: { fontWeight: 700, color: (d.name === '日' || d.name === '土') ? 'var(--color-danger)' : 'var(--text-primary)' } }, d.name),
                    React.createElement('div', { style: { background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '8px', overflow: 'hidden' } },
                      React.createElement('div', { style: { width: `${(d.rate / maxRate) * 100}%`, height: '100%', background: '#f59e0b', borderRadius: '4px' } })
                    ),
                    React.createElement('span', { style: { fontSize: '12px', color: '#f59e0b', fontWeight: 600, textAlign: 'right' } }, `${d.rate}%`),
                    React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' } }, `${d.repeaters}/${d.total}件`)
                  )
                );
              })
            )
          ),

          // --- 時間帯別リピーター率 ---
          repeaterData.hourStats.length > 0 && React.createElement(Card, { title: '時間帯別リピーター率', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '4px' } },
              ...repeaterData.hourStats.map(h => {
                const maxRate = Math.max(...repeaterData.hourStats.map(x => x.rate), 1);
                return React.createElement('div', {
                  key: h.hour,
                  style: { display: 'grid', gridTemplateColumns: '40px 1fr 50px 60px', gap: '8px', alignItems: 'center' },
                },
                  React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, h.label),
                  React.createElement('div', { style: { background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '8px', overflow: 'hidden' } },
                    React.createElement('div', { style: { width: `${(h.rate / maxRate) * 100}%`, height: '100%', background: '#818cf8', borderRadius: '4px' } })
                  ),
                  React.createElement('span', { style: { fontSize: '12px', color: '#818cf8', fontWeight: 600, textAlign: 'right' } }, `${h.rate}%`),
                  React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' } }, `${h.repeaters}/${h.total}`)
                );
              })
            )
          ),

          // --- エリア別リピーター分析 ---
          repeaterData.areaStats.length > 0 && React.createElement(Card, { title: 'エリア別リピーター分析', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '8px' } },
              ...repeaterData.areaStats.map((a, i) => {
                const maxR = repeaterData.areaStats[0].repeaters || 1;
                return React.createElement('div', {
                  key: a.area,
                  style: { padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' },
                },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }, title: a.area }, a.area),
                    React.createElement('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
                      React.createElement('span', { style: { fontSize: '11px', color: '#f59e0b', fontWeight: 600 } }, `${a.rate}%`),
                      React.createElement('span', { style: { fontSize: '12px', fontWeight: 700, color: 'var(--color-secondary)' } }, `¥${a.avg.toLocaleString()}`)
                    )
                  ),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('div', { style: { flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '6px', overflow: 'hidden' } },
                      React.createElement('div', { style: { width: `${(a.repeaters / maxR) * 100}%`, height: '100%', background: '#f59e0b', borderRadius: '4px' } })
                    ),
                    React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, `${a.repeaters}/${a.total}件`)
                  )
                );
              })
            )
          ),

          // --- 月別リピーター推移 ---
          repeaterData.monthlyTrend.length > 1 && React.createElement(Card, { title: 'リピーター率の推移', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement(BarChart, {
              data: repeaterData.monthlyTrend.map(m => ({ ...m, label: m.month })),
              valueKey: 'rate', labelKey: 'label',
              color: '#f59e0b', height: 140, prefix: '', showLabels: true, labelInterval: 1,
            }),
            React.createElement('div', { style: { display: 'grid', gap: '6px', marginTop: '12px' } },
              ...repeaterData.monthlyTrend.map(m =>
                React.createElement('div', {
                  key: m.month,
                  style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px' },
                },
                  React.createElement('span', null, m.month),
                  React.createElement('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
                    React.createElement('span', { style: { color: '#f59e0b', fontWeight: 600 } }, `${m.rate}%`),
                    React.createElement('span', { style: { color: 'var(--text-muted)', fontSize: '11px' } }, `${m.repeaters}/${m.total}件`),
                    React.createElement('span', { style: { color: 'var(--color-secondary)', fontWeight: 500 } }, `¥${m.amount.toLocaleString()}`)
                  )
                )
              )
            )
          )
        )
    ),

    // ======== 実車率・天候タブ ========
    tab === 'occupancyWeather' && React.createElement(React.Fragment, null,
      owLoading && React.createElement(Loading, null),
      !owLoading && !owData && React.createElement(Card, { style: { textAlign: 'center', padding: 'var(--space-2xl)' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--text-muted)', marginBottom: '12px' } }, 'speed'),
        React.createElement('p', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, 'GPSデータがありません。始業してGPS追跡を開始すると、実車率が自動計算されます。')
      ),
      !owLoading && owData && React.createElement(React.Fragment, null,

        // ===== 日付選択 =====
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--text-secondary)' } }, 'calendar_today'),
          React.createElement('input', {
            type: 'date', value: owDate,
            onChange: (e) => setOwDate(e.target.value),
            style: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '13px' },
          })
        ),

        // ===== 当日実車率サマリ =====
        owData.todayOcc && owData.todayOcc.points > 0 && React.createElement(Card, { title: `${owDate} の実車率`, style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('div', { className: 'grid grid--4', style: { gap: '12px', marginBottom: '16px' } },
            ...[
              { label: '時間ベース実車率', value: `${owData.todayOcc.timeRate}%`, icon: 'schedule', color: owData.todayOcc.timeRate >= 50 ? '#4caf50' : owData.todayOcc.timeRate >= 30 ? '#ff9800' : '#f44336' },
              { label: '距離ベース実車率', value: `${owData.todayOcc.distanceRate}%`, icon: 'straighten', color: owData.todayOcc.distanceRate >= 50 ? '#4caf50' : owData.todayOcc.distanceRate >= 30 ? '#ff9800' : '#f44336' },
              { label: '実車距離', value: `${owData.todayOcc.occupiedKm}km`, sub: `空車 ${owData.todayOcc.vacantKm}km`, icon: 'local_taxi', color: 'var(--color-primary-light)' },
              { label: '稼働時間', value: `${owData.todayOcc.totalMin}分`, sub: `実車${owData.todayOcc.occupiedMin}分 空車${owData.todayOcc.vacantMin}分`, icon: 'timer', color: 'var(--color-secondary)' },
            ].map((item, i) => React.createElement('div', {
              key: i, style: { background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '14px', border: '1px solid rgba(255,255,255,0.06)' },
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: item.color } }, item.icon),
                React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, item.label)
              ),
              React.createElement('div', { style: { fontSize: '22px', fontWeight: 700, color: item.color } }, item.value),
              item.sub && React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' } }, item.sub)
            ))
          ),
          // 実車率ゲージ
          React.createElement('div', { style: { marginTop: '8px' } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' } },
              React.createElement('span', null, '空車'),
              React.createElement('span', null, '実車')
            ),
            React.createElement('div', { style: { height: '12px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' } },
              React.createElement('div', { style: { height: '100%', width: `${owData.todayOcc.timeRate}%`, borderRadius: '6px', background: 'linear-gradient(90deg, #1a73e8, #4fc3f7)', transition: 'width 0.5s ease' } })
            )
          )
        ),

        // ===== 時間帯別実車率 =====
        owData.hourlyOcc && owData.hourlyOcc.length > 0 && React.createElement(Card, { title: '時間帯別 実車率', style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '2px', height: '140px', padding: '0 4px' } },
            ...owData.hourlyOcc.map((h, i) => {
              const barColor = h.rate >= 60 ? '#4caf50' : h.rate >= 40 ? '#ff9800' : h.rate >= 20 ? '#f44336' : 'rgba(255,255,255,0.1)';
              return React.createElement('div', {
                key: i, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
                title: `${h.hour}時: 実車率${h.rate}% (実車${h.occupiedMin}分/空車${h.vacantMin}分)`,
              },
                React.createElement('div', { style: { fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' } }, `${h.rate}%`),
                React.createElement('div', { style: { width: '100%', height: `${Math.max(h.rate, 2)}%`, background: barColor, borderRadius: '3px 3px 0 0', transition: 'height 0.3s ease', minHeight: '2px' } })
              );
            })
          ),
          React.createElement('div', { style: { display: 'flex', gap: '2px', padding: '4px 4px 0' } },
            ...owData.hourlyOcc.map((h, i) => React.createElement('div', {
              key: i, style: { flex: 1, textAlign: 'center', fontSize: '9px', color: 'var(--text-muted)' },
            }, `${h.hour}`))
          )
        ),

        // ===== 実車率トレンド（30日） =====
        owData.trend && owData.trend.length > 1 && React.createElement(Card, { title: '実車率 推移（直近30日）', style: { marginBottom: 'var(--space-lg)' } },
          (() => {
            const avgRate = Math.round(owData.trend.reduce((s, d) => s + d.timeRate, 0) / owData.trend.length);
            const avgDistRate = Math.round(owData.trend.reduce((s, d) => s + d.distanceRate, 0) / owData.trend.length);
            return React.createElement(React.Fragment, null,
              React.createElement('div', { style: { display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '12px' } },
                React.createElement('span', { style: { color: 'var(--text-secondary)' } }, `平均時間実車率: `),
                React.createElement('span', { style: { fontWeight: 700, color: avgRate >= 50 ? '#4caf50' : '#ff9800' } }, `${avgRate}%`),
                React.createElement('span', { style: { color: 'var(--text-secondary)', marginLeft: '12px' } }, `平均距離実車率: `),
                React.createElement('span', { style: { fontWeight: 700, color: avgDistRate >= 50 ? '#4caf50' : '#ff9800' } }, `${avgDistRate}%`)
              ),
              React.createElement(BarChart, { data: owData.trend, valueKey: 'timeRate', labelKey: 'date', color: '#4fc3f7', height: 160, prefix: '', showLabels: true })
            );
          })()
        ),

        // ===== 天候×実車率 相関 =====
        owData.weatherCorr && owData.weatherCorr.length > 0 && React.createElement(Card, { title: '天候×実車率 相関分析', style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' } },
            ...owData.weatherCorr.map(wc => {
              const icon = wc.weather === '晴れ' ? 'wb_sunny' : wc.weather === '曇り' ? 'cloud' : wc.weather === '雨' ? 'water_drop' : 'ac_unit';
              const rateColor = wc.timeRate >= 50 ? '#4caf50' : wc.timeRate >= 35 ? '#ff9800' : '#f44336';
              return React.createElement('div', {
                key: wc.weather,
                style: { padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' },
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '22px', color: 'var(--color-primary-light)' } }, icon),
                  React.createElement('span', { style: { fontWeight: 700, fontSize: '15px' } }, wc.weather),
                  React.createElement('span', { style: { marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px' } }, `${wc.dayCount}日分`)
                ),
                // 実車率ゲージ
                React.createElement('div', { style: { marginBottom: '10px' } },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' } },
                    React.createElement('span', { style: { color: 'var(--text-muted)' } }, '時間実車率'),
                    React.createElement('span', { style: { fontWeight: 700, color: rateColor } }, `${wc.timeRate}%`)
                  ),
                  React.createElement('div', { style: { height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
                    React.createElement('div', { style: { height: '100%', width: `${wc.timeRate}%`, borderRadius: '4px', background: rateColor, transition: 'width 0.3s ease' } })
                  )
                ),
                React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 } },
                  React.createElement('div', null, `距離実車率: ${wc.distanceRate}%`),
                  React.createElement('div', null, `日平均売上: ¥${wc.avgRevenue.toLocaleString()}`),
                  React.createElement('div', null, `平均実車: ${wc.avgOccMin}分 / ${wc.avgOccKm}km`),
                  React.createElement('div', null, `平均空車: ${wc.avgVacMin}分 / ${wc.avgVacKm}km`),
                  wc.avgTemp != null && React.createElement('div', null, `平均気温: ${wc.avgTemp}℃`)
                )
              );
            })
          )
        ),

        // ===== 天候×時間帯 需要マトリクス =====
        owData.weatherTimeMatrix && owData.weatherTimeMatrix.matrix.length > 0 && React.createElement(Card, { title: '天候×時間帯 需要マトリクス', style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('p', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' } }, '晴れを1.0として各天候の需要倍率を表示（赤=需要増、青=需要減）'),
          (() => {
            const weathers = ['晴れ', '曇り', '雨', '雪'];
            const matrixMap = {};
            owData.weatherTimeMatrix.matrix.forEach(m => {
              if (!matrixMap[m.weather]) matrixMap[m.weather] = {};
              matrixMap[m.weather][m.hour] = m;
            });
            // 時間帯の範囲を検出
            const allHours = [...new Set(owData.weatherTimeMatrix.matrix.map(m => m.hour))].sort((a, b) => a - b);
            if (allHours.length === 0) return null;

            return React.createElement('div', { style: { overflowX: 'auto' } },
              React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' } },
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', { style: { padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)' } }, '天候'),
                    ...allHours.map(h => React.createElement('th', { key: h, style: { padding: '4px 2px', textAlign: 'center', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)', minWidth: '32px' } }, `${h}時`))
                  )
                ),
                React.createElement('tbody', null,
                  ...weathers.filter(w => matrixMap[w]).map(w => {
                    const icon = w === '晴れ' ? 'wb_sunny' : w === '曇り' ? 'cloud' : w === '雨' ? 'water_drop' : 'ac_unit';
                    return React.createElement('tr', { key: w },
                      React.createElement('td', { style: { padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, icon), w
                      ),
                      ...allHours.map(h => {
                        const cell = matrixMap[w] && matrixMap[w][h];
                        if (!cell) return React.createElement('td', { key: h, style: { padding: '4px 2px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' } }, '-');
                        const mult = cell.multiplier;
                        let bg = 'transparent';
                        if (mult >= 1.3) bg = 'rgba(244,67,54,0.3)';
                        else if (mult >= 1.1) bg = 'rgba(255,152,0,0.2)';
                        else if (mult <= 0.7) bg = 'rgba(33,150,243,0.3)';
                        else if (mult <= 0.9) bg = 'rgba(33,150,243,0.15)';
                        return React.createElement('td', {
                          key: h,
                          style: { padding: '4px 2px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', background: bg, fontWeight: mult >= 1.2 || mult <= 0.8 ? 700 : 400 },
                          title: `${w} ${h}時: 平均¥${cell.avgAmount.toLocaleString()} (${cell.count}回)`,
                        }, `${mult.toFixed(1)}`);
                      })
                    );
                  })
                )
              )
            );
          })()
        ),

        // ===== 気温帯別分析 =====
        owData.tempBands && owData.tempBands.length > 0 && React.createElement(Card, { title: '気温帯別 売上分析', style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('div', { style: { display: 'grid', gap: '8px' } },
            ...owData.tempBands.map((b, i) => {
              const maxRevenue = Math.max(...owData.tempBands.map(x => x.avgDailyRevenue), 1);
              const pct = (b.avgDailyRevenue / maxRevenue) * 100;
              // 温度に応じた色
              let barColor = '#4fc3f7';
              if (b.min != null && b.min >= 25) barColor = '#f44336';
              else if (b.min != null && b.min >= 15) barColor = '#ff9800';
              else if (b.min != null && b.min >= 5) barColor = '#4caf50';
              else if (b.max != null && b.max <= 0) barColor = '#90caf9';
              return React.createElement('div', { key: i },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '3px' } },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: barColor } }, 'thermostat'),
                    React.createElement('span', { style: { fontWeight: 600 } }, b.label),
                    React.createElement('span', { style: { color: 'var(--text-muted)', fontSize: '10px' } }, `${b.dayCount}日`)
                  ),
                  React.createElement('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
                    React.createElement('span', { style: { color: 'var(--text-secondary)', fontSize: '11px' } }, `${b.avgRidesPerDay}回/日`),
                    React.createElement('span', { style: { fontWeight: 700, color: 'var(--color-secondary)' } }, `¥${b.avgDailyRevenue.toLocaleString()}/日`)
                  )
                ),
                React.createElement('div', { style: { height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
                  React.createElement('div', { style: { width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.3s ease' } })
                )
              );
            })
          )
        ),

        // ===== 天候別サマリ =====
        owData.weatherTimeMatrix && owData.weatherTimeMatrix.summary.length > 0 && React.createElement(Card, { title: '天候別 需要サマリ' },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' } },
            ...owData.weatherTimeMatrix.summary.map(s => {
              const icon = s.weather === '晴れ' ? 'wb_sunny' : s.weather === '曇り' ? 'cloud' : s.weather === '雨' ? 'water_drop' : 'ac_unit';
              return React.createElement('div', {
                key: s.weather,
                style: { padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' },
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, icon),
                  React.createElement('span', { style: { fontWeight: 600 } }, s.weather)
                ),
                React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 } },
                  React.createElement('div', null, `日平均: ¥${s.dailyAvg.toLocaleString()}`),
                  React.createElement('div', null, `平均単価: ¥${s.avgPrice.toLocaleString()}`),
                  React.createElement('div', null, `乗車数: ${s.totalCount}回 / ${s.dayCount}日`)
                )
              );
            })
          )
        ),

        // ===== エリア別 実車効率 =====
        owData.areaOcc && owData.areaOcc.length > 0 && React.createElement(Card, { title: 'エリア別 実車効率 TOP20', style: { marginTop: 'var(--space-lg)' } },
          React.createElement('div', { style: { overflowX: 'auto' } },
            React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' } },
              React.createElement('thead', null,
                React.createElement('tr', { style: { borderBottom: '1px solid rgba(255,255,255,0.1)' } },
                  ...['エリア', '乗車数', '平均単価', '時給効率', '平均時間', 'ピーク時', '天候'].map((h, i) =>
                    React.createElement('th', { key: i, style: { padding: '6px 4px', textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500 } }, h)
                  )
                )
              ),
              React.createElement('tbody', null,
                ...owData.areaOcc.map((a, i) => React.createElement('tr', {
                  key: i, style: { borderBottom: '1px solid rgba(255,255,255,0.04)' },
                },
                  React.createElement('td', { style: { padding: '6px 4px', fontWeight: 600, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.area),
                  React.createElement('td', { style: { padding: '6px 4px', textAlign: 'right' } }, `${a.rides}回`),
                  React.createElement('td', { style: { padding: '6px 4px', textAlign: 'right', color: 'var(--color-secondary)' } }, `¥${a.avgFare.toLocaleString()}`),
                  React.createElement('td', { style: { padding: '6px 4px', textAlign: 'right', fontWeight: 700, color: a.hourlyRevenue >= 3000 ? '#4caf50' : a.hourlyRevenue >= 2000 ? '#ff9800' : '#f44336' } }, a.hourlyRevenue > 0 ? `¥${a.hourlyRevenue.toLocaleString()}/h` : '-'),
                  React.createElement('td', { style: { padding: '6px 4px', textAlign: 'right' } }, a.avgDuration > 0 ? `${a.avgDuration}分` : '-'),
                  React.createElement('td', { style: { padding: '6px 4px', textAlign: 'right' } }, a.peakHour !== '-' ? `${a.peakHour}時` : '-'),
                  React.createElement('td', { style: { padding: '6px 4px', textAlign: 'right' } }, a.topWeather)
                ))
              )
            )
          )
        ),

        // ===== 配車元別 効率分析 =====
        owData.sourceEff && owData.sourceEff.length > 0 && React.createElement(Card, { title: '配車元別 効率比較', style: { marginTop: 'var(--space-lg)' } },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' } },
            ...owData.sourceEff.map((s, i) => {
              const maxRevenue = Math.max(...owData.sourceEff.map(x => x.hourlyRevenue), 1);
              return React.createElement('div', {
                key: i, style: { padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' },
              },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
                  React.createElement('span', { style: { fontWeight: 700, fontSize: '14px' } }, s.source),
                  React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px' } }, `${s.sharePercent}%`)
                ),
                React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 } },
                  React.createElement('div', null, `乗車数: ${s.rides}回 (${s.ridesPerDay}/日)`),
                  React.createElement('div', { style: { fontWeight: 700, color: 'var(--color-secondary)' } }, `平均単価: ¥${s.avgFare.toLocaleString()}`),
                  s.hourlyRevenue > 0 && React.createElement('div', { style: { color: s.hourlyRevenue >= 3000 ? '#4caf50' : '#ff9800' } }, `時給効率: ¥${s.hourlyRevenue.toLocaleString()}/h`),
                  s.avgDuration > 0 && React.createElement('div', null, `平均乗車: ${s.avgDuration}分`),
                  s.avgWaitTime > 0 && React.createElement('div', null, `平均待時間: ${s.avgWaitTime}分`)
                ),
                s.hourlyRevenue > 0 && React.createElement('div', { style: { marginTop: '8px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
                  React.createElement('div', { style: { width: `${Math.round(s.hourlyRevenue / maxRevenue * 100)}%`, height: '100%', borderRadius: '3px', background: 'var(--color-primary-light)' } })
                )
              );
            })
          )
        ),

        // ===== 曜日×天候 クロス分析 =====
        owData.dayWeather && owData.dayWeather.cells.length > 0 && React.createElement(Card, { title: '曜日×天候 クロス分析', style: { marginTop: 'var(--space-lg)' } },
          React.createElement('p', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' } }, '各セルは日平均売上（¥）'),
          React.createElement('div', { style: { overflowX: 'auto' } },
            (() => {
              const { cells, dows, weathers } = owData.dayWeather;
              const cellMap = {};
              cells.forEach(c => { cellMap[`${c.dow}_${c.weather}`] = c; });
              const allDailyAvgs = cells.map(c => c.dailyAvg).filter(v => v > 0);
              const maxDailyAvg = allDailyAvgs.length > 0 ? Math.max(...allDailyAvgs) : 1;
              const minDailyAvg = allDailyAvgs.length > 0 ? Math.min(...allDailyAvgs) : 0;
              return React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' } },
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', { style: { padding: '6px', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)' } }, ''),
                    ...weathers.map(w => {
                      const icon = w === '晴れ' ? 'wb_sunny' : w === '曇り' ? 'cloud' : w === '雨' ? 'water_drop' : 'ac_unit';
                      return React.createElement('th', { key: w, style: { padding: '6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' } },
                        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, icon)
                      );
                    })
                  )
                ),
                React.createElement('tbody', null,
                  ...dows.map(d => React.createElement('tr', { key: d },
                    React.createElement('td', { style: { padding: '6px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' } }, d),
                    ...weathers.map(w => {
                      const cell = cellMap[`${d}_${w}`];
                      if (!cell) return React.createElement('td', { key: w, style: { padding: '6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' } }, '-');
                      const ratio = maxDailyAvg > minDailyAvg ? (cell.dailyAvg - minDailyAvg) / (maxDailyAvg - minDailyAvg) : 0.5;
                      const bg = ratio >= 0.7 ? 'rgba(244,67,54,0.25)' : ratio >= 0.4 ? 'rgba(255,152,0,0.15)' : 'rgba(33,150,243,0.1)';
                      return React.createElement('td', { key: w, style: { padding: '6px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', background: bg, fontWeight: ratio >= 0.7 ? 700 : 400 }, title: `${d}・${w}: ${cell.rides}回 (${cell.dayCount}日)` },
                        `¥${Math.round(cell.dailyAvg / 1000)}k`
                      );
                    })
                  ))
                )
              );
            })()
          ),
          // 曜日別サマリ
          owData.dayWeather.dowSummary && React.createElement('div', { style: { display: 'flex', gap: '4px', marginTop: '12px', flexWrap: 'wrap' } },
            ...owData.dayWeather.dowSummary.filter(d => d.dayCount > 0).map(d => {
              const maxDow = Math.max(...owData.dayWeather.dowSummary.map(x => x.dailyAvg), 1);
              return React.createElement('div', { key: d.dow, style: { flex: 1, minWidth: '40px', textAlign: 'center', padding: '6px 2px', borderRadius: '8px', background: `rgba(26,115,232,${0.1 + (d.dailyAvg / maxDow) * 0.3})` } },
                React.createElement('div', { style: { fontSize: '11px', fontWeight: 700 } }, d.dow),
                React.createElement('div', { style: { fontSize: '10px', color: 'var(--color-secondary)' } }, `¥${Math.round(d.dailyAvg / 1000)}k`)
              );
            })
          )
        ),

        // ===== シフト別 実車率 =====
        owData.shiftOcc && owData.shiftOcc.length > 0 && React.createElement(Card, { title: 'シフト別 実車率（直近30回）', style: { marginTop: 'var(--space-lg)' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px', marginBottom: '8px' } },
            ...owData.shiftOcc.map((s, i) => {
              const color = s.rate >= 50 ? '#4caf50' : s.rate >= 30 ? '#ff9800' : '#f44336';
              return React.createElement('div', {
                key: i, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', cursor: 'pointer' },
                title: `${s.date} ${s.startTime}-${s.endTime}\n実車率${s.rate}% 売上¥${s.totalAmount.toLocaleString()} ${s.weather}`,
              },
                React.createElement('div', { style: { width: '100%', height: `${Math.max(s.rate, 3)}%`, background: color, borderRadius: '2px 2px 0 0', minHeight: '2px' } })
              );
            })
          ),
          React.createElement('div', { style: { display: 'flex', gap: '3px' } },
            ...owData.shiftOcc.map((s, i) => React.createElement('div', { key: i, style: { flex: 1, textAlign: 'center', fontSize: '8px', color: 'var(--text-muted)', overflow: 'hidden' } },
              i === 0 || i === owData.shiftOcc.length - 1 ? s.date.slice(5) : ''
            ))
          ),
          // 平均値
          (() => {
            const avgRate = Math.round(owData.shiftOcc.reduce((s, d) => s + d.rate, 0) / owData.shiftOcc.length);
            const avgHourly = Math.round(owData.shiftOcc.reduce((s, d) => s + d.hourlyRate, 0) / owData.shiftOcc.length);
            return React.createElement('div', { style: { display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', justifyContent: 'center' } },
              React.createElement('span', null, `平均実車率: `), React.createElement('span', { style: { fontWeight: 700, color: avgRate >= 40 ? '#4caf50' : '#ff9800' } }, `${avgRate}%`),
              React.createElement('span', { style: { marginLeft: '12px' } }, `平均時給: `), React.createElement('span', { style: { fontWeight: 700, color: 'var(--color-secondary)' } }, `¥${avgHourly.toLocaleString()}`)
            );
          })()
        ),

        // ===== 目的別×天候 =====
        owData.purposeW && owData.purposeW.length > 0 && React.createElement(Card, { title: '乗車目的別 分析', style: { marginTop: 'var(--space-lg)' } },
          React.createElement('div', { style: { display: 'grid', gap: '8px' } },
            ...owData.purposeW.map((p, i) => {
              const maxAmt = Math.max(...owData.purposeW.map(x => x.totalAmount), 1);
              return React.createElement('div', { key: i, style: { padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: { fontWeight: 700, fontSize: '13px' } }, p.purpose),
                    React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${p.count}回 (${p.sharePercent}%)`)
                  ),
                  React.createElement('span', { style: { fontWeight: 700, color: 'var(--color-secondary)', fontSize: '13px' } }, `¥${p.avgFare.toLocaleString()}`)
                ),
                React.createElement('div', { style: { display: 'flex', gap: '4px', marginBottom: '4px' } },
                  ...p.weatherBreakdown.slice(0, 4).map(w => {
                    const icon = w.weather === '晴れ' ? 'wb_sunny' : w.weather === '曇り' ? 'cloud' : w.weather === '雨' ? 'water_drop' : 'ac_unit';
                    return React.createElement('span', { key: w.weather, style: { fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px' } },
                      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, icon), `${w.pct}%`
                    );
                  })
                ),
                React.createElement('div', { style: { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
                  React.createElement('div', { style: { width: `${Math.round(p.totalAmount / maxAmt * 100)}%`, height: '100%', borderRadius: '2px', background: 'var(--color-primary-light)' } })
                )
              );
            })
          )
        ),

        // ===== 支払方法×天候 =====
        owData.paymentW && owData.paymentW.length > 0 && React.createElement(Card, { title: '支払方法別 分析', style: { marginTop: 'var(--space-lg)' } },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' } },
            ...owData.paymentW.map((m, i) =>
              React.createElement('div', { key: i, style: { padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' } },
                React.createElement('div', { style: { fontWeight: 700, fontSize: '14px', marginBottom: '6px' } }, m.label),
                React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 } },
                  React.createElement('div', null, `${m.count}回 (${m.sharePercent}%)`),
                  React.createElement('div', { style: { color: 'var(--color-secondary)', fontWeight: 600 } }, `平均¥${m.avgFare.toLocaleString()}`),
                  React.createElement('div', null, `合計¥${m.totalAmount.toLocaleString()}`)
                ),
                m.weatherBreakdown.length > 0 && React.createElement('div', { style: { marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' } },
                  ...m.weatherBreakdown.map(w => {
                    const icon = w.weather === '晴れ' ? 'wb_sunny' : w.weather === '曇り' ? 'cloud' : w.weather === '雨' ? 'water_drop' : 'ac_unit';
                    return React.createElement('span', { key: w.weather, style: { fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '1px' } },
                      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '11px' } }, icon), `${w.pct}%`
                    );
                  })
                )
              )
            )
          )
        ),

        // ===== 乗客属性 =====
        owData.passenger && (owData.passenger.passengerCounts.length > 0 || owData.passenger.genderStats.length > 0) && React.createElement(Card, { title: '乗客属性 分析', style: { marginTop: 'var(--space-lg)' } },
          // 乗客数別
          owData.passenger.passengerCounts.length > 0 && React.createElement(React.Fragment, null,
            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' } }, '乗客数別'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' } },
              ...owData.passenger.passengerCounts.map((p, i) =>
                React.createElement('div', { key: i, style: { padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', minWidth: '60px' } },
                  React.createElement('div', { style: { fontSize: '14px', fontWeight: 700 } }, p.label),
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${p.count}回 (${p.sharePercent}%)`),
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--color-secondary)', fontWeight: 600 } }, `¥${p.avgFare.toLocaleString()}`)
                )
              )
            )
          ),
          // 性別別
          owData.passenger.genderStats.length > 0 && owData.passenger.genderStats.some(g => g.gender !== '未設定') && React.createElement(React.Fragment, null,
            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' } }, '性別別'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              ...owData.passenger.genderStats.map((g, i) =>
                React.createElement('div', { key: i, style: { padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', minWidth: '60px' } },
                  React.createElement('div', { style: { fontSize: '13px', fontWeight: 700 } }, g.gender),
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${g.count}回 (${g.sharePercent}%)`),
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--color-secondary)', fontWeight: 600 } }, `¥${g.avgFare.toLocaleString()}`)
                )
              )
            )
          )
        ),

        // ===== 待機時間と実車率の関係 =====
        owData.waitingOcc && owData.waitingOcc.bandStats.length > 0 && React.createElement(Card, { title: '待機時間と実車効率の関係', style: { marginTop: 'var(--space-lg)' } },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '12px' } },
            ...owData.waitingOcc.bandStats.map((b, i) =>
              React.createElement('div', { key: i, style: { padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '12px', fontWeight: 700, marginBottom: '4px' } }, b.label),
                React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${b.dayCount}日`),
                React.createElement('div', { style: { fontSize: '14px', fontWeight: 700, color: b.avgOccupancy >= 50 ? '#4caf50' : '#ff9800', margin: '4px 0' } }, `${b.avgOccupancy}%`),
                React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `実車率`),
                React.createElement('div', { style: { fontSize: '12px', color: 'var(--color-secondary)', fontWeight: 600, marginTop: '4px' } }, `¥${b.avgRevenue.toLocaleString()}/日`),
                b.avgHourlyRate > 0 && React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `¥${b.avgHourlyRate.toLocaleString()}/h`)
              )
            )
          )
        ),

        // ===== 他社乗車×天候 =====
        owData.rivalW && React.createElement(Card, { title: '他社乗車×天候 相関', style: { marginTop: 'var(--space-lg)' } },
          React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' } }, `他社乗車 合計${owData.rivalW.total}回を記録`),
          owData.rivalW.byWeather.length > 0 && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '12px' } },
            ...owData.rivalW.byWeather.map(w => {
              const icon = w.weather === '晴れ' ? 'wb_sunny' : w.weather === '曇り' ? 'cloud' : w.weather === '雨' ? 'water_drop' : 'ac_unit';
              return React.createElement('div', { key: w.weather, style: { padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', textAlign: 'center' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', display: 'block', marginBottom: '4px' } }, icon),
                React.createElement('div', { style: { fontSize: '16px', fontWeight: 700 } }, `${w.count}回`),
                React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${w.dailyAvg}/日 (${w.dayCount}日)`),
                w.peakHour !== '-' && React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `ピーク${w.peakHour}時`)
              );
            })
          ),
          // 曜日別
          owData.rivalW.byDow && React.createElement('div', { style: { display: 'flex', gap: '4px' } },
            ...owData.rivalW.byDow.map(d => {
              const maxDow = Math.max(...owData.rivalW.byDow.map(x => x.count), 1);
              return React.createElement('div', { key: d.dow, style: { flex: 1, textAlign: 'center' } },
                React.createElement('div', { style: { height: '40px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' } },
                  React.createElement('div', { style: { width: '80%', height: `${Math.max(Math.round(d.count / maxDow * 100), 3)}%`, background: 'var(--color-primary-light)', borderRadius: '2px 2px 0 0', minHeight: '2px' } })
                ),
                React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } }, d.dow),
                React.createElement('div', { style: { fontSize: '10px', fontWeight: 600 } }, d.count > 0 ? d.count : '')
              );
            })
          )
        )
      )
    ),

    // ======== GPS分析タブ ========
    tab === 'gps' && React.createElement(React.Fragment, null,
      // サブビュー切替
      React.createElement('div', {
        style: { display: 'flex', gap: '4px', marginBottom: 'var(--space-md)', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '4px' },
      },
        ...[
          { key: 'timeline', label: '日別タイムライン', icon: 'timeline' },
          { key: 'stats', label: '統計サマリ', icon: 'insights' },
        ].map(v => React.createElement('button', {
          key: v.key,
          onClick: () => setGpsView(v.key),
          style: {
            flex: 1, padding: '8px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            background: gpsView === v.key ? 'rgba(26,115,232,0.2)' : 'transparent',
            color: gpsView === v.key ? 'var(--color-primary-light)' : 'var(--text-muted)',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, v.icon),
          v.label
        ))
      ),

      // ---- タイムライン表示 ----
      gpsView === 'timeline' && React.createElement(React.Fragment, null,
        // 日付選択
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: 'var(--text-muted)' } }, 'calendar_today'),
          React.createElement('input', {
            type: 'date', value: gpsDate,
            onChange: (e) => setGpsDate(e.target.value),
            style: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '14px' },
          }),
          React.createElement('button', {
            onClick: () => setGpsDate(getLocalDateString()),
            style: { background: 'rgba(26,115,232,0.15)', border: '1px solid rgba(26,115,232,0.3)', borderRadius: '8px', padding: '6px 12px', color: 'var(--color-primary-light)', fontSize: '12px', cursor: 'pointer' },
          }, '今日')
        ),

        gpsLoading && React.createElement('div', { style: { textAlign: 'center', padding: '40px', color: 'var(--text-muted)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '32px', animation: 'spin 1s linear infinite' } }, 'sync'),
          React.createElement('div', { style: { marginTop: '8px', fontSize: '13px' } }, 'GPS軌跡を分析中...')
        ),

        !gpsLoading && !gpsData && React.createElement(Card, { style: { textAlign: 'center', padding: 'var(--space-2xl)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--text-muted)', marginBottom: '12px' } }, 'gps_off'),
          React.createElement('h3', { style: { marginBottom: '8px' } }, 'この日のGPSデータがありません'),
          React.createElement('p', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, '始業中にGPSが記録されると、ここに空車/実車の軌跡が表示されます。')
        ),

        !gpsLoading && gpsData && React.createElement(React.Fragment, null,
          // サマリカード
          React.createElement('div', { className: 'grid grid--3', style: { marginBottom: 'var(--space-lg)' } },
            ...[
              { icon: 'timer', label: '実車時間', value: `${gpsData.stats.occupiedMin}分`, sub: `${gpsData.stats.occupiedKm}km`, color: '#4fc3f7' },
              { icon: 'timer_off', label: '空車時間', value: `${gpsData.stats.vacantMin}分`, sub: `${gpsData.stats.vacantKm}km`, color: '#ff8a65' },
              { icon: 'speed', label: '実車率', value: `${gpsData.stats.occupancyRate}%`, sub: `平均空車${gpsData.stats.avgVacantMin}分`, color: gpsData.stats.occupancyRate >= 50 ? '#66bb6a' : '#ffa726' },
            ].map((s, i) => React.createElement('div', { key: i, className: 'stat-card', style: { textAlign: 'center' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: s.color, marginBottom: '4px' } }, s.icon),
              React.createElement('div', { style: { fontSize: '20px', fontWeight: 800, color: s.color } }, s.value),
              React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } }, s.sub),
              React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' } }, s.label)
            ))
          ),

          // セグメントタイムライン
          React.createElement(Card, { title: '空車／実車タイムライン', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '2px' } },
              ...gpsData.segments.map((seg, i) => {
                const isOcc = seg.status === 'occupied';
                const bgColor = isOcc ? 'rgba(79,195,247,0.12)' : 'rgba(255,138,101,0.08)';
                const borderColor = isOcc ? 'rgba(79,195,247,0.4)' : 'rgba(255,138,101,0.3)';
                const statusColor = isOcc ? '#4fc3f7' : '#ff8a65';
                const statusIcon = isOcc ? 'local_taxi' : 'airline_stops';
                return React.createElement('div', {
                  key: i,
                  style: { display: 'flex', alignItems: 'stretch', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: bgColor, borderLeft: `3px solid ${borderColor}` },
                },
                  // タイムライン左側
                  React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '52px' } },
                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 700, color: statusColor } }, seg.startTime),
                    React.createElement('div', { style: { flex: 1, width: '2px', background: borderColor, margin: '2px 0' } }),
                    React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, seg.endTime)
                  ),
                  // アイコン
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center' } },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: statusColor } }, statusIcon)
                  ),
                  // 詳細
                  React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
                      React.createElement('span', { style: { fontSize: '12px', fontWeight: 700, color: statusColor } }, isOcc ? '実車' : '空車'),
                      React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${seg.durationMin}分`),
                      React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${seg.distanceKm}km`),
                      React.createElement('span', {
                        style: { fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' },
                      }, seg.area)
                    ),
                    isOcc && seg.fare != null && React.createElement('div', { style: { marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' } },
                      React.createElement('span', { style: { color: 'var(--color-secondary)', fontWeight: 700 } }, `¥${seg.fare.toLocaleString()}`),
                      seg.pickup && React.createElement('span', { style: { color: 'var(--text-muted)' } }, `${seg.pickup}→${seg.dropoff}`),
                      seg.source && React.createElement('span', { style: { fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255,167,38,0.15)', color: '#ffa726' } }, seg.source)
                    )
                  )
                );
              })
            )
          ),

          // 空車→実車の転換ポイント
          gpsData.transitions.length > 0 && React.createElement(Card, { title: '乗車転換ポイント（空車→実車）', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '6px' } },
              ...gpsData.transitions.map((t, i) => React.createElement('div', {
                key: i,
                style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' },
              },
                React.createElement('span', { style: { fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-light)', minWidth: '40px' } }, t.time),
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: '#66bb6a' } }, 'hail'),
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('div', { style: { fontSize: '12px', fontWeight: 600 } }, t.pickup || t.area),
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' } }, `空車${t.vacantMin}分 / ${t.vacantKm}km走行後`)
                ),
                t.fare > 0 && React.createElement('span', { style: { fontSize: '13px', fontWeight: 700, color: 'var(--color-secondary)' } }, `¥${t.fare.toLocaleString()}`)
              ))
            )
          ),

          // エリア別転換統計
          gpsData.stats.areaTransitions.length > 0 && React.createElement(Card, { title: 'エリア別 乗車発生率', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '6px' } },
              ...gpsData.stats.areaTransitions.map((a, i) => {
                const maxCount = gpsData.stats.areaTransitions[0].count || 1;
                return React.createElement('div', {
                  key: a.area,
                  style: { padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' },
                },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: 600 } }, a.area),
                    React.createElement('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
                      React.createElement('span', { style: { fontSize: '12px', color: 'var(--color-primary-light)', fontWeight: 700 } }, `${a.count}回`),
                      React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `平均空車${a.avgVacantMin}分`),
                      a.avgFare > 0 && React.createElement('span', { style: { fontSize: '12px', color: 'var(--color-secondary)', fontWeight: 600 } }, `¥${a.avgFare.toLocaleString()}`)
                    )
                  ),
                  React.createElement('div', { style: { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
                    React.createElement('div', { style: { height: '100%', width: `${Math.round(a.count / maxCount * 100)}%`, borderRadius: '2px', background: 'linear-gradient(90deg, #1a73e8, #4fc3f7)' } })
                  )
                );
              })
            )
          )
        )
      ),

      // ---- 統計サマリ表示 ----
      gpsView === 'stats' && React.createElement(React.Fragment, null,
        gpsLoading && React.createElement('div', { style: { textAlign: 'center', padding: '40px', color: 'var(--text-muted)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '32px', animation: 'spin 1s linear infinite' } }, 'sync'),
          React.createElement('div', { style: { marginTop: '8px', fontSize: '13px' } }, '統計データを集計中...')
        ),

        !gpsLoading && !gpsMultiDay && React.createElement(Card, { style: { textAlign: 'center', padding: 'var(--space-2xl)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--text-muted)', marginBottom: '12px' } }, 'gps_off'),
          React.createElement('h3', { style: { marginBottom: '8px' } }, 'GPSデータがありません')
        ),

        !gpsLoading && gpsMultiDay && React.createElement(React.Fragment, null,
          // 総合サマリ
          React.createElement(Card, { title: `直近${gpsMultiDay.daysWithData}日間の走行統計`, style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { className: 'grid grid--2', style: { gap: '8px' } },
              ...[
                { label: '総実車時間', value: `${Math.round(gpsMultiDay.occupiedMin / 60)}h${gpsMultiDay.occupiedMin % 60}m`, icon: 'local_taxi', color: '#4fc3f7' },
                { label: '総空車時間', value: `${Math.round(gpsMultiDay.vacantMin / 60)}h${gpsMultiDay.vacantMin % 60}m`, icon: 'airline_stops', color: '#ff8a65' },
                { label: '実車距離', value: `${gpsMultiDay.occupiedKm}km`, icon: 'route', color: '#4fc3f7' },
                { label: '空車距離', value: `${gpsMultiDay.vacantKm}km`, icon: 'route', color: '#ff8a65' },
                { label: '平均実車率', value: `${gpsMultiDay.occupancyRate}%`, icon: 'speed', color: gpsMultiDay.occupancyRate >= 50 ? '#66bb6a' : '#ffa726' },
                { label: '乗車転換回数', value: `${gpsMultiDay.totalTransitions}回`, icon: 'hail', color: '#66bb6a' },
                { label: '平均空車→乗車', value: `${gpsMultiDay.avgVacantPerTransition}分`, icon: 'hourglass_bottom', color: '#ce93d8' },
                { label: '1日平均転換', value: gpsMultiDay.daysWithData > 0 ? `${Math.round(gpsMultiDay.totalTransitions / gpsMultiDay.daysWithData * 10) / 10}回` : '-', icon: 'trending_up', color: '#4db6ac' },
              ].map((s, i) => React.createElement('div', {
                key: i,
                style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' },
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '22px', color: s.color } }, s.icon),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: '16px', fontWeight: 800, color: s.color } }, s.value),
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, s.label)
                )
              ))
            )
          ),

          // 時間帯別 空車/実車比率
          React.createElement(Card, { title: '時間帯別 空車／実車比率', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '3px' } },
              ...[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4].map(h => {
                const v = gpsMultiDay.hourlyVacant[h] || 0;
                const o = gpsMultiDay.hourlyOccupied[h] || 0;
                const total = v + o;
                if (total === 0) return null;
                const oRate = Math.round(o / total * 100);
                return React.createElement('div', {
                  key: h,
                  style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' },
                },
                  React.createElement('span', { style: { minWidth: '32px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' } }, `${h}時`),
                  React.createElement('div', { style: { flex: 1, height: '16px', borderRadius: '4px', background: 'rgba(255,138,101,0.2)', overflow: 'hidden', display: 'flex' } },
                    React.createElement('div', { style: { width: `${oRate}%`, height: '100%', background: 'linear-gradient(90deg, #1a73e8, #4fc3f7)', borderRadius: '4px 0 0 4px', transition: 'width 0.3s' } })
                  ),
                  React.createElement('span', { style: { minWidth: '36px', textAlign: 'right', fontWeight: 700, color: oRate >= 50 ? '#4fc3f7' : '#ff8a65' } }, `${oRate}%`)
                );
              }).filter(Boolean)
            ),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' } },
              React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                React.createElement('span', { style: { width: '12px', height: '8px', borderRadius: '2px', background: '#4fc3f7' } }),
                '実車'
              ),
              React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                React.createElement('span', { style: { width: '12px', height: '8px', borderRadius: '2px', background: 'rgba(255,138,101,0.4)' } }),
                '空車'
              )
            )
          ),

          // エリア別転換統計（複数日）
          gpsMultiDay.areaTransitions.length > 0 && React.createElement(Card, { title: 'エリア別 乗車転換ランキング（直近30日）', style: { marginBottom: 'var(--space-lg)' } },
            React.createElement('div', { style: { display: 'grid', gap: '6px' } },
              ...gpsMultiDay.areaTransitions.map((a, i) => {
                const maxCount = gpsMultiDay.areaTransitions[0].count || 1;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                return React.createElement('div', {
                  key: a.area,
                  style: { padding: '10px 12px', borderRadius: '8px', background: i < 3 ? 'rgba(26,115,232,0.08)' : 'rgba(255,255,255,0.03)' },
                },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                      medal && React.createElement('span', { style: { fontSize: '14px' } }, medal),
                      React.createElement('span', { style: { fontSize: '13px', fontWeight: 700 } }, a.area)
                    ),
                    React.createElement('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
                      React.createElement('span', { style: { fontSize: '13px', color: 'var(--color-primary-light)', fontWeight: 700 } }, `${a.count}回`),
                      React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `平均空車${a.avgVacantMin}分`),
                      a.avgFare > 0 && React.createElement('span', { style: { fontSize: '12px', color: 'var(--color-secondary)', fontWeight: 600 } }, `平均¥${a.avgFare.toLocaleString()}`)
                    )
                  ),
                  React.createElement('div', { style: { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
                    React.createElement('div', { style: { height: '100%', width: `${Math.round(a.count / maxCount * 100)}%`, borderRadius: '2px', background: i < 3 ? 'linear-gradient(90deg, #1a73e8, #4fc3f7)' : 'rgba(255,255,255,0.15)' } })
                  )
                );
              })
            )
          )
        )
      )
    )
  );
};

})();
