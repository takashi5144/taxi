(function() {
// Header.jsx - ヘッダーナビゲーション
window.Header = () => {
  const { currentPage, navigate, sidebarOpen, setSidebarOpen } = useAppContext();
  const { standbyStatus } = useMapContext();

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

    // 待機中インジケーター（GPS待機検出時に表示）
    standbyStatus && React.createElement('div', {
      className: 'header__standby-indicator',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '20px',
        background: 'rgba(255, 167, 38, 0.15)',
        border: '1px solid rgba(255, 167, 38, 0.3)',
        fontSize: '12px',
        color: '#ffa726',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        maxWidth: '280px',
        flexShrink: 0,
        animation: 'standbyPulse 2s ease-in-out infinite',
      },
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '16px', color: '#ffa726' },
      }, 'hourglass_top'),
      React.createElement('span', {
        style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 },
      }, standbyStatus.durationMin + ':' + String(standbyStatus.durationSec).padStart(2, '0')),
      standbyStatus.locationName && React.createElement('span', {
        style: {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: 'rgba(255, 167, 38, 0.85)',
          fontSize: '11px',
        },
      }, standbyStatus.locationName)
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
