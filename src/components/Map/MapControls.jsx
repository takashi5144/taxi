// MapControls.jsx - 地図操作コントロール
//
// 地図上に表示する操作ボタン群（渋滞情報トグル、現在地移動、外部マップ起動）

window.MapControls = ({
  showTraffic,
  onToggleTraffic,
  onCenterToPosition,
  currentPosition,
  mapCenter,
  zoom,
}) => {
  const controlBtnBase = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#fff',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(26,26,46,0.85)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.2s ease',
  };

  return React.createElement('div', {
    style: {
      position: 'absolute',
      top: '12px',
      right: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      zIndex: 5,
    },
  },
    // 渋滞情報トグル
    React.createElement('button', {
      onClick: onToggleTraffic,
      style: {
        ...controlBtnBase,
        border: showTraffic ? 'none' : controlBtnBase.border,
        background: showTraffic ? '#ef4444' : controlBtnBase.background,
      },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'traffic'),
      `渋滞情報 ${showTraffic ? 'ON' : 'OFF'}`
    ),

    // 現在地に移動
    currentPosition && React.createElement('button', {
      onClick: onCenterToPosition,
      style: controlBtnBase,
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'my_location'),
      '現在地'
    ),

    // Google Mapsで開く
    React.createElement('a', {
      href: `https://www.google.com/maps/@${mapCenter.lat},${mapCenter.lng},${zoom}z/data=!5m1!1e1`,
      target: '_blank',
      rel: 'noreferrer',
      style: { ...controlBtnBase, textDecoration: 'none' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'open_in_new'),
      'Google Mapsで開く'
    )
  );
};

// 渋滞凡例コンポーネント
window.TrafficLegend = ({ visible }) => {
  if (!visible) return null;

  const items = [
    { c: '#22c55e', l: 'スムーズ' },
    { c: '#f59e0b', l: 'やや混雑' },
    { c: '#f97316', l: '混雑' },
    { c: '#ef4444', l: '渋滞' },
    { c: '#7f1d1d', l: '大渋滞' },
  ];

  return React.createElement('div', {
    style: {
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      background: 'rgba(255,255,255,0.92)',
      borderRadius: '8px',
      padding: '6px 10px',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      zIndex: 5,
    },
  },
    React.createElement('span', {
      style: { fontSize: '11px', fontWeight: '600', color: '#333' },
    }, '渋滞:'),
    ...items.map(item =>
      React.createElement('span', {
        key: item.l,
        style: { display: 'flex', alignItems: 'center', gap: '3px' },
      },
        React.createElement('span', {
          style: { display: 'inline-block', width: '18px', height: '4px', borderRadius: '2px', background: item.c },
        }),
        React.createElement('span', { style: { fontSize: '10px', color: '#555' } }, item.l)
      )
    )
  );
};
