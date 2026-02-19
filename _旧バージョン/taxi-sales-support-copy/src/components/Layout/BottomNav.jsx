// BottomNav.jsx - モバイル用ボトムナビゲーション
window.BottomNav = () => {
  const { currentPage, navigate } = useAppContext();

  return React.createElement('nav', { className: 'bottom-nav' },
    React.createElement('div', { className: 'bottom-nav__items' },
      APP_CONSTANTS.BOTTOM_NAV_ITEMS.map(item =>
        React.createElement('button', {
          key: item.id,
          className: `bottom-nav__item ${currentPage === item.id ? 'active' : ''}`,
          onClick: () => navigate(item.id),
        },
          React.createElement('span', { className: 'material-icons-round' }, item.icon),
          React.createElement('span', null, item.label)
        )
      )
    )
  );
};
