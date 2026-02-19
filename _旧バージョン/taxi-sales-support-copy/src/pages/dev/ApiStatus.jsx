// ApiStatus.jsx - API接続ステータスページ
window.ApiStatusPage = () => {
  const { useState, useEffect } = React;
  const { apiKey } = useAppContext();
  const { isTracking, currentPosition } = useMapContext();

  const [checks, setChecks] = useState([]);

  useEffect(() => {
    const results = [
      {
        name: 'Google Maps JavaScript API',
        status: apiKey ? (window.google && window.google.maps ? 'connected' : 'error') : 'not_configured',
        detail: apiKey
          ? (window.google && window.google.maps ? '正常に読み込まれています' : 'APIの読み込みに失敗しました')
          : 'APIキーが設定されていません（設定画面で入力してください）',
        icon: 'map',
      },
      {
        name: 'Geolocation API (GPS)',
        status: 'geolocation' in navigator ? 'connected' : 'error',
        detail: 'geolocation' in navigator
          ? (isTracking ? `追跡中 (${currentPosition ? `${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)}` : '取得中...'})` : '利用可能（追跡停止中）')
          : 'このブラウザはGeolocation APIに対応していません',
        icon: 'gps_fixed',
      },
      {
        name: 'localStorage',
        status: (() => { try { localStorage.setItem('_test', '1'); localStorage.removeItem('_test'); return 'connected'; } catch { return 'error'; } })(),
        detail: (() => { try { localStorage.setItem('_test', '1'); localStorage.removeItem('_test'); return '正常に動作しています'; } catch { return 'localStorageが利用できません'; } })(),
        icon: 'storage',
      },
      {
        name: 'Service Worker (PWA)',
        status: 'serviceWorker' in navigator ? 'available' : 'not_available',
        detail: 'serviceWorker' in navigator ? '利用可能（未登録）' : 'このブラウザはService Workerに対応していません',
        icon: 'install_mobile',
      },
      {
        name: 'HTTPS',
        status: location.protocol === 'https:' ? 'connected' : 'warning',
        detail: location.protocol === 'https:'
          ? 'HTTPS接続です'
          : `HTTP接続です（${location.protocol}）。GPSやPWAにはHTTPSが必要な場合があります`,
        icon: 'lock',
      },
    ];

    setChecks(results);
  }, [apiKey, isTracking, currentPosition]);

  const statusIcon = (status) => {
    switch (status) {
      case 'connected': return { icon: 'check_circle', color: 'var(--color-accent)' };
      case 'error': return { icon: 'error', color: 'var(--color-danger)' };
      case 'warning': return { icon: 'warning', color: 'var(--color-warning)' };
      case 'not_configured': return { icon: 'settings', color: 'var(--color-warning)' };
      default: return { icon: 'help', color: 'var(--text-muted)' };
    }
  };

  const statusBadge = (status) => {
    switch (status) {
      case 'connected': return 'badge--success';
      case 'error': return 'badge--error';
      case 'warning': return 'badge--warning';
      case 'not_configured': return 'badge--warning';
      default: return 'badge--info';
    }
  };

  const statusLabel = (status) => {
    switch (status) {
      case 'connected': return '接続済み';
      case 'error': return 'エラー';
      case 'warning': return '警告';
      case 'not_configured': return '未設定';
      case 'available': return '利用可能';
      default: return '不明';
    }
  };

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'cloud'),
      'API接続状態'
    ),

    // ステータス一覧
    React.createElement('div', { style: { display: 'grid', gap: 'var(--space-md)' } },
      checks.map((check, i) => {
        const si = statusIcon(check.status);
        return React.createElement(Card, { key: i },
          React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '16px' } },
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '32px', color: si.color },
            }, check.icon),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
                React.createElement('span', { style: { fontWeight: 500 } }, check.name),
                React.createElement('span', { className: `badge ${statusBadge(check.status)}` },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, si.icon),
                  statusLabel(check.status)
                )
              ),
              React.createElement('div', {
                style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' },
              }, check.detail)
            )
          )
        );
      })
    ),

    // ブラウザ情報
    React.createElement(Card, {
      title: 'ブラウザ環境',
      style: { marginTop: 'var(--space-lg)' },
    },
      React.createElement('div', { style: { display: 'grid', gap: '8px', fontSize: 'var(--font-size-sm)' } },
        [
          ['ユーザーエージェント', navigator.userAgent.substring(0, 80) + '...'],
          ['プラットフォーム', navigator.platform || 'N/A'],
          ['言語', navigator.language],
          ['オンライン', navigator.onLine ? 'はい' : 'いいえ'],
          ['画面サイズ', `${window.innerWidth} x ${window.innerHeight}`],
          ['デバイスピクセル比', window.devicePixelRatio],
          ['React バージョン', React.version],
        ].map(([label, value], i) =>
          React.createElement('div', {
            key: i,
            style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
          },
            React.createElement('span', { style: { color: 'var(--text-muted)' } }, label),
            React.createElement('span', { style: { fontFamily: 'monospace', textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis' } }, String(value))
          )
        )
      )
    )
  );
};
