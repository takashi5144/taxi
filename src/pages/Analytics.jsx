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
  const { useState, useEffect, useMemo } = React;
  const [tab, setTab] = useState('daily');
  const [refreshKey, setRefreshKey] = useState(0);

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

  // 常に必要なデータ
  const overall = useMemo(() => DataService.getOverallSummary(), [refreshKey]);

  // アクティブタブのデータのみ計算（遅延評価）
  const daily = useMemo(() => tab === 'daily' ? DataService.getDailyBreakdown(30) : [], [refreshKey, tab]);
  const monthly = useMemo(() => tab === 'daily' ? DataService.getMonthlyBreakdown() : [], [refreshKey, tab]);
  const dayOfWeek = useMemo(() => tab === 'dayOfWeek' ? DataService.getDayOfWeekBreakdown() : [], [refreshKey, tab]);
  const hourly = useMemo(() => tab === 'hourly' ? DataService.getHourlyBreakdown() : [], [refreshKey, tab]);
  const areas = useMemo(() => tab === 'area' ? DataService.getAreaBreakdown() : { pickups: [], dropoffs: [] }, [refreshKey, tab]);
  const weather = useMemo(() => tab === 'weather' ? DataService.getWeatherBreakdown() : [], [refreshKey, tab]);
  const weatherCorrelation = useMemo(() => tab === 'weather' ? DataService.getWeatherRevenueCorrelation() : [], [refreshKey, tab]);
  const shiftProductivity = useMemo(() => tab === 'shift' ? DataService.getShiftProductivity() : { shifts: [], totals: null }, [refreshKey, tab]);

  const rivalHourly = useMemo(() => tab === 'rival' ? DataService.getRivalHourlyBreakdown() : [], [refreshKey, tab]);
  const rivalDow = useMemo(() => tab === 'rival' ? DataService.getRivalDayOfWeekBreakdown() : [], [refreshKey, tab]);
  const rivalLocs = useMemo(() => tab === 'rival' ? DataService.getRivalLocationBreakdown() : [], [refreshKey, tab]);
  const rivalWeather = useMemo(() => tab === 'rival' ? DataService.getRivalWeatherBreakdown() : [], [refreshKey, tab]);
  const rivalTotal = useMemo(() => tab === 'rival' ? DataService.getRivalEntries().length : 0, [refreshKey, tab]);

  const sourceData = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getSourceBreakdown() : [], [refreshKey, tab]);
  const purposeData = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getPurposeBreakdown() : [], [refreshKey, tab]);
  const areaTime = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getAreaTimeBreakdown() : [], [refreshKey, tab]);
  const unitPrice = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getUnitPriceAnalysis() : null, [refreshKey, tab]);
  const recommendation = useMemo(() => DataService.getBusinessRecommendation(), [refreshKey]);
  const sourceAreaPrice = useMemo(() => (tab === 'area' || tab === 'forecast') ? DataService.getSourceAreaPriceBreakdown() : null, [refreshKey, tab]);
  const purposeDay = useMemo(() => (tab === 'purposeDay' || tab === 'forecast') ? DataService.getPurposeDayAnalysis() : null, [refreshKey, tab]);

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
  ];

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'analytics'),
      '売上分析'
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
    )
  );
};

})();
