// Dashboard.jsx - ダッシュボード（DataServiceからリアルタイムデータ取得）
window.DashboardPage = () => {
  const { useState, useEffect, useMemo } = React;
  const { navigate } = useAppContext();
  const { currentPosition, isTracking } = useMapContext();

  // DataServiceからリアルタイムデータを取得
  const [refreshKey, setRefreshKey] = useState(0);

  // localStorageの変更を監視して自動更新
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

  const todaySummary = useMemo(() => DataService.getTodaySummary(), [refreshKey]);
  const overallSummary = useMemo(() => DataService.getOverallSummary(), [refreshKey]);

  const stats = [
    {
      label: '本日の売上',
      value: `¥${todaySummary.totalAmount.toLocaleString()}`,
      icon: 'payments',
      color: 'var(--color-secondary)',
    },
    {
      label: '乗車回数',
      value: `${todaySummary.rideCount}回`,
      icon: 'people',
      color: 'var(--color-primary-light)',
    },
    {
      label: '平均単価',
      value: `¥${todaySummary.avgAmount.toLocaleString()}`,
      icon: 'price_check',
      color: 'var(--color-accent)',
    },
    {
      label: '稼働時間',
      value: todaySummary.workTime,
      icon: 'schedule',
      color: 'var(--color-warning)',
    },
  ];

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

    // 本日の統計カード
    React.createElement('div', { className: 'grid grid--4', style: { marginBottom: 'var(--space-lg)' } },
      stats.map((stat, i) =>
        React.createElement(Card, { key: i, className: 'stat-card' },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '32px', color: stat.color, marginBottom: '8px' },
          }, stat.icon),
          React.createElement('div', { className: 'stat-card__value' }, stat.value),
          React.createElement('div', { className: 'stat-card__label' }, stat.label)
        )
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
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, '累計売上')
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
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, '日平均売上')
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
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } },
              new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            )
          ),
          React.createElement('div', {
            style: { fontWeight: 700, color: 'var(--color-secondary)' },
          }, `¥${entry.amount.toLocaleString()}`)
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
