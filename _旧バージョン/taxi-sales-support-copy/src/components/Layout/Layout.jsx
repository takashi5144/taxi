// Layout.jsx - レイアウトラッパー
window.Layout = ({ children }) => {
  const { sidebarOpen, setSidebarOpen } = useAppContext();

  return React.createElement(React.Fragment, null,
    React.createElement(Header),
    React.createElement(Sidebar),
    React.createElement('main', { className: 'main-content' }, children),
    React.createElement(BottomNav),

    // オーバーレイ（モバイルサイドバー表示時）
    sidebarOpen && React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 800,
      },
      onClick: () => setSidebarOpen(false),
    })
  );
};
