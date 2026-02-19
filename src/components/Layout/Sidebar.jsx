// Sidebar.jsx - PC用サイドバー
window.Sidebar = () => {
  const { currentPage, navigate, sidebarOpen } = useAppContext();

  const devItems = [
    { id: 'dev', label: '開発者ツール', icon: 'code' },
    { id: 'dev-structure', label: 'サイト構造', icon: 'account_tree' },
    { id: 'dev-logs', label: 'ログビューア', icon: 'terminal' },
    { id: 'dev-api', label: 'API状態', icon: 'cloud' },
  ];

  return React.createElement('aside', {
    className: `sidebar ${sidebarOpen ? 'open' : ''}`,
  },
    // メインナビ
    React.createElement('div', { className: 'sidebar__section' },
      React.createElement('div', { className: 'sidebar__section-title' }, 'メインメニュー'),
      APP_CONSTANTS.NAV_ITEMS.map(item =>
        React.createElement('button', {
          key: item.id,
          className: `sidebar__item ${currentPage === item.id ? 'active' : ''}`,
          onClick: () => navigate(item.id),
        },
          React.createElement('span', { className: 'material-icons-round' }, item.icon),
          item.label
        )
      )
    ),

    // 開発者ツール
    React.createElement('div', { className: 'sidebar__section' },
      React.createElement('div', { className: 'sidebar__section-title' }, '開発者ツール'),
      devItems.map(item =>
        React.createElement('button', {
          key: item.id,
          className: `sidebar__item ${currentPage === item.id ? 'active' : ''}`,
          onClick: () => navigate(item.id),
        },
          React.createElement('span', { className: 'material-icons-round' }, item.icon),
          item.label
        )
      )
    ),

    // バージョン
    React.createElement('div', {
      style: {
        padding: 'var(--space-md)',
        marginTop: 'auto',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-muted)',
        textAlign: 'center',
      },
    }, `v${APP_CONSTANTS.VERSION}`)
  );
};
