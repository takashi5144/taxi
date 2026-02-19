// GoogleMap.jsx - Google Maps 本体コンポーネント（TrafficLayer対応・高速ロード版）
const { useState, useEffect, useRef, useCallback } = React;

// ============================================================
// Google Maps スクリプトローダー（シングルトン）
// ============================================================
const _gmapLoader = {
  status: 'idle',   // idle | loading | loaded | error
  loadedKey: null,   // 読み込み済みのAPIキー
  callbacks: [],

  reset() {
    this.status = 'idle';
    this.loadedKey = null;
    this.callbacks = [];
    const s = document.querySelector('script[src*="maps.googleapis.com"]');
    if (s) s.remove();
    if (window.google) {
      try { delete window.google; } catch (e) { window.google = undefined; }
    }
  },

  load(apiKey) {
    return new Promise((resolve, reject) => {
      // キーが変わった場合はリセットして再読み込み
      if (this.loadedKey && this.loadedKey !== apiKey) {
        this.reset();
      }

      // 同じキーで読み込み済み
      if (window.google && window.google.maps && this.status === 'loaded' && this.loadedKey === apiKey) {
        resolve();
        return;
      }

      this.callbacks.push({ resolve, reject });
      if (this.status === 'loading') return;

      // 前回エラーの場合はスクリプトを除去して再試行
      if (this.status === 'error') {
        const s = document.querySelector('script[src*="maps.googleapis.com"]');
        if (s) s.remove();
        if (window.google) {
          try { delete window.google; } catch (e) { window.google = undefined; }
        }
      }

      this.status = 'loading';
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&language=ja&region=JP&v=weekly`;
      script.async = true;
      script.onload = () => {
        this.status = 'loaded';
        this.loadedKey = apiKey;
        this.callbacks.forEach(cb => cb.resolve());
        this.callbacks = [];
      };
      script.onerror = () => {
        this.status = 'error';
        this.loadedKey = null;
        script.remove();
        this.callbacks.forEach(cb => cb.reject(new Error('SCRIPT_LOAD_ERROR')));
        this.callbacks = [];
      };
      document.head.appendChild(script);
    });
  }
};

// Google Maps API 認証エラーハンドラ（APIキー無効・Billing未設定時に発火）
window.gm_authFailure = () => {
  _gmapLoader.status = 'error';
  _gmapLoader.loadedKey = null;
  if (typeof AppLogger !== 'undefined') {
    AppLogger.error('Google Maps API 認証失敗: APIキー・Billing・API有効化を確認してください');
  }
  window.dispatchEvent(new Event('gmaps_auth_error'));
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

  // Google Maps API 認証エラーを検知
  useEffect(() => {
    const handler = () => {
      setMapError('Google Maps API の認証に失敗しました。以下を確認してください：\n• APIキーが正しいか\n• Maps JavaScript API が有効か\n• Billing（課金）が設定されているか');
      setMapLoaded(false);
    };
    window.addEventListener('gmaps_auth_error', handler);
    return () => window.removeEventListener('gmaps_auth_error', handler);
  }, []);

  // Google Maps API をロード
  useEffect(() => {
    if (!apiKey) {
      setMapError(null);
      setMapLoaded(false);
      return;
    }

    // APIキー変更時にマップ状態をリセット
    initDone.current = false;
    mapInstanceRef.current = null;
    markerRef.current = null;
    accuracyCircleRef.current = null;
    trafficLayerRef.current = null;
    firstGpsDone.current = false;
    setMapLoaded(false);
    setMapError(null);

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
          setMapError('Google Maps API の読み込みに失敗しました。\nAPIキーとネットワーク接続を確認してください。');
          AppLogger.error('Google Maps API ロード失敗');
        }
      });
    return () => { cancelled = true; };
  }, [apiKey]);

  // マップ初期化
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google || !window.google.maps || initDone.current) return;
    initDone.current = true;

    try {
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
    } catch (e) {
      setMapError('Google Maps の初期化に失敗しました: ' + e.message);
      AppLogger.error('Google Maps 初期化エラー: ' + e.message);
    }
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
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', padding: '24px' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--color-danger)' } }, 'error'),
      React.createElement('p', { style: { color: 'var(--color-danger)', textAlign: 'center', whiteSpace: 'pre-line', fontSize: 'var(--font-size-sm)' } }, mapError),
      React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
        React.createElement(Button, {
          variant: 'primary', icon: 'refresh',
          onClick: () => { _gmapLoader.reset(); setMapError(null); setMapLoaded(false); },
        }, '再試行'),
        React.createElement(Button, {
          variant: 'secondary', icon: 'settings',
          onClick: () => document.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' })),
        }, '設定を確認')
      )
    );
  }

  // ============================================================
  // メイン地図表示
  // ============================================================
  return React.createElement('div', null,
    // 地図コンテナ
    React.createElement('div', {
      ref: mapRef,
      className: `map-container ${fullscreen ? 'map-container--fullscreen' : ''}`,
      style: { minHeight: '450px' },
    },
      !mapLoaded && React.createElement(Loading, { message: '地図を読み込み中...' })
    ),

    // マップ操作パネル（マップの外・下に表示）
    mapLoaded && React.createElement('div', {
      style: {
        marginTop: 'var(--space-md)',
        background: 'rgba(26, 26, 46, 0.95)',
        borderRadius: 'var(--border-radius-sm)',
        padding: 'var(--space-md)',
        border: '1px solid rgba(255,255,255,0.1)',
      },
    },
      // ボタン行
      React.createElement('div', {
        style: {
          display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
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
            background: showTraffic ? '#ef4444' : 'rgba(255,255,255,0.08)',
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
            background: 'rgba(255,255,255,0.08)',
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
            background: 'rgba(255,255,255,0.08)',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'open_in_new'),
          'Google Mapsで開く'
        )
      ),

      // 渋滞凡例
      showTraffic && React.createElement('div', {
        style: {
          marginTop: '10px', paddingTop: '10px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
        },
      },
        React.createElement('span', {
          style: { fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' },
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
            React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-secondary)' } }, item.l)
          )
        )
      )
    )
  );
};
