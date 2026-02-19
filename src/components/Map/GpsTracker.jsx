// GpsTracker.jsx - GPS追跡パネル
window.GpsTracker = () => {
  const { currentPosition, isTracking, gpsError, accuracy, speed, heading } = useMapContext();
  const geo = useGeolocation();

  const formatCoord = (val) => val ? val.toFixed(6) : '---';
  const formatAccuracy = (val) => val ? `${Math.round(val)}m` : '---';
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
        React.createElement('span', { className: 'gps-panel__value' }, formatAccuracy(accuracy))
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
