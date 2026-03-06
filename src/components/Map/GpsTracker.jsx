(function() {
// GpsTracker.jsx - GPS追跡パネル
window.GpsTracker = () => {
  const { currentPosition, isTracking, gpsError, accuracy, speed, heading } = useMapContext();
  const geo = useGeolocation();

  const formatCoord = (val) => val ? val.toFixed(6) : '---';
  const formatAccuracy = (val) => {
    if (!val) return '---';
    const m = Math.round(val);
    if (m <= 100) return `${m}m (高精度)`;
    if (m <= 500) return `${m}m (中精度)`;
    return `${m}m (低精度)`;
  };
  const formatSpeed = (val) => val !== null && val !== undefined ? `${(val * 3.6).toFixed(1)} km/h` : '---';
  const formatHeading = (val) => {
    if (val === null || val === undefined) return '---';
    const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
    return dirs[Math.round(val / 45) % 8] + ` (${Math.round(val)}°)`;
  };

  return React.createElement('div', { className: 'gps-panel' },
    // ステータス行
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '18px', color: isTracking ? 'var(--color-accent)' : 'var(--text-muted)' },
        }, isTracking ? 'gps_fixed' : 'gps_not_fixed'),
        React.createElement('span', {
          className: `badge ${isTracking ? 'badge--success' : 'badge--warning'}`,
        }, isTracking ? 'GPS追跡中' : 'GPS停止中')
      ),
      React.createElement('div', { style: { display: 'flex', gap: '4px' } },
        !isTracking && React.createElement(Button, {
          variant: 'primary',
          icon: 'my_location',
          onClick: () => { geo.getCurrentPosition(); },
          style: { padding: '4px 12px', fontSize: '12px' },
        }, '現在地'),
        React.createElement(Button, {
          variant: isTracking ? 'danger' : 'success',
          icon: isTracking ? 'stop' : 'play_arrow',
          onClick: () => isTracking ? geo.stopTracking() : geo.startTracking(),
          style: { padding: '4px 12px', fontSize: '12px' },
        }, isTracking ? '停止' : '追跡開始')
      )
    ),

    // エラー表示
    gpsError && React.createElement('div', {
      style: { color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'warning'),
      gpsError
    ),

    // PC環境での精度警告
    accuracy && accuracy > 500 && React.createElement('div', {
      style: {
        color: accuracy > 1000 ? 'var(--color-danger)' : 'var(--color-warning)',
        fontSize: 'var(--font-size-xs)', marginBottom: '6px',
        display: 'flex', alignItems: 'center', gap: '4px',
        background: accuracy > 1000 ? 'rgba(229,57,53,0.1)' : 'rgba(249,168,37,0.1)',
        padding: '4px 8px', borderRadius: '4px',
      },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'info'),
      'PCではGPSがないため位置精度が低くなります。スマートフォンでの利用を推奨します。'
    ),

    // 位置情報
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' } },
      React.createElement('div', { className: 'gps-panel__row' },
        React.createElement('span', { className: 'gps-panel__label' }, '緯度'),
        React.createElement('span', { className: 'gps-panel__value' }, formatCoord(currentPosition?.lat))
      ),
      React.createElement('div', { className: 'gps-panel__row' },
        React.createElement('span', { className: 'gps-panel__label' }, '経度'),
        React.createElement('span', { className: 'gps-panel__value' }, formatCoord(currentPosition?.lng))
      ),
      React.createElement('div', { className: 'gps-panel__row' },
        React.createElement('span', { className: 'gps-panel__label' }, '精度'),
        React.createElement('span', {
          className: 'gps-panel__value',
          style: { color: !accuracy ? undefined : accuracy <= 100 ? 'var(--color-accent)' : accuracy <= 500 ? 'var(--color-warning)' : 'var(--color-danger)' },
        }, formatAccuracy(accuracy))
      ),
      React.createElement('div', { className: 'gps-panel__row' },
        React.createElement('span', { className: 'gps-panel__label' }, '速度'),
        React.createElement('span', { className: 'gps-panel__value' }, formatSpeed(speed))
      ),
      React.createElement('div', { className: 'gps-panel__row' },
        React.createElement('span', { className: 'gps-panel__label' }, '方角'),
        React.createElement('span', { className: 'gps-panel__value' }, formatHeading(heading))
      )
    )
  );
};

})();
