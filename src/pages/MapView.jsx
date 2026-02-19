// MapView.jsx - 地図ページ
window.MapViewPage = () => {
  const { useState } = React;
  const [isFullscreen, setIsFullscreen] = useState(false);

  return React.createElement('div', null,
    !isFullscreen && React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' },
    },
      React.createElement('h1', { className: 'page-title', style: { marginBottom: 0 } },
        React.createElement('span', { className: 'material-icons-round' }, 'map'),
        '地図'
      ),
      React.createElement(Button, {
        variant: 'secondary',
        icon: 'fullscreen',
        onClick: () => setIsFullscreen(true),
      }, '全画面')
    ),

    // 地図コンテナ
    React.createElement('div', { style: { position: 'relative' } },
      React.createElement(GoogleMapView, { fullscreen: isFullscreen }),

      // 全画面時の閉じるボタン
      isFullscreen && React.createElement(Button, {
        variant: 'secondary',
        icon: 'fullscreen_exit',
        onClick: () => setIsFullscreen(false),
        style: {
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 10,
          background: 'rgba(26,26,46,0.9)',
        },
      }, '閉じる')
    ),

    // GPS追跡パネル（マップの外側・下に表示）
    React.createElement(GpsTracker)
  );
};
