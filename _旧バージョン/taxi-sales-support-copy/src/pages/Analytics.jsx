// Analytics.jsx - 売上分析ページ（DataServiceによるリアルデータ分析）
// v0.3.1: useMemoの依存配列修正 — データ追加後に分析結果が更新されるようにrefreshKeyを導入
window.AnalyticsPage = () => {
  const { useState, useEffect, useMemo } = React;
  const [tab, setTab] = useState('daily');
  const [refreshKey, setRefreshKey] = useState(0);

  // localStorageの変更を監視して自動更新（Dashboardと同じパターン）
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA) {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('storage', handleStorage);

    // 画面に戻った時も更新
    const handleVisibility = () => {
      if (!document.hidden) setRefreshKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const daily = useMemo(() => DataService.getDailyBreakdown(30), [refreshKey]);
  const dayOfWeek = useMemo(() => DataService.getDayOfWeekBreakdown(), [refreshKey]);
  const hourly = useMemo(() => DataService.getHourlyBreakdown(), [refreshKey]);
  const areas = useMemo(() => DataService.getAreaBreakdown(), [refreshKey]);
  const overall = useMemo(() => DataService.getOverallSummary(), [refreshKey]);
  const monthly = useMemo(() => DataService.getMonthlyBreakdown(), [refreshKey]);

  const hasData = overall.rideCount > 0;

  // バーチャートコンポーネント（CSS純正）
  const BarChart = ({ data, valueKey, labelKey, color, maxBars = 30, height = 200, prefix = '¥' }) => {
    const maxVal = Math.max(...data.map(d => d[valueKey]), 1);
    const barData = data.slice(-maxBars);

    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'flex-end', gap: '2px', height: `${height}px`, padding: '0 4px' },
    },
      barData.map((d, i) => {
        const pct = (d[valueKey] / maxVal) * 100;
        return React.createElement('div', {
          key: i,
          style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
          title: `${d[labelKey]}: ${prefix}${d[valueKey].toLocaleString()}`,
        },
          React.createElement('div', {
            style: {
              width: '100%', minHeight: '2px',
              height: `${Math.max(pct, 1)}%`,
              background: d[valueKey] === 0 ? 'rgba(255,255,255,0.05)' : color,
              borderRadius: '3px 3px 0 0',
              transition: 'height 0.3s ease',
            },
          })
        );
      })
    );
  };

  // 横棒グラフ
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
  ];

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'analytics'),
      '売上分析'
    ),

    // サマリーカード
    React.createElement('div', { className: 'grid grid--4', style: { marginBottom: 'var(--space-lg)' } },
      [
        { label: '累計売上', value: `¥${overall.totalAmount.toLocaleString()}`, icon: 'payments', color: 'var(--color-secondary)' },
        { label: '累計乗車', value: `${overall.rideCount}回`, icon: 'people', color: 'var(--color-primary-light)' },
        { label: '平均単価', value: `¥${overall.avgAmount.toLocaleString()}`, icon: 'price_check', color: 'var(--color-accent)' },
        { label: '日平均', value: `¥${overall.dailyAvg.toLocaleString()}`, icon: 'trending_up', color: 'var(--color-warning)' },
      ].map((s, i) =>
        React.createElement(Card, { key: i, className: 'stat-card' },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '28px', color: s.color, marginBottom: '4px' },
          }, s.icon),
          React.createElement('div', { className: 'stat-card__value', style: { fontSize: 'var(--font-size-xl)' } }, s.value),
          React.createElement('div', { className: 'stat-card__label' }, s.label)
        )
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
        React.createElement(BarChart, { data: daily, valueKey: 'amount', labelKey: 'date', color: 'var(--color-primary-light)', height: 180 }),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '8px', padding: '0 4px' },
        },
          React.createElement('span', null, daily.length > 0 ? daily[0].date.slice(5) : ''),
          React.createElement('span', null, '今日')
        )
      ),
      monthly.length > 0 && React.createElement(Card, { title: '月別集計', style: { marginBottom: 'var(--space-lg)' } },
        monthly.map((m, i) =>
          React.createElement('div', {
            key: i,
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
          },
            React.createElement('span', { style: { fontWeight: 500 } }, m.month),
            React.createElement('div', { style: { display: 'flex', gap: '16px', alignItems: 'center' } },
              React.createElement('span', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, `${m.count}回`),
              React.createElement('span', { style: { fontWeight: 700, color: 'var(--color-secondary)' } }, `¥${m.amount.toLocaleString()}`)
            )
          )
        )
      )
    ),

    // 曜日別タブ
    tab === 'dayOfWeek' && React.createElement(React.Fragment, null,
      React.createElement(Card, { title: '曜日別売上合計', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, { data: dayOfWeek, valueKey: 'amount', labelKey: 'name', color: 'var(--color-accent)', height: 160 }),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-around', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '6px' },
        }, dayOfWeek.map(d => React.createElement('span', { key: d.name }, d.name)))
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
            React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', fontWeight: 500, textAlign: 'right' } }, `¥${d.amount.toLocaleString()}`)
          )
        )
      )
    ),

    // 時間帯別タブ
    tab === 'hourly' && React.createElement(React.Fragment, null,
      React.createElement(Card, { title: '時間帯別売上', subtitle: '各時間帯の合計売上額', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, { data: hourly, valueKey: 'amount', labelKey: 'label', color: 'var(--color-warning)', height: 160, maxBars: 24 }),
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
                  React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--color-secondary)' } }, `¥${p.amount.toLocaleString()}`)
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
                  React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--color-accent)' } }, `¥${p.amount.toLocaleString()}`)
                )
              )
            )
      )
    )
  );
};
