(function() {
// Analytics.jsx - 売上分析（新規売上記録で入力できる項目のみ）
// 使用: 日付・合算日・曜日/祝日・乗車時間・降車時間・金額・支払方法・割引
// 不使用: 人数・天候・性別・用途・メモ・配車・エリア・GPS・他社・リピーター 等

// 縦棒グラフ
const BarChart = ({ data, valueKey, labelKey, color, maxBars = 30, height = 200, prefix = '¥', labelInterval = 5 }) => {
  const [activeIdx, setActiveIdx] = React.useState(null);
  const maxVal = Math.max(...data.map(d => d[valueKey]), 1);
  const barData = data.slice(-maxBars);

  const formatLabel = (label) => {
    if (!label) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
      const parts = label.split('-');
      return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
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
    }, `${formatLabel(barData[activeIdx][labelKey])}  ${prefix}${Number(barData[activeIdx][valueKey]).toLocaleString()}`),
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
          React.createElement('span', { style: { fontWeight: 600, color: 'var(--text-primary)' } },
            `${prefix}${Number(d[valueKey]).toLocaleString()}${d.count != null ? `（${d.count}件）` : ''}`
          )
        ),
        React.createElement('div', {
          style: { height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
        },
          React.createElement('div', {
            style: {
              width: `${Math.max(pct, d[valueKey] > 0 ? 2 : 0)}%`,
              height: '100%', background: color, borderRadius: '4px',
              transition: 'width 0.3s ease',
            },
          })
        )
      );
    })
  );
};

// 簡易テーブル行
const SimpleTable = ({ headers, rows }) =>
  React.createElement('div', { style: { overflowX: 'auto' } },
    React.createElement('table', {
      style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
    },
      React.createElement('thead', null,
        React.createElement('tr', null,
          ...headers.map((h, i) =>
            React.createElement('th', {
              key: i,
              style: {
                textAlign: i === 0 ? 'left' : 'right',
                padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              },
            }, h)
          )
        )
      ),
      React.createElement('tbody', null,
        ...rows.map((row, ri) =>
          React.createElement('tr', { key: ri },
            ...row.map((cell, ci) =>
              React.createElement('td', {
                key: ci,
                style: {
                  textAlign: ci === 0 ? 'left' : 'right',
                  padding: '8px 6px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: ci === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
                  fontWeight: ci > 0 ? 600 : 400,
                },
              }, cell)
            )
          )
        )
      )
    )
  );

