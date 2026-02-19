// DevTools.jsx - 開発者ツールハブ
window.DevToolsPage = () => {
  const { navigate } = useAppContext();
  const { logs } = useLogContext();

  const tools = [
    {
      id: 'dev-structure',
      title: 'サイト構造',
      desc: 'ファイル構造、ルーティング、コンポーネント階層を確認',
      icon: 'account_tree',
      color: 'var(--color-primary-light)',
      badge: null,
    },
    {
      id: 'dev-logs',
      title: 'ログビューア',
      desc: 'アプリケーションのリアルタイムログを確認・検索',
      icon: 'terminal',
      color: 'var(--color-accent)',
      badge: `${logs.length} 件`,
    },
    {
      id: 'dev-api',
      title: 'API接続状態',
      desc: 'Google Maps API、GPS、ブラウザAPIの接続状態を確認',
      icon: 'cloud',
      color: 'var(--color-secondary)',
      badge: null,
    },
  ];

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'code'),
      '開発者ツール'
    ),

    React.createElement('p', {
      style: { color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', fontSize: 'var(--font-size-sm)' },
    }, 'アプリの内部構造やログ、API接続状態を確認できます。生成AIでの開発時にこのページを参照してください。'),

    // ツール一覧
    React.createElement('div', { className: 'grid grid--3' },
      tools.map(tool =>
        React.createElement(Card, {
          key: tool.id,
          onClick: () => navigate(tool.id),
          style: { cursor: 'pointer', textAlign: 'center', padding: 'var(--space-xl)' },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '48px', color: tool.color, marginBottom: '12px' },
          }, tool.icon),
          React.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } }, tool.title),
          React.createElement('div', {
            style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '8px' },
          }, tool.desc),
          tool.badge && React.createElement('span', { className: 'badge badge--info' }, tool.badge)
        )
      )
    ),

    // 最新ログプレビュー
    React.createElement(Card, {
      title: '最新ログ（直近5件）',
      style: { marginTop: 'var(--space-lg)' },
    },
      logs.length === 0
        ? React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' } }, 'ログはまだありません')
        : [...logs].reverse().slice(0, 5).map(log =>
            React.createElement('div', { key: log.id, className: 'dev-log-entry' },
              React.createElement('span', { className: 'dev-log-entry__time' },
                new Date(log.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              ),
              React.createElement('span', { className: `dev-log-entry__level dev-log-entry__level--${log.level}` },
                log.level.toUpperCase()
              ),
              React.createElement('span', { className: 'dev-log-entry__message' }, log.message)
            )
          ),
      logs.length > 5 && React.createElement(Button, {
        variant: 'secondary',
        icon: 'arrow_forward',
        onClick: () => navigate('dev-logs'),
        style: { marginTop: 'var(--space-md)' },
      }, 'すべてのログを表示')
    ),

    // クイック情報
    React.createElement(Card, {
      title: 'プロジェクト情報',
      style: { marginTop: 'var(--space-lg)' },
    },
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: 'var(--font-size-sm)' } },
        [
          ['フレームワーク', `React ${React.version}`],
          ['ビルド', 'CDN (Babel トランスパイル)'],
          ['地図', 'Google Maps JavaScript API'],
          ['バージョン', APP_CONSTANTS.VERSION],
          ['GPS', 'Geolocation API'],
          ['レスポンシブ', 'PC / タブレット / Android'],
        ].map(([k, v], i) =>
          React.createElement('div', { key: i },
            React.createElement('span', { style: { color: 'var(--text-muted)' } }, `${k}: `),
            React.createElement('span', null, v)
          )
        )
      )
    )
  );
};
