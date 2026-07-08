(function() {
// Header.jsx - ヘッダーナビゲーション
window.Header = () => {
  const { currentPage, navigate, sidebarOpen, setSidebarOpen } = useAppContext();
  const { currentLocationName, isTracking } = useMapContext();

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
      React.createElement('span', { className: 'material-icons-round' }, 'local_taxi')
    ),

    // 現在地表示（GPS追跡中は常時表示）
    isTracking && currentLocationName && React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '20px',
        background: 'rgba(100, 181, 246, 0.12)',
        border: '1px solid rgba(100, 181, 246, 0.25)',
        fontSize: '12px',
        color: '#64b5f6',
        fontWeight: 500,
        maxWidth: '280px',
        flexShrink: 1,
        overflow: 'hidden',
      },
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '14px', flexShrink: 0 },
      }, 'location_on'),
      React.createElement('span', {
        style: {
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: '11px',
        },
      }, currentLocationName)
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
      // 情報セクション セパレーター + 項目
      React.createElement('span', {
        style: { display: 'inline-block', width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px', verticalAlign: 'middle' },
      }),
      APP_CONSTANTS.INFO_NAV_ITEMS.map(item =>
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

})();