window.AnalyticsPage = () => {
  const { useState, useEffect, useMemo } = React;
  const [tab, setTab] = useState('daily');
  const [refreshKey, setRefreshKey] = useState(0);
  const [dayTypeFilter, setDayTypeFilter] = useState(null); // null | 'weekday' | 'holiday'

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA) setRefreshKey(k => k + 1);
    };
    const handleVisibility = () => { if (!document.hidden) setRefreshKey(k => k + 1); };
    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('taxi-data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
    };
  }, []);

  const dt = dayTypeFilter;
  const overall = useMemo(() => DataService.getOverallSummary(dt), [refreshKey, dt]);
  const daily = useMemo(() => DataService.getDailyBreakdown(30, dt), [refreshKey, dt]);
  const monthly = useMemo(() => DataService.getMonthlyBreakdown(dt), [refreshKey, dt]);
  const dayOfWeek = useMemo(() => DataService.getDayOfWeekBreakdown(dt), [refreshKey, dt]);
  const hourly = useMemo(() => DataService.getHourlyBreakdown(dt), [refreshKey, dt]);

  // 支払方法・割引・乗車所要時間（新規フォームで入力できる項目のみ）
  const paymentAndDiscount = useMemo(() => {
    const entries = DataService.getFilteredEntries
      ? DataService.getFilteredEntries(dt)
      : DataService.getEntries();

    const payMap = {
      cash: { name: '現金', amount: 0, count: 0 },
      uncollected: { name: '未収', amount: 0, count: 0 },
      didi: { name: 'DIDI決済', amount: 0, count: 0 },
      uber: { name: 'Uber', amount: 0, count: 0 },
      ticket: { name: 'チケット', amount: 0, count: 0 },
      other: { name: 'その他', amount: 0, count: 0 },
    };

    const discMap = {
      disability: { name: '障害者割引', amount: 0, count: 0 },
      longDistance: { name: '遠距離割', amount: 0, count: 0 },
      coupon: { name: 'クーポン', amount: 0, count: 0 },
    };

    let totalDiscount = 0;
    let discountedRides = 0;
    let durationSum = 0;
    let durationCount = 0;
    const durationBuckets = [
      { name: '15分未満', min: 0, max: 15, amount: 0, count: 0 },
      { name: '15〜30分', min: 15, max: 30, amount: 0, count: 0 },
      { name: '30〜60分', min: 30, max: 60, amount: 0, count: 0 },
      { name: '60分以上', min: 60, max: 9999, amount: 0, count: 0 },
    ];

    const parseMinutes = (t) => {
      if (!t || typeof t !== 'string' || !t.includes(':')) return null;
      const [h, m] = t.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    };

    entries.forEach((e) => {
      const amt = e.amount || 0;
      const method = e.paymentMethod || 'cash';
      const bucket = payMap[method] || payMap.other;
      bucket.amount += amt;
      bucket.count += 1;

      // 割引（配列 or 旧フィールド）
      let rideHasDiscount = false;
      if (e.discounts && Array.isArray(e.discounts)) {
        e.discounts.forEach((d) => {
          const type = d.type;
          const da = d.amount || 0;
          if (discMap[type]) {
            discMap[type].amount += da;
            discMap[type].count += 1;
            totalDiscount += da;
            rideHasDiscount = true;
          }
        });
      }
      if (e.discountAmount > 0) {
        totalDiscount += e.discountAmount;
        rideHasDiscount = true;
        if (!e.discounts || !Array.isArray(e.discounts) || e.discounts.length === 0) {
          const t = e.discountType || '';
          if (t.includes('disability')) { discMap.disability.amount += e.discountAmount; discMap.disability.count += 1; }
          else if (t.includes('longDistance')) { discMap.longDistance.amount += e.discountAmount; discMap.longDistance.count += 1; }
          else { discMap.disability.amount += e.discountAmount; discMap.disability.count += 1; }
        }
      }
      if (e.couponAmount > 0) {
        discMap.coupon.amount += e.couponAmount;
        discMap.coupon.count += 1;
        totalDiscount += e.couponAmount;
        rideHasDiscount = true;
      }
      if (rideHasDiscount) discountedRides += 1;

      // 乗車時間〜降車時間の所要
      const p = parseMinutes(e.pickupTime);
      const d = parseMinutes(e.dropoffTime);
      if (p != null && d != null) {
        let mins = d - p;
        if (mins < 0) mins += 24 * 60; // 日またぎ
        if (mins >= 0 && mins < 24 * 60) {
          durationSum += mins;
          durationCount += 1;
          const b = durationBuckets.find(x => mins >= x.min && mins < x.max);
          if (b) {
            b.count += 1;
            b.amount += amt;
          }
        }
      }
    });

    const payment = Object.values(payMap).filter(p => p.count > 0)
      .sort((a, b) => b.amount - a.amount);
    const discounts = Object.values(discMap).filter(d => d.count > 0)
      .sort((a, b) => b.amount - a.amount);

    return {
      payment,
      discounts,
      totalDiscount,
      discountedRides,
      entryCount: entries.length,
      avgDuration: durationCount > 0 ? Math.round(durationSum / durationCount) : null,
      durationCount,
      durationBuckets: durationBuckets.filter(b => b.count > 0),
    };
  }, [refreshKey, dt]);

  const hasData = overall.rideCount > 0;

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
          '売上記録からデータを追加すると、ここに分析結果が表示されます。'
        )
      )
    );
  }

  const tabs = [
    { id: 'daily', label: '日別', icon: 'calendar_today' },
    { id: 'dayOfWeek', label: '曜日別', icon: 'date_range' },
    { id: 'hourly', label: '時間帯', icon: 'schedule' },
    { id: 'payment', label: '支払方法', icon: 'payments' },
    { id: 'discount', label: '割引', icon: 'local_offer' },
    { id: 'duration', label: '所要時間', icon: 'timer' },
  ];

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'analytics'),
      '売上分析'
    ),

    React.createElement('p', {
      style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', lineHeight: 1.5 },
    }, '分析に使う項目: 日付・合算日・曜日/祝日・乗車時間・降車時間・金額・支払方法・割引（人数・天候・用途・配車・エリア等は対象外）'),

    dayTypeFilter && React.createElement('div', {
      style: { marginBottom: 'var(--space-sm)', fontSize: '12px', color: 'var(--color-primary-light)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'filter_alt'),
      dayTypeFilter === 'weekday' ? '平日のデータのみ表示中' : '土日祝のデータのみ表示中'
    ),

    // サマリー
    React.createElement('div', { className: 'grid grid--4', style: { marginBottom: 'var(--space-lg)' } },
      [
        { label: '累計売上（税込）', value: `¥${overall.totalAmount.toLocaleString()}`, sub: `税抜¥${Math.floor(overall.totalAmount / 1.1).toLocaleString()}`, icon: 'payments', color: 'var(--color-secondary)' },
        { label: '累計件数', value: `${overall.rideCount}件`, icon: 'receipt_long', color: 'var(--color-primary-light)' },
        { label: '平均単価（税込）', value: `¥${overall.avgAmount.toLocaleString()}`, icon: 'price_check', color: 'var(--color-accent)' },
        { label: '日平均（税込）', value: `¥${overall.dailyAvg.toLocaleString()}`, sub: `${overall.activeDays || 0}日稼働`, icon: 'trending_up', color: 'var(--color-warning)' },
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

    // 当月
    (() => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const cm = monthly.find(m => m.month === currentMonth);
      const amt = cm ? cm.amount : 0;
      const cnt = cm ? cm.count : 0;
      return React.createElement('div', {
        style: {
          background: 'linear-gradient(135deg, rgba(26,115,232,0.15), rgba(255,167,38,0.10))',
          border: '1px solid rgba(26,115,232,0.3)', borderRadius: '12px',
          padding: '16px 20px', marginBottom: 'var(--space-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px', color: 'var(--color-primary-light)' } }, 'calendar_month'),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, `${now.getFullYear()}年${now.getMonth() + 1}月の売上合計`),
            React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } }, `${cnt}件`)
          )
        ),
        React.createElement('div', { style: { textAlign: 'right' } },
          React.createElement('div', { style: { fontSize: '24px', fontWeight: 800, color: 'var(--color-secondary)' } }, `¥${amt.toLocaleString()}`),
          React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } },
            `税抜¥${Math.floor(amt / 1.1).toLocaleString()}　税¥${(amt - Math.floor(amt / 1.1)).toLocaleString()}`
          )
        )
      );
    })(),

    // 日種別フィルタ
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
          type: 'button',
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

    // タブ
    React.createElement('div', {
      style: { display: 'flex', gap: '4px', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' },
    },
      tabs.map(t =>
        React.createElement('button', {
          key: t.id,
          type: 'button',
          onClick: () => setTab(t.id),
          style: {
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '8px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: tab === t.id ? 700 : 500,
            background: tab === t.id ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
            color: tab === t.id ? 'var(--color-primary-light)' : 'var(--text-muted)',
            fontFamily: 'var(--font-family)',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, t.icon),
          t.label
        )
      )
    ),

    // ===== 日別 =====
    tab === 'daily' && React.createElement(React.Fragment, null,
      React.createElement(Card, { title: '直近30日 売上', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, {
          data: daily, valueKey: 'amount', labelKey: 'date',
          color: 'var(--color-primary-light)', height: 180, labelInterval: 5,
        })
      ),
      React.createElement(Card, { title: '日別 詳細', style: { marginBottom: 'var(--space-lg)' } },
        SimpleTable({
          headers: ['日付', '件数', '売上', '平均'],
          rows: [...daily].reverse().filter(d => d.count > 0).slice(0, 31).map(d => [
            d.date,
            `${d.count}件`,
            `¥${d.amount.toLocaleString()}`,
            `¥${d.count ? Math.round(d.amount / d.count).toLocaleString() : 0}`,
          ]),
        })
      ),
      monthly.length > 0 && React.createElement(Card, { title: '月別 売上' },
        React.createElement(HBarChart, {
          data: [...monthly].slice(-12).map(m => ({
            name: m.month, amount: m.amount, count: m.count,
          })),
          nameKey: 'name', valueKey: 'amount', color: 'var(--color-secondary)',
        })
      )
    ),

    // ===== 曜日別 =====
    tab === 'dayOfWeek' && React.createElement(React.Fragment, null,
      React.createElement(Card, { title: '曜日別 売上合計', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, {
          data: dayOfWeek, valueKey: 'amount', labelKey: 'name',
          color: 'var(--color-accent)', height: 160, labelInterval: 1,
        })
      ),
      React.createElement(Card, { title: '曜日別 平均単価', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, {
          data: dayOfWeek, valueKey: 'avg', labelKey: 'name',
          color: 'var(--color-warning)', height: 140, labelInterval: 1,
        })
      ),
      React.createElement(Card, { title: '曜日別 詳細' },
        SimpleTable({
          headers: ['曜日', '件数', '合計', '平均'],
          rows: dayOfWeek.map(d => [
            d.name + '曜',
            `${d.count}件`,
            `¥${d.amount.toLocaleString()}`,
            `¥${d.avg.toLocaleString()}`,
          ]),
        })
      )
    ),

    // ===== 時間帯（乗車時間優先） =====
    tab === 'hourly' && React.createElement(React.Fragment, null,
      React.createElement(Card, {
        title: '時間帯別 売上',
        subtitle: '乗車時間（なければ降車時間）で集計',
        style: { marginBottom: 'var(--space-lg)' },
      },
        React.createElement(BarChart, {
          data: hourly, valueKey: 'amount', labelKey: 'label',
          color: 'var(--color-warning)', height: 160, maxBars: 24, labelInterval: 3,
        })
      ),
      React.createElement(Card, { title: '時間帯別 件数', style: { marginBottom: 'var(--space-lg)' } },
        React.createElement(BarChart, {
          data: hourly, valueKey: 'count', labelKey: 'label',
          color: 'var(--color-primary-light)', height: 140, maxBars: 24, prefix: '', labelInterval: 3,
        })
      ),
      React.createElement(Card, { title: '時間帯別 詳細' },
        SimpleTable({
          headers: ['時間', '件数', '合計', '平均'],
          rows: hourly.filter(h => h.count > 0).map(h => [
            h.label,
            `${h.count}件`,
            `¥${h.amount.toLocaleString()}`,
            `¥${h.avg.toLocaleString()}`,
          ]),
        })
      )
    ),

    // ===== 支払方法 =====
    tab === 'payment' && React.createElement(React.Fragment, null,
      paymentAndDiscount.payment.length === 0
        ? React.createElement(Card, null, React.createElement('p', { style: { color: 'var(--text-muted)' } }, '支払データがありません'))
        : React.createElement(React.Fragment, null,
            React.createElement(Card, { title: '支払方法別 売上', style: { marginBottom: 'var(--space-lg)' } },
              React.createElement(HBarChart, {
                data: paymentAndDiscount.payment,
                nameKey: 'name', valueKey: 'amount', color: 'var(--color-accent)',
              })
            ),
            React.createElement(Card, { title: '支払方法別 詳細' },
              SimpleTable({
                headers: ['方法', '件数', '合計', '構成比'],
                rows: paymentAndDiscount.payment.map(p => {
                  const pct = overall.totalAmount > 0
                    ? Math.round((p.amount / overall.totalAmount) * 1000) / 10
                    : 0;
                  return [
                    p.name,
                    `${p.count}件`,
                    `¥${p.amount.toLocaleString()}`,
                    `${pct}%`,
                  ];
                }),
              })
            )
          )
    ),

    // ===== 割引 =====
    tab === 'discount' && React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'grid grid--2', style: { marginBottom: 'var(--space-lg)', gap: '12px' } },
        React.createElement(Card, { className: 'stat-card' },
          React.createElement('div', { className: 'stat-card__value', style: { fontSize: 'var(--font-size-xl)', color: '#a78bfa' } },
            `¥${paymentAndDiscount.totalDiscount.toLocaleString()}`
          ),
          React.createElement('div', { className: 'stat-card__label' }, '割引・クーポン合計')
        ),
        React.createElement(Card, { className: 'stat-card' },
          React.createElement('div', { className: 'stat-card__value', style: { fontSize: 'var(--font-size-xl)' } },
            `${paymentAndDiscount.discountedRides}件`
          ),
          React.createElement('div', { className: 'stat-card__label' }, '割引ありの件数')
        )
      ),
      paymentAndDiscount.discounts.length === 0
        ? React.createElement(Card, null, React.createElement('p', { style: { color: 'var(--text-muted)' } }, '割引データがありません'))
        : React.createElement(React.Fragment, null,
            React.createElement(Card, { title: '割引種別', style: { marginBottom: 'var(--space-lg)' } },
              React.createElement(HBarChart, {
                data: paymentAndDiscount.discounts,
                nameKey: 'name', valueKey: 'amount', color: '#a78bfa',
              })
            ),
            React.createElement(Card, { title: '割引詳細' },
              SimpleTable({
                headers: ['種別', '件数', '合計額'],
                rows: paymentAndDiscount.discounts.map(d => [
                  d.name,
                  `${d.count}件`,
                  `¥${d.amount.toLocaleString()}`,
                ]),
              })
            )
          )
    ),

    // ===== 所要時間（乗車〜降車） =====
    tab === 'duration' && React.createElement(React.Fragment, null,
      React.createElement(Card, { style: { marginBottom: 'var(--space-lg)' } },
        React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' } },
          '乗車時間と降車時間の両方が入っている記録のみ集計'
        ),
        paymentAndDiscount.durationCount === 0
          ? React.createElement('p', { style: { color: 'var(--text-muted)' } }, '乗車・降車時間が揃ったデータがありません')
          : React.createElement('div', { style: { display: 'flex', gap: '24px', flexWrap: 'wrap' } },
              React.createElement('div', null,
                React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, '平均所要時間'),
                React.createElement('div', { style: { fontSize: '28px', fontWeight: 800, color: 'var(--color-accent)' } },
                  `${paymentAndDiscount.avgDuration}分`
                )
              ),
              React.createElement('div', null,
                React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, '集計件数'),
                React.createElement('div', { style: { fontSize: '28px', fontWeight: 800 } },
                  `${paymentAndDiscount.durationCount}件`
                )
              )
            )
      ),
      paymentAndDiscount.durationBuckets.length > 0 && React.createElement(Card, {
        title: '所要時間帯別', style: { marginBottom: 'var(--space-lg)' },
      },
        React.createElement(HBarChart, {
          data: paymentAndDiscount.durationBuckets,
          nameKey: 'name', valueKey: 'amount', color: 'var(--color-warning)',
        })
      ),
      paymentAndDiscount.durationBuckets.length > 0 && React.createElement(Card, { title: '所要時間 詳細' },
        SimpleTable({
          headers: ['区分', '件数', '売上合計', '平均'],
          rows: paymentAndDiscount.durationBuckets.map(b => [
            b.name,
            `${b.count}件`,
            `¥${b.amount.toLocaleString()}`,
            `¥${b.count ? Math.round(b.amount / b.count).toLocaleString() : 0}`,
          ]),
        })
      )
    )
  );
};
})();
