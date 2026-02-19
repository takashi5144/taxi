// TransitInfo.jsx - 公共交通機関情報ページ
// Google Maps TransitLayer を使用して交通機関情報を表示
window.TransitInfoPage = () => {
  const { useState, useEffect, useRef, useCallback } = React;
  const { apiKey } = useAppContext();

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const transitLayerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // 現在地取得
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
    );
  }, []);

  // Google Maps 初期化
  useEffect(() => {
    if (!apiKey || !window.google || !window.google.maps) return;
    if (mapInstanceRef.current) return;

    const center = userLocation || APP_CONSTANTS.DEFAULT_MAP_CENTER;
    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
        { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
        { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
      ],
    });
    mapInstanceRef.current = map;

    // TransitLayer を有効化
    const transitLayer = new google.maps.TransitLayer();
    transitLayer.setMap(map);
    transitLayerRef.current = transitLayer;
    setMapReady(true);
  }, [apiKey, userLocation]);

  // ユーザー位置にパン
  useEffect(() => {
    if (mapInstanceRef.current && userLocation) {
      mapInstanceRef.current.panTo(userLocation);
    }
  }, [userLocation]);

  // 交通機関リンクカード
  const transitLinks = [
    { label: 'Google Maps 経路検索', icon: 'directions', color: '#1a73e8', url: 'https://www.google.com/maps/dir/?api=1&travelmode=transit' },
    { label: 'Yahoo! 乗換案内', icon: 'train', color: '#ff0033', url: 'https://transit.yahoo.co.jp/' },
    { label: 'NAVITIME', icon: 'route', color: '#00a968', url: 'https://www.navitime.co.jp/' },
    { label: 'JR東日本 運行情報', icon: 'info', color: '#008000', url: 'https://traininfo.jreast.co.jp/train_info/kanto.aspx' },
  ];

  const cardStyle = {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '14px 16px', borderRadius: '10px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer', transition: 'all 0.2s ease', textDecoration: 'none',
    color: 'inherit',
  };

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'directions_transit'),
      '公共交通機関情報'
    ),

    // 地図セクション
    apiKey ? React.createElement(Card, { title: '交通路線マップ（TransitLayer）', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('div', {
        ref: mapRef,
        style: {
          width: '100%', height: '400px', borderRadius: '8px',
          background: '#242f3e', position: 'relative',
        },
      }),
      React.createElement('div', {
        style: { marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'info'),
        '鉄道・バス・地下鉄などの路線が表示されます。ピンチ操作で拡大縮小できます。'
      )
    ) : React.createElement(Card, { style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('div', {
        style: {
          textAlign: 'center', padding: 'var(--space-xl)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '48px', color: 'var(--color-warning)', opacity: 0.7 },
        }, 'map'),
        React.createElement('div', { style: { fontWeight: 600, fontSize: 'var(--font-size-lg)' } }, 'デモモード'),
        React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 } },
          'Google Maps APIキーを設定すると、交通路線レイヤー付きの地図が表示されます。'
        ),
        React.createElement(Button, {
          variant: 'primary',
          icon: 'settings',
          onClick: () => document.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' })),
        }, '設定ページでAPIキーを設定')
      )
    ),

    // 交通機関リンク
    React.createElement(Card, { title: '交通情報リンク', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('div', { style: { display: 'grid', gap: '10px' } },
        transitLinks.map(link =>
          React.createElement('a', {
            key: link.label,
            href: link.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: cardStyle,
            onMouseEnter: (e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; },
            onMouseLeave: (e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; },
          },
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '24px', color: link.color },
            }, link.icon),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, link.label)
            ),
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '18px', color: 'var(--text-muted)' },
            }, 'open_in_new')
          )
        )
      )
    ),

    // 活用ヒント
    React.createElement(Card, { style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: 'var(--color-secondary)' } }, 'lightbulb'),
        React.createElement('span', { style: { fontWeight: 600 } }, 'タクシー営業での活用ヒント')
      ),
      React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.8 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)', marginTop: '3px', flexShrink: 0 } }, 'check_circle'),
          '終電後のターミナル駅周辺は乗車需要が高まります'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)', marginTop: '3px', flexShrink: 0 } }, 'check_circle'),
          '鉄道の運休・遅延時はバスターミナルや駅前ロータリーが狙い目です'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)', marginTop: '3px', flexShrink: 0 } }, 'check_circle'),
          '主要路線の始発・終電時刻を把握しておくと効率的に営業できます'
        )
      )
    )
  );
};
