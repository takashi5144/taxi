// Header.jsx - ヘッダーナビゲーション
window.Header = () => {
  const { currentPage, navigate, sidebarOpen, setSidebarOpen } = useAppContext();

  return React.createElement('header', { className: 'header' },
    // メニュートグル（モバイル）
    React.createElement('button', {
      className: 'header__menu-toggle',
      onClick: () => setSidebarOpen(!sidebarOpen),
    },
      React.createElement('span', { className: 'material-icons-round' }, sidebarOpen ? 'close' : 'menu')
    ),

    // ロゴ
    React.createElement('div', {
      className: 'header__logo',
      onClick: () => navigate('dashboard'),
    },
      React.createElement('span', { className: 'material-icons-round' }, 'local_taxi'),
      React.createElement('span', null, 'タクシー売上サポート')
    ),

    // ナビゲーション（PC用）
    React.createElement('nav', { className: 'header__nav' },
      APP_CONSTANTS.NAV_ITEMS.map(item =>
        React.createElement('button', {
          key: item.id,
          className: `header__nav-btn ${currentPage === item.id ? 'active' : ''}`,
          onClick: () => navigate(item.id),
        },
          React.createElement('span', { className: 'material-icons-round' }, item.icon),
          React.createElement('span', null, item.label)
        )
      ),
      // 開発者ツールボタン
      React.createElement('button', {
        className: `header__nav-btn ${currentPage.startsWith('dev') ? 'active' : ''}`,
        onClick: () => navigate('dev'),
        style: { marginLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px' },
      },
        React.createElement('span', { className: 'material-icons-round' }, 'code'),
        React.createElement('span', null, '開発者')
      )
    )
  );
};
