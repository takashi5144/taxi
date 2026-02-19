// GoogleMap.jsx - Google Maps 本体コンポーネント（TrafficLayer対応・高速ロード版）
const { useState, useEffect, useRef, useCallback } = React;

// ============================================================
// Google Maps スクリプトローダー（シングルトン）
// ============================================================
const _gmapLoader = {
  status: 'idle',
  callbacks: [],
  load(apiKey) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        this.status = 'loaded';
        resolve();
        return;
      }
      if (this.status === 'loaded') { resolve(); return; }
      this.callbacks.push({ resolve, reject });
      if (this.status === 'loading') return;
      this.status = 'loading';
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&language=ja&region=JP`;
      script.async = true;
      script.onload = () => {
        this.status = 'loaded';
        this.callbacks.forEach(cb => cb.resolve());
        this.callbacks = [];
      };
      script.onerror = (err) => {
        this.status = 'error';
        this.callbacks.forEach(cb => cb.reject(err));
        this.callbacks = [];
      };
      document.head.appendChild(script);
    });
  }
};

// ============================================================
// メインコンポーネント
// ============================================================
window.GoogleMapView = ({ fullscreen = false }) => {
  const { apiKey } = useAppContext();
  const { mapCenter, zoom, currentPosition, accuracy, setMapCenter, setZoom } = useMapContext();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [showTraffic, setShowTraffic] = useState(true);
  const initDone = useRef(false);
  const firstGpsDone = useRef(false);

  // Google Maps API をロード
  useEffect(() => {
    if (!apiKey) {
      setMapError(null);
      setMapLoaded(false);
      return;
    }
    if (window.google && window.google.maps) {
      setMapLoaded(true);
      return;
    }
    let cancelled = false;
    _gmapLoader.load(apiKey)
      .then(() => {
        if (!cancelled) {
          setMapLoaded(true);
          setMapError(null);
          AppLogger.info('Google Maps API ロード完了');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMapError('Google Maps API の読み込みに失敗しました。APIキーを確認してください。');
          AppLogger.error('Google Maps API ロード失敗');
        }
      });
    return () => { cancelled = true; };
  }, [apiKey]);

  // マップ初期化
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google || initDone.current) return;
    initDone.current = true;

    // GPS位置があればそこを初期中心に、なければデフォルト
    const initCenter = currentPosition || mapCenter;
    const initZoom = currentPosition ? 15 : zoom;

    const map = new google.maps.Map(mapRef.current, {
      center: initCenter,
      zoom: initZoom,
      mapTypeId: 'roadmap',
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
        position: google.maps.ControlPosition.TOP_LEFT,
      },
      streetViewControl: false,
      fullscreenControl: false,
      scaleControl: true,
      gestureHandling: 'greedy',
      // 標準スタイル（詳細がしっかり見える）
    });
    mapInstanceRef.current = map;

    // 交通情報レイヤーを即座に追加
    const trafficLayer = new google.maps.TrafficLayer();
    trafficLayer.setMap(map);
    trafficLayerRef.current = trafficLayer;

    // GPS位置があれば初回マーカーも配置
    if (currentPosition) {
      firstGpsDone.current = true;
      _placeMarker(map, currentPosition);
    }

    // イベントリスナー（スロットリング付き）
    let centerTimer = null;
    map.addListener('center_changed', () => {
      clearTimeout(centerTimer);
      centerTimer = setTimeout(() => {
        const c = map.getCenter();
        setMapCenter({ lat: c.lat(), lng: c.lng() });
      }, 300);
    });
    map.addListener('zoom_changed', () => {
      setZoom(map.getZoom());
    });

    AppLogger.info('Google Maps 初期化完了（TrafficLayer有効）');
  }, [mapLoaded]);

  // マーカー配置用のヘルパー
  function _placeMarker(map, pos) {
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        position: pos,
        map: map,
        title: '現在地',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        zIndex: 999,
      });
      accuracyCircleRef.current = new google.maps.Circle({
        map: map,
        center: pos,
        radius: accuracy || 50,
        fillColor: '#4285F4',
        fillOpacity: 0.08,
        strokeColor: '#4285F4',
        strokeOpacity: 0.25,
        strokeWeight: 1,
        clickable: false,
      });
    }
  }

  // 交通レイヤーの表示/非表示
  useEffect(() => {
    if (!trafficLayerRef.current || !mapInstanceRef.current) return;
    trafficLayerRef.current.setMap(showTraffic ? mapInstanceRef.current : null);
  }, [showTraffic]);

  // 現在位置マーカー更新
  useEffect(() => {
    if (!mapInstanceRef.current || !currentPosition || !window.google) return;
    const map = mapInstanceRef.current;

    if (!markerRef.current) {
      _placeMarker(map, currentPosition);
    } else {
      markerRef.current.setPosition(currentPosition);
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setCenter(currentPosition);
        if (accuracy) accuracyCircleRef.current.setRadius(accuracy);
      }
    }

    // 初回GPS取得時: 中心を移動しズームを15に設定（詳細表示）
    if (!firstGpsDone.current) {
      firstGpsDone.current = true;
      map.setCenter(currentPosition);
      map.setZoom(15);
      AppLogger.info(`初回GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)} → zoom 15`);
    } else {
      // 2回目以降はスムーズにパン
      map.panTo(currentPosition);
    }
  }, [currentPosition]);

  // ============================================================
  // APIキーなしのデモモード
  // ============================================================
  if (!apiKey) {
    return React.createElement('div', {
      className: `map-container ${fullscreen ? 'map-container--fullscreen' : ''}`,
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--bg-medium), var(--bg-light))',
      },
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '64px', color: 'var(--color-secondary)', marginBottom: '16px' },
      }, 'map'),
      React.createElement('h3', {
        style: { marginBottom: '8px', color: 'var(--text-primary)' },
      }, 'Google Maps デモモード'),
      React.createElement('p', {
        style: { color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '400px', fontSize: 'var(--font-size-sm)' },
      }, '設定画面からGoogle Maps APIキーを入力すると、実際の地図と交通渋滞情報が表示されます。'),
      React.createElement('div', {
        style: {
          marginTop: '16px', padding: '12px 20px',
          background: 'rgba(255,255,255,0.06)', borderRadius: '8px',
          fontFamily: 'monospace', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)',
        },
      },
        React.createElement('div', null, `中心: ${mapCenter.lat.toFixed(4)}, ${mapCenter.lng.toFixed(4)}`),
        React.createElement('div', null, `ズーム: ${zoom}`),
        currentPosition && React.createElement('div', {
          style: { color: 'var(--color-accent)', marginTop: '4px' },
        }, `GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)}`)
      ),
      React.createElement(Button, {
        variant: 'primary', icon: 'settings',
        onClick: () => document.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' })),
        style: { marginTop: '16px' },
      }, '設定を開く')
    );
  }

  // ============================================================
  // エラー画面
  // ============================================================
  if (mapError) {
    return React.createElement('div', {
      className: `map-container ${fullscreen ? 'map-container--fullscreen' : ''}`,
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--color-danger)' } }, 'error'),
      React.createElement('p', { style: { color: 'var(--color-danger)' } }, mapError)
    );
  }

  // ============================================================
  // メイン地図表示
  // ============================================================
  return React.createElement('div', {
    style: { position: 'relative' },
  },
    // 地図コンテナ
    React.createElement('div', {
      ref: mapRef,
      className: `map-container ${fullscreen ? 'map-container--fullscreen' : ''}`,
      style: { minHeight: '450px' },
    },
      !mapLoaded && React.createElement(Loading, { message: '地図を読み込み中...' })
    ),

    // コントロールオーバーレイ（右上）
    mapLoaded && React.createElement('div', {
      style: {
        position: 'absolute', top: '12px', right: '12px',
        display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 5,
      },
    },
      // 渋滞情報トグルボタン
      React.createElement('button', {
        onClick: () => setShowTraffic(prev => !prev),
        style: {
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px',
          fontSize: '12px', fontWeight: '700',
          color: '#fff', cursor: 'pointer',
          border: showTraffic ? 'none' : '1px solid rgba(255,255,255,0.2)',
          background: showTraffic ? '#ef4444' : 'rgba(26,26,46,0.85)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.2s ease',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'traffic'),
        `渋滞情報 ${showTraffic ? 'ON' : 'OFF'}`
      ),

      // 現在地に移動ボタン
      currentPosition && React.createElement('button', {
        onClick: () => {
          if (mapInstanceRef.current && currentPosition) {
            mapInstanceRef.current.setCenter(currentPosition);
            mapInstanceRef.current.setZoom(15);
          }
        },
        style: {
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px',
          fontSize: '12px', fontWeight: '700',
          color: '#fff', cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(26,26,46,0.85)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.2s ease',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'my_location'),
        '現在地'
      ),

      // Google Mapsで開く
      React.createElement('a', {
        href: `https://www.google.com/maps/@${mapCenter.lat},${mapCenter.lng},${zoom}z/data=!5m1!1e1`,
        target: '_blank', rel: 'noreferrer',
        style: {
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px',
          fontSize: '12px', fontWeight: '700', textDecoration: 'none',
          color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(26,26,46,0.85)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'open_in_new'),
        'Google Mapsで開く'
      )
    ),

    // 渋滞凡例（左下）
    mapLoaded && showTraffic && React.createElement('div', {
      style: {
        position: 'absolute', bottom: '12px', left: '12px',
        background: 'rgba(255,255,255,0.92)', borderRadius: '8px',
        padding: '6px 10px', display: 'flex', gap: '8px',
        alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', zIndex: 5,
      },
    },
      React.createElement('span', {
        style: { fontSize: '11px', fontWeight: '600', color: '#333' },
      }, '渋滞:'),
      ...[
        { c: '#22c55e', l: 'スムーズ' },
        { c: '#f59e0b', l: 'やや混雑' },
        { c: '#f97316', l: '混雑' },
        { c: '#ef4444', l: '渋滞' },
        { c: '#7f1d1d', l: '大渋滞' },
      ].map(item =>
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
    )
  );
};
