(function() {
// GoogleMap.jsx - Google Maps 本体コンポーネント（TrafficLayer対応・高速ロード版）
const { useState, useEffect, useRef, useCallback } = React;

// ============================================================
// Google Maps スクリプトローダー（シングルトン）
// ============================================================
window._gmapLoader = {
  status: 'idle',
  loadedKey: null,
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
      if (this.loadedKey && this.loadedKey !== apiKey) {
        this.reset();
      }
      if (window.google && window.google.maps && this.status === 'loaded' && this.loadedKey === apiKey) {
        resolve();
        return;
      }
      this.callbacks.push({ resolve, reject });
      if (this.status === 'loading') return;
      if (this.status === 'error') {
        const s = document.querySelector('script[src*="maps.googleapis.com"]');
        if (s) s.remove();
        if (window.google) {
          try { delete window.google; } catch (e) { window.google = undefined; }
        }
      }
      this.status = 'loading';
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&language=ja&region=JP&v=weekly&libraries=visualization,places`;
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

// Google Maps API エラー検出（console.errorからエラータイプを捕捉）
let _gmapErrorType = '';
const _origConsoleError = console.error;
console.error = function() {
  const msg = Array.from(arguments).join(' ');
  if (msg.includes('Google Maps JavaScript API error:')) {
    _gmapErrorType = msg.replace(/.*Google Maps JavaScript API error:\s*/, '').trim();
    if (typeof AppLogger !== 'undefined') {
      AppLogger.error('Google Maps APIエラー検出: ' + _gmapErrorType);
    }
  }
  _origConsoleError.apply(console, arguments);
};

window.gm_authFailure = () => {
  window._gmapLoader.status = 'error';
  window._gmapLoader.loadedKey = null;
  if (typeof AppLogger !== 'undefined') {
    AppLogger.error('Google Maps API 認証失敗 (gm_authFailure): エラータイプ=' + (_gmapErrorType || '不明'));
  }
  window.dispatchEvent(new CustomEvent('gmaps_auth_error', { detail: _gmapErrorType }));
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
  const heatmapLayerRef = useRef(null);
  const aiHeatmapLayerRef = useRef(null);
  const aiModelRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState('timeAware');
  const [heatmapStats, setHeatmapStats] = useState(null);
  const [showAiHeatmap, setShowAiHeatmap] = useState(false);
  const [aiTraining, setAiTraining] = useState(false);
  const [showPriceTier, setShowPriceTier] = useState(false);
  const [priceTierSource, setPriceTierSource] = useState('all');
  const priceTierMarkersRef = useRef([]);
  const [nearbyEstimate, setNearbyEstimate] = useState(null);
  const [showPricePredict, setShowPricePredict] = useState(false);
  const [priceTraining, setPriceTraining] = useState(false);
  const priceModelRef = useRef(null);
  const pricePredictMarkersRef = useRef([]);
  const [simHour, setSimHour] = useState(new Date().getHours());
  const [simMode, setSimMode] = useState(false);
  const initDone = useRef(false);
  const firstGpsDone = useRef(false);

  const [errorDetail, setErrorDetail] = useState(null);

  // Google Maps API 認証エラーを検知
  useEffect(() => {
    const handler = (e) => {
      const errorType = e.detail || _gmapErrorType || '';
      setErrorDetail(errorType);
      let msg = '';
      if (errorType.includes('ApiNotActivatedMapError')) {
        msg = '【Maps JavaScript API が無効です】\nGoogle Cloud Console → APIとサービス → ライブラリ\n→「Maps JavaScript API」を検索して「有効にする」を押してください。';
      } else if (errorType.includes('InvalidKeyMapError')) {
        msg = '【APIキーが無効です】\n設定画面でAPIキーが正しくコピーされているか確認してください。';
      } else if (errorType.includes('MissingKeyMapError')) {
        msg = '【APIキーがありません】\n設定画面からGoogle Maps APIキーを入力してください。';
      } else if (errorType.includes('RefererNotAllowedMapError')) {
        msg = '【HTTPリファラー制限エラー】\nGoogle Cloud Console → 認証情報 → APIキー → アプリケーションの制限\n→ リファラーに以下を追加してください:\n' + window.location.origin + '/*';
      } else if (errorType.includes('BillingNotEnabledMapError') || errorType.includes('OverQueryLimitMapError')) {
        msg = '【課金が有効になっていません】\nGoogle Cloud Console → お支払い → 請求先アカウントを設定してください。\n（月$200の無料枠あり）';
      } else if (errorType.includes('ExpiredKeyMapError')) {
        msg = '【APIキーの有効期限切れ】\nGoogle Cloud Console で新しいAPIキーを作成してください。';
      } else {
        msg = 'Google Maps API の認証に失敗しました。\n\n確認事項:\n1. APIキーが正しいか\n2. Maps JavaScript API が有効か\n3. Billing（課金）が設定されているか\n4. APIキーの制限設定';
        if (errorType) msg += '\n\nエラータイプ: ' + errorType;
      }
      setMapError(msg);
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
    window._gmapLoader.load(apiKey)
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

  // 精度に応じた色を決定
  function _getAccuracyColor(acc) {
    if (!acc || acc <= 100) return '#4285F4';   // 青: 高精度
    if (acc <= 500) return '#F9A825';           // 黄: 中精度
    return '#E53935';                           // 赤: 低精度
  }

  // マーカー配置用のヘルパー
  function _placeMarker(map, pos) {
    const color = _getAccuracyColor(accuracy);
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        position: pos,
        map: map,
        title: '現在地',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
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
        fillColor: color,
        fillOpacity: accuracy && accuracy > 500 ? 0.12 : 0.08,
        strokeColor: color,
        strokeOpacity: 0.3,
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

  // ヒートマップレイヤーの表示/非表示（時間帯対応スマートヒートマップ + 空車GPS）
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !window.google.maps.visualization) return;
    const map = mapInstanceRef.current;
    let cancelled = false;
    let zoomListener = null;

    const calcRadius = () => {
      const z = map.getZoom() || 13;
      const metersPerPx = 156543.03 * Math.cos((map.getCenter().lat() || 43.77) * Math.PI / 180) / Math.pow(2, z);
      return Math.max(10, Math.round(350 / metersPerPx));
    };

    const renderLayer = (points, gradient, stats) => {
      if (cancelled) return;
      if (heatmapLayerRef.current) heatmapLayerRef.current.setMap(null);
      if (points.length === 0) return;
      const heatData = points.map(p => ({
        location: new google.maps.LatLng(p.lat, p.lng),
        weight: p.weight,
      }));
      heatmapLayerRef.current = new google.maps.visualization.HeatmapLayer({
        data: heatData, map, radius: calcRadius(), opacity: 0.85, dissipating: true, maxIntensity: 8, gradient,
      });
      zoomListener = map.addListener('zoom_changed', () => {
        if (heatmapLayerRef.current) heatmapLayerRef.current.setOptions({ radius: calcRadius() });
      });
      if (stats) setHeatmapStats(stats);
    };

    if (showHeatmap) {
      // 空車GPSヒートマップモード（非同期）
      if (heatmapMode === 'gpsVacant') {
        if (!window.GpsLogService) return;
        const vacantGradient = [
          'rgba(0,0,0,0)', 'rgba(255,152,0,0.15)', 'rgba(255,183,77,0.3)', 'rgba(255,167,38,0.5)',
          'rgba(255,143,0,0.65)', 'rgba(255,111,0,0.78)', 'rgba(244,81,30,0.88)', 'rgba(230,50,20,0.95)', 'rgba(183,28,28,1)',
        ];
        GpsLogService.getLogDates().then(async dates => {
          if (cancelled) return;
          const target = dates.slice(0, 30); // 直近30日
          const points = await GpsLogService.getVacantHeatmapData(target);
          const totalPts = points.reduce((s, p) => s + p.weight, 0);
          renderLayer(points, vacantGradient, { totalRides: totalPts, timeFiltered: points.length, mode: 'gpsVacant' });
        });
      } else {
        // 既存の同期モード
        const result = DataService.getSmartHeatmapData(heatmapMode);
        const points = result.points;
        setHeatmapStats(result.stats);

        const gradients = {
          timeAware: [
            'rgba(0,0,0,0)', 'rgba(30,100,230,0.15)', 'rgba(30,160,255,0.35)', 'rgba(0,200,150,0.5)',
            'rgba(140,230,60,0.65)', 'rgba(255,220,30,0.78)', 'rgba(255,150,0,0.88)', 'rgba(240,60,40,0.95)', 'rgba(180,20,20,1)',
          ],
          all: [
            'rgba(0,0,0,0)', 'rgba(0,100,255,0.15)', 'rgba(0,180,255,0.4)', 'rgba(0,210,120,0.55)',
            'rgba(180,230,50,0.7)', 'rgba(255,220,30,0.8)', 'rgba(255,160,0,0.88)', 'rgba(255,80,20,0.94)', 'rgba(220,30,30,1)',
          ],
          transit: [
            'rgba(0,0,0,0)', 'rgba(200,50,150,0.12)', 'rgba(236,72,153,0.3)', 'rgba(255,100,180,0.5)',
            'rgba(255,140,200,0.65)', 'rgba(255,180,220,0.78)', 'rgba(255,100,150,0.88)', 'rgba(220,40,100,0.95)', 'rgba(180,20,60,1)',
          ],
          combined: [
            'rgba(0,0,0,0)', 'rgba(80,40,180,0.12)', 'rgba(124,58,237,0.3)', 'rgba(140,80,255,0.5)',
            'rgba(180,120,255,0.65)', 'rgba(220,180,255,0.75)', 'rgba(255,150,100,0.85)', 'rgba(255,80,40,0.93)', 'rgba(200,30,30,1)',
          ],
        };
        const gradient = gradients[heatmapMode] || gradients.all;

        if (points.length === 0) {
          const fallback = DataService.getHeatmapData();
          if (fallback.length > 0) renderLayer(fallback, gradient);
        } else {
          renderLayer(points, gradient);
        }
      }
    } else {
      if (heatmapLayerRef.current) { heatmapLayerRef.current.setMap(null); heatmapLayerRef.current = null; }
      setHeatmapStats(null);
    }

    return () => {
      cancelled = true;
      if (zoomListener) google.maps.event.removeListener(zoomListener);
      if (heatmapLayerRef.current) { heatmapLayerRef.current.setMap(null); heatmapLayerRef.current = null; }
    };
  }, [showHeatmap, heatmapMode]);

  // AI予測ヒートマップの表示/非表示
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !window.google.maps.visualization) return;
    const map = mapInstanceRef.current;

    if (!showAiHeatmap) {
      if (aiHeatmapLayerRef.current) {
        aiHeatmapLayerRef.current.setMap(null);
        aiHeatmapLayerRef.current = null;
      }
      return;
    }

    setAiTraining(true);
    // 非同期で学習・予測（UIブロック回避）
    setTimeout(() => {
      try {
        // モデルをキャッシュ、データ変更時はnullリセット
        if (!aiModelRef.current) {
          aiModelRef.current = LightGBMService.trainModel();
        }

        if (!aiModelRef.current) {
          setAiTraining(false);
          AppLogger.warn('AI予測: GPS付きデータが不足しています（5件以上必要）');
          setShowAiHeatmap(false);
          return;
        }

        // 現在の条件を取得（シミュレーションモード対応）
        const now = new Date();
        const hour = simMode ? simHour : now.getHours();
        const dow = now.getDay();
        const entries = DataService.getEntries();
        const latestWeather = entries.length > 0 ? (entries[0].weather || '') : '';

        // マップの表示範囲を取得
        const bounds = map.getBounds();
        if (!bounds) { setAiTraining(false); return; }
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const mapBounds = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };

        const points = LightGBMService.predictGrid(aiModelRef.current, mapBounds, hour, dow, latestWeather);

        if (aiHeatmapLayerRef.current) {
          aiHeatmapLayerRef.current.setMap(null);
        }

        if (points.length > 0) {
          const heatData = points.map(p => ({
            location: new google.maps.LatLng(p.lat, p.lng),
            weight: p.weight,
          }));
          aiHeatmapLayerRef.current = new google.maps.visualization.HeatmapLayer({
            data: heatData,
            map: map,
            radius: 25,
            opacity: 0.6,
            gradient: [
              'rgba(0, 0, 0, 0)',
              'rgba(66, 133, 244, 0.3)',
              'rgba(0, 200, 255, 0.5)',
              'rgba(0, 230, 118, 0.6)',
              'rgba(255, 235, 59, 0.7)',
              'rgba(255, 152, 0, 0.85)',
              'rgba(244, 67, 54, 1)',
            ],
          });
          const info = LightGBMService.getModelInfo(aiModelRef.current);
          AppLogger.info(`AI需要予測: ${points.length}グリッド表示, ${info.nTrees}本の木, 基準値¥${info.basePrediction}`);
        } else {
          AppLogger.info('AI需要予測: 現在の条件では需要予測なし');
        }
      } catch (e) {
        AppLogger.error('AI予測エラー: ' + e.message);
      }
      setAiTraining(false);
    }, 50);

    return () => {
      if (aiHeatmapLayerRef.current) {
        aiHeatmapLayerRef.current.setMap(null);
        aiHeatmapLayerRef.current = null;
      }
    };
  }, [showAiHeatmap, simHour, simMode]);

  // 単価ランクマーカーレイヤーの表示/非表示
  useEffect(() => {
    // 既存マーカーをクリア
    priceTierMarkersRef.current.forEach(m => m.setMap(null));
    priceTierMarkersRef.current = [];
    setNearbyEstimate(null);

    if (!showPriceTier || !mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;
    const src = priceTierSource === 'all' ? null : priceTierSource;
    const points = DataService.getPriceTierHeatmapData(src);

    if (points.length === 0) return;

    const tierColors = { short: '#4CAF50', mid: '#FFC107', long: '#F44336' };
    const tierLabels = { short: '短', mid: '中', long: '長' };

    points.forEach(p => {
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: tierColors[p.tier],
          fillOpacity: 0.7,
          strokeColor: '#fff',
          strokeWeight: 1,
          scale: p.tier === 'long' ? 10 : p.tier === 'mid' ? 8 : 6,
        },
        title: `¥${p.amount.toLocaleString()} (${p.source}) ${p.area}`,
        zIndex: p.tier === 'long' ? 3 : p.tier === 'mid' ? 2 : 1,
      });
      priceTierMarkersRef.current.push(marker);
    });

    // 現在位置の周辺推定
    const pos = currentPosition || mapCenter;
    if (pos && pos.lat && pos.lng) {
      setNearbyEstimate(DataService.getNearbyEstimate(pos.lat, pos.lng, 2));
    }

    return () => {
      priceTierMarkersRef.current.forEach(m => m.setMap(null));
      priceTierMarkersRef.current = [];
    };
  }, [showPriceTier, priceTierSource]);

  // AI単価予測レイヤーの表示/非表示
  useEffect(() => {
    pricePredictMarkersRef.current.forEach(m => m.setMap(null));
    pricePredictMarkersRef.current = [];

    if (!showPricePredict || !mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;

    setPriceTraining(true);
    setTimeout(() => {
      try {
        if (!priceModelRef.current) {
          priceModelRef.current = LightGBMService.trainPriceModel();
        }
        if (!priceModelRef.current) {
          setPriceTraining(false);
          AppLogger.warn('単価予測: GPS+金額付きデータが不足しています（5件以上必要）');
          setShowPricePredict(false);
          return;
        }

        const bounds = map.getBounds();
        if (!bounds) { setPriceTraining(false); return; }
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const mapBounds = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };

        const hour = simMode ? simHour : new Date().getHours();
        const dow = new Date().getDay();
        const entries = DataService.getEntries();
        const weather = entries.length > 0 ? (entries[0].weather || '') : '';

        const points = LightGBMService.predictPriceGrid(priceModelRef.current, mapBounds, hour, dow, weather);

        const tierColors = { short: '#4CAF50', mid: '#FFC107', long: '#F44336' };

        points.forEach(p => {
          const marker = new google.maps.Marker({
            position: { lat: p.lat, lng: p.lng },
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: tierColors[p.tier],
              fillOpacity: 0.45,
              strokeColor: tierColors[p.tier],
              strokeWeight: 0.5,
              scale: p.tier === 'long' ? 14 : p.tier === 'mid' ? 11 : 8,
            },
            title: '予測単価: ¥' + p.price.toLocaleString(),
            clickable: false,
            zIndex: p.tier === 'long' ? 3 : p.tier === 'mid' ? 2 : 1,
          });
          pricePredictMarkersRef.current.push(marker);
        });

        const info = LightGBMService.getModelInfo(priceModelRef.current);
        AppLogger.info('AI単価予測: ' + points.length + 'グリッド表示, ' + info.nTrees + '本の木');
      } catch (e) {
        AppLogger.error('単価予測エラー: ' + e.message);
      }
      setPriceTraining(false);
    }, 50);

    return () => {
      pricePredictMarkersRef.current.forEach(m => m.setMap(null));
      pricePredictMarkersRef.current = [];
    };
  }, [showPricePredict, simHour, simMode]);

  // データ変更時にアクティブなレイヤーを自動更新
  useEffect(() => {
    const handler = () => {
      if (!mapInstanceRef.current || !window.google) return;
      const map = mapInstanceRef.current;

      // ヒートマップ再描画（スマートヒートマップ対応）
      if (showHeatmap && window.google.maps.visualization) {
        if (heatmapMode === 'gpsVacant') {
          // 空車GPSモードはデータ変更時に自動リフレッシュしない（非同期のため）
        } else {
          const result = DataService.getSmartHeatmapData(heatmapMode);
          setHeatmapStats(result.stats);
          const points = result.points;
          if (points.length > 0) {
            const heatData = points.map(p => ({
              location: new google.maps.LatLng(p.lat, p.lng),
              weight: p.weight,
            }));
            if (heatmapLayerRef.current) {
              heatmapLayerRef.current.setData(heatData);
            } else {
              const z = map.getZoom() || 13;
              const metersPerPx = 156543.03 * Math.cos((map.getCenter().lat() || 43.77) * Math.PI / 180) / Math.pow(2, z);
              const radius = Math.max(10, Math.round(350 / metersPerPx));
              const grads = {
                timeAware: [
                  'rgba(0,0,0,0)', 'rgba(30,100,230,0.15)', 'rgba(30,160,255,0.35)', 'rgba(0,200,150,0.5)',
                  'rgba(140,230,60,0.65)', 'rgba(255,220,30,0.78)', 'rgba(255,150,0,0.88)', 'rgba(240,60,40,0.95)', 'rgba(180,20,20,1)',
                ],
                all: [
                  'rgba(0,0,0,0)', 'rgba(0,100,255,0.15)', 'rgba(0,180,255,0.4)', 'rgba(0,210,120,0.55)',
                  'rgba(180,230,50,0.7)', 'rgba(255,220,30,0.8)', 'rgba(255,160,0,0.88)', 'rgba(255,80,20,0.94)', 'rgba(220,30,30,1)',
                ],
              };
              heatmapLayerRef.current = new google.maps.visualization.HeatmapLayer({
                data: heatData, map: map, radius: radius, opacity: 0.85, dissipating: true, maxIntensity: 8,
                gradient: grads[heatmapMode] || grads.all,
              });
            }
          } else if (heatmapLayerRef.current) {
            heatmapLayerRef.current.setData([]);
          }
        }
      }

      // 単価マップ再描画
      if (showPriceTier) {
        priceTierMarkersRef.current.forEach(m => m.setMap(null));
        priceTierMarkersRef.current = [];
        const src = priceTierSource === 'all' ? null : priceTierSource;
        const pts = DataService.getPriceTierHeatmapData(src);
        const tierColors = { short: '#4CAF50', mid: '#FFC107', long: '#F44336' };
        pts.forEach(p => {
          const marker = new google.maps.Marker({
            position: { lat: p.lat, lng: p.lng },
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: tierColors[p.tier],
              fillOpacity: 0.7,
              strokeColor: '#fff',
              strokeWeight: 1,
              scale: p.tier === 'long' ? 10 : p.tier === 'mid' ? 8 : 6,
            },
            title: `¥${p.amount.toLocaleString()} (${p.source}) ${p.area}`,
            zIndex: p.tier === 'long' ? 3 : p.tier === 'mid' ? 2 : 1,
          });
          priceTierMarkersRef.current.push(marker);
        });
        // 周辺推定更新
        const pos = currentPosition || mapCenter;
        if (pos && pos.lat && pos.lng) {
          setNearbyEstimate(DataService.getNearbyEstimate(pos.lat, pos.lng, 2));
        }
      }
    };
    window.addEventListener('taxi-data-changed', handler);
    return () => window.removeEventListener('taxi-data-changed', handler);
  }, [showHeatmap, heatmapMode, showPriceTier, priceTierSource, currentPosition, mapCenter]);

  // 現在位置マーカー更新
  useEffect(() => {
    if (!mapInstanceRef.current || !currentPosition || !window.google) return;
    const map = mapInstanceRef.current;
    const color = _getAccuracyColor(accuracy);

    if (!markerRef.current) {
      _placeMarker(map, currentPosition);
    } else {
      markerRef.current.setPosition(currentPosition);
      // 精度に応じてマーカーの色を更新
      markerRef.current.setIcon({
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      });
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setCenter(currentPosition);
        accuracyCircleRef.current.setOptions({
          radius: accuracy || 50,
          fillColor: color,
          strokeColor: color,
          fillOpacity: accuracy && accuracy > 500 ? 0.12 : 0.08,
        });
      }
    }

    // 初回GPS取得時: 中心を移動しズームを精度に応じて設定
    if (!firstGpsDone.current) {
      firstGpsDone.current = true;
      map.setCenter(currentPosition);
      // 精度が低い場合はズームを下げる
      const initZoom = accuracy && accuracy > 1000 ? 13 : accuracy && accuracy > 500 ? 14 : 15;
      map.setZoom(initZoom);
      AppLogger.info(`初回GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)} 精度${Math.round(accuracy || 0)}m → zoom ${initZoom}`);
    } else {
      // 2回目以降はスムーズにパン
      map.panTo(currentPosition);
    }
  }, [currentPosition, accuracy]);

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
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', padding: '24px', overflow: 'auto' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', color: 'var(--color-danger)' } }, 'error'),
      React.createElement('p', { style: { color: 'var(--color-danger)', textAlign: 'center', whiteSpace: 'pre-line', fontSize: 'var(--font-size-sm)', lineHeight: '1.8' } }, mapError),
      React.createElement('div', {
        style: { marginTop: '8px', padding: '8px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' },
      },
        React.createElement('div', null, '現在のURL: ' + window.location.origin),
        errorDetail && React.createElement('div', { style: { marginTop: '4px', color: 'var(--color-secondary)' } }, 'Error: ' + errorDetail)
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
        React.createElement(Button, {
          variant: 'primary', icon: 'refresh',
          onClick: () => { window._gmapLoader.reset(); _gmapErrorType = ''; setErrorDetail(null); setMapError(null); setMapLoaded(false); },
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
      style: { minHeight: '450px', position: 'relative' },
    },
      !mapLoaded && React.createElement(Loading, { message: '地図を読み込み中...' }),
      // 精度低下警告オーバーレイ（地図上に表示）
      mapLoaded && accuracy && accuracy > 1000 && React.createElement('div', {
        style: {
          position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 5, background: 'rgba(229,57,53,0.9)', color: '#fff',
          padding: '6px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
          display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'gps_off'),
        `位置精度: 約${Math.round(accuracy / 100) / 10}km（低精度）`
      )
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
        ),

        // 需要ヒートマップトグル
        React.createElement('button', {
          onClick: () => {
            if (!showHeatmap) {
              const pts = DataService.getHeatmapData();
              if (pts.length === 0) {
                AppLogger.warn('GPS付き乗車データを記録するとヒートマップが表示されます');
                return;
              }
            }
            setShowHeatmap(prev => !prev);
          },
          style: {
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            fontSize: '12px', fontWeight: '700',
            color: '#fff', cursor: 'pointer',
            border: showHeatmap ? 'none' : '1px solid rgba(255,255,255,0.2)',
            background: showHeatmap ? '#f59e0b' : 'rgba(255,255,255,0.08)',
            transition: 'all 0.2s ease',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'whatshot'),
          `ヒートマップ ${showHeatmap ? 'ON' : 'OFF'}`
        ),

        // ヒートマップモード切替タブ（ヒートマップON時のみ）
        showHeatmap && React.createElement('div', {
          style: {
            display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '3px',
          },
        },
          ...[
            { id: 'timeAware', label: '時間帯', icon: 'schedule', color: '#2196F3' },
            { id: 'all', label: '全件', icon: 'public', color: '#78909C' },
            { id: 'transit', label: '交通', icon: 'directions_transit', color: '#ec4899' },
            { id: 'combined', label: '統合', icon: 'merge_type', color: '#7c3aed' },
            { id: 'gpsVacant', label: '空車GPS', icon: 'directions_car', color: '#ff9800' },
          ].map(m => React.createElement('button', {
            key: m.id,
            onClick: () => setHeatmapMode(m.id),
            style: {
              display: 'flex', alignItems: 'center', gap: '3px',
              padding: '5px 8px', borderRadius: '6px',
              fontSize: '11px', fontWeight: heatmapMode === m.id ? 700 : 500,
              color: heatmapMode === m.id ? '#fff' : 'rgba(255,255,255,0.6)',
              cursor: 'pointer', border: 'none',
              background: heatmapMode === m.id ? m.color : 'transparent',
              transition: 'all 0.2s ease',
            },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, m.icon),
            m.label
          ))
        ),

        // AI需要予測トグル
        React.createElement('button', {
          onClick: () => {
            if (showAiHeatmap) {
              setShowAiHeatmap(false);
            } else {
              aiModelRef.current = null; // 再学習
              setShowAiHeatmap(true);
            }
          },
          disabled: aiTraining,
          style: {
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            fontSize: '12px', fontWeight: '700',
            color: '#fff', cursor: aiTraining ? 'wait' : 'pointer',
            border: showAiHeatmap ? 'none' : '1px solid rgba(255,255,255,0.2)',
            background: showAiHeatmap ? '#8b5cf6' : 'rgba(255,255,255,0.08)',
            transition: 'all 0.2s ease',
            opacity: aiTraining ? 0.7 : 1,
          },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '16px', animation: aiTraining ? 'spin 1s linear infinite' : 'none' },
          }, aiTraining ? 'sync' : 'psychology'),
          aiTraining ? 'LightGBM 学習中...' : `AI予測 ${showAiHeatmap ? 'ON' : 'OFF'}`
        ),

        // 単価マップトグル
        React.createElement('button', {
          onClick: () => {
            const pts = DataService.getPriceTierHeatmapData(null);
            if (pts.length === 0 && !showPriceTier) {
              AppLogger.warn('GPS付き乗車データを記録すると単価マップが表示されます');
              return;
            }
            setShowPriceTier(prev => !prev);
          },
          style: {
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            fontSize: '12px', fontWeight: '700',
            color: '#fff', cursor: 'pointer',
            border: showPriceTier ? 'none' : '1px solid rgba(255,255,255,0.2)',
            background: showPriceTier ? '#10b981' : 'rgba(255,255,255,0.08)',
            transition: 'all 0.2s ease',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'paid'),
          `単価マップ ${showPriceTier ? 'ON' : 'OFF'}`
        ),

        // AI単価予測トグル
        React.createElement('button', {
          onClick: () => {
            if (showPricePredict) {
              setShowPricePredict(false);
            } else {
              priceModelRef.current = null;
              setShowPricePredict(true);
            }
          },
          disabled: priceTraining,
          style: {
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            fontSize: '12px', fontWeight: '700',
            color: '#fff', cursor: priceTraining ? 'wait' : 'pointer',
            border: showPricePredict ? 'none' : '1px solid rgba(255,255,255,0.2)',
            background: showPricePredict ? '#ec4899' : 'rgba(255,255,255,0.08)',
            transition: 'all 0.2s ease',
            opacity: priceTraining ? 0.7 : 1,
          },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '16px', animation: priceTraining ? 'spin 1s linear infinite' : 'none' },
          }, priceTraining ? 'sync' : 'auto_awesome'),
          priceTraining ? '単価学習中...' : `AI単価予測 ${showPricePredict ? 'ON' : 'OFF'}`
        )
      ),

      // ヒートマップ情報パネル
      showHeatmap && heatmapStats && (() => {
        const modeColor = { timeAware: '#2196F3', all: '#FF9800', transit: '#ec4899', combined: '#7c3aed', gpsVacant: '#ff9800' }[heatmapMode] || '#FF9800';
        const modeDesc = {
          timeAware: '現在時間帯(±2h)・曜日・鮮度で重み付け',
          all: '全期間の乗車データを均等表示',
          transit: 'バス・JR到着 + 病院ピークの需要分布',
          combined: '乗車実績 + 交通需要の統合',
          gpsVacant: 'GPS軌跡の空車走行エリアを可視化（直近30日）',
        }[heatmapMode];
        return React.createElement('div', {
          style: {
            marginTop: '8px', padding: '10px 12px', borderRadius: '8px',
            background: `${modeColor}10`, border: `1px solid ${modeColor}40`,
          },
        },
          // 説明行
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '6px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '15px', color: modeColor } }, 'info'),
            React.createElement('span', { style: { color: 'var(--text-secondary)', flex: 1 } }, modeDesc),
            heatmapMode === 'gpsVacant' && React.createElement('span', {
              style: { fontWeight: 700, color: modeColor, fontSize: '12px', whiteSpace: 'nowrap' },
            }, `${heatmapStats.totalRides}点`),
            heatmapMode !== 'transit' && heatmapMode !== 'gpsVacant' && React.createElement('span', {
              style: { fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px', whiteSpace: 'nowrap' },
            }, `${heatmapStats.totalRides}件`),
            heatmapMode === 'transit' && React.createElement('span', {
              style: { fontWeight: 700, color: modeColor, fontSize: '12px', whiteSpace: 'nowrap' },
            }, `${heatmapStats.timeFiltered}pt`)
          ),
          // 凡例バー
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)' },
          },
            React.createElement('span', null, '低'),
            React.createElement('div', {
              style: {
                flex: 1, height: 6, borderRadius: 3,
                background: heatmapMode === 'transit'
                  ? 'linear-gradient(to right, rgba(200,50,150,0.2), #ec4899, #b4143c)'
                  : heatmapMode === 'combined'
                  ? 'linear-gradient(to right, rgba(124,58,237,0.2), #7c3aed, #c83028)'
                  : heatmapMode === 'gpsVacant'
                  ? 'linear-gradient(to right, rgba(255,152,0,0.2), #ff9800, #e65100, #b71c1c)'
                  : 'linear-gradient(to right, rgba(0,100,255,0.3), #00d278, #ffdc1e, #ffa000, #dc1e1e)',
              },
            }),
            React.createElement('span', null, '高')
          ),
          // 時間帯一致バッジ
          heatmapMode === 'timeAware' && heatmapStats.timeFiltered > 0 && React.createElement('div', {
            style: { marginTop: '5px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' },
          },
            React.createElement('span', {
              style: { padding: '1px 8px', borderRadius: '10px', background: `${modeColor}30`, fontWeight: 600, color: modeColor },
            }, `${heatmapStats.timeFiltered}件が時間帯一致`)
          ),
          // ヒント
          heatmapMode !== 'transit' && heatmapStats.totalRides < 10 && React.createElement('div', {
            style: { marginTop: '5px', fontSize: '11px', color: '#FF9800', display: 'flex', alignItems: 'center', gap: '4px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px' } }, 'tips_and_updates'),
            'データが増えるほど精度が向上します'
          ),
          heatmapMode === 'transit' && heatmapStats.timeFiltered === 0 && React.createElement('div', {
            style: { marginTop: '5px', fontSize: '11px', color: '#ec4899', display: 'flex', alignItems: 'center', gap: '4px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px' } }, 'tips_and_updates'),
            '「営業プラン取得」で交通需要が表示されます'
          )
        );
      })(),

      // 時間帯シミュレーション スライダー
      (showAiHeatmap || showPricePredict) && React.createElement('div', {
        style: {
          marginTop: '8px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: '#ec4899' } }, 'schedule'),
            React.createElement('span', { style: { fontSize: '12px', fontWeight: 600, color: '#ec4899' } }, '時間帯シミュレーション')
          ),
          React.createElement('button', {
            onClick: () => {
              const next = !simMode;
              setSimMode(next);
              if (!next) {
                setSimHour(new Date().getHours());
              }
            },
            style: {
              padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-family)',
              background: simMode ? '#ec4899' : 'rgba(255,255,255,0.1)',
              color: simMode ? '#fff' : 'var(--text-secondary)',
            },
          }, simMode ? 'シミュレーションON' : 'OFF（現在時刻）')
        ),

        // スライダー
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px' },
        },
          React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', minWidth: '24px' } }, '0時'),
          React.createElement('input', {
            type: 'range', min: 0, max: 23, step: 1,
            value: simHour,
            onChange: (e) => { setSimMode(true); setSimHour(parseInt(e.target.value, 10)); },
            style: { flex: 1, accentColor: '#ec4899' },
          }),
          React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', minWidth: '30px' } }, '23時')
        ),

        React.createElement('div', {
          style: { textAlign: 'center', marginTop: '4px' },
        },
          React.createElement('span', {
            style: { fontSize: '16px', fontWeight: 700, color: simMode ? '#ec4899' : 'var(--text-secondary)' },
          }, simHour + '時台'),
          !simMode && React.createElement('span', {
            style: { fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' },
          }, '（現在時刻）'),
          simMode && React.createElement('span', {
            style: { fontSize: '11px', color: '#ec4899', marginLeft: '8px' },
          }, (() => {
            const diff = simHour - new Date().getHours();
            if (diff === 0) return '（現在）';
            return diff > 0 ? '（' + diff + '時間後）' : '（' + Math.abs(diff) + '時間前）';
          })())
        )
      ),

      // AI予測 情報メッセージ
      showAiHeatmap && !aiTraining && React.createElement('div', {
        style: {
          marginTop: '8px', padding: '8px 12px', borderRadius: '6px',
          background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)',
          fontSize: 'var(--font-size-xs)', color: '#a78bfa',
          display: 'flex', alignItems: 'center', gap: '6px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'psychology'),
        (() => {
          const now = new Date();
          const days = ['日', '月', '火', '水', '木', '金', '土'];
          const entries = DataService.getEntries();
          const w = entries.length > 0 ? (entries[0].weather || '未設定') : '未設定';
          const hr = simMode ? simHour : now.getHours();
          return `LightGBM予測: ${days[now.getDay()]}曜 ${hr}時 ${w} の需要分布${simMode ? ' (シミュレーション)' : ''}`;
        })()
      ),

      // ヒートマップ データなしメッセージ
      showHeatmap && DataService.getHeatmapData().length === 0 && React.createElement('div', {
        style: {
          marginTop: '8px', padding: '8px 12px', borderRadius: '6px',
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          fontSize: 'var(--font-size-xs)', color: '#f59e0b',
          display: 'flex', alignItems: 'center', gap: '6px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'info'),
        'GPS付き乗車データを記録するとヒートマップが表示されます（各地点から半径2km圏の重なりで乗車率を分析）'
      ),

      // AI単価予測 情報メッセージ
      showPricePredict && !priceTraining && React.createElement('div', {
        style: {
          marginTop: '8px', padding: '8px 12px', borderRadius: '6px',
          background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.3)',
          fontSize: 'var(--font-size-xs)', color: '#f472b6',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'auto_awesome'),
          (() => {
            const hr = simMode ? simHour : new Date().getHours();
            const days = ['日', '月', '火', '水', '木', '金', '土'];
            return 'AI単価予測: ' + days[new Date().getDay()] + '曜 ' + hr + '時' + (simMode ? ' (シミュレーション)' : '');
          })()
        ),
        React.createElement('div', {
          style: { display: 'flex', gap: '10px', fontSize: '10px', color: 'var(--text-secondary)' },
        },
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
            React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: '#4CAF50', display: 'inline-block' } }),
            '¥1,000以下'
          ),
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
            React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: '#FFC107', display: 'inline-block' } }),
            '¥1,001〜1,999'
          ),
          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
            React.createElement('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: '#F44336', display: 'inline-block' } }),
            '¥2,000以上'
          )
        )
      ),

      // 単価マップ表示時: 配車方法フィルター + 周辺推定 + 凡例
      showPriceTier && React.createElement('div', {
        style: {
          marginTop: '8px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
        },
      },
        // 配車方法フィルター
        React.createElement('div', {
          style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' },
        },
          React.createElement('span', {
            style: { fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', marginRight: '4px' },
          }, '配車方法:'),
          ...['all', 'Go', 'Uber', 'DIDI', '電話', '流し'].map(s =>
            React.createElement('button', {
              key: s,
              onClick: () => setPriceTierSource(s),
              style: {
                padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-family)',
                background: priceTierSource === s ? '#10b981' : 'rgba(255,255,255,0.1)',
                color: priceTierSource === s ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              },
            }, s === 'all' ? '全て' : s)
          )
        ),

        // 周辺推定
        nearbyEstimate && nearbyEstimate.count > 0 && React.createElement('div', {
          style: {
            padding: '8px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)',
            marginBottom: '8px',
          },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: '#10b981' } }, 'near_me'),
            React.createElement('span', { style: { fontSize: '12px', fontWeight: 600, color: '#10b981' } }, '現在地周辺（半径2km）')
          ),
          React.createElement('div', {
            style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' },
          },
            React.createElement('div', null,
              React.createElement('span', { style: { color: 'var(--text-muted)' } }, '推定客単価 '),
              React.createElement('span', { style: { fontWeight: 700, color: '#fff', fontSize: '14px' } }, '¥' + nearbyEstimate.avgPrice.toLocaleString())
            ),
            React.createElement('div', null,
              React.createElement('span', { style: { color: 'var(--text-muted)' } }, '過去データ '),
              React.createElement('span', { style: { fontWeight: 600, color: '#fff' } }, nearbyEstimate.count + '件')
            ),
            React.createElement('div', null,
              React.createElement('span', { style: { color: 'var(--text-muted)' } }, '単価構成 '),
              React.createElement('span', { style: { color: '#4CAF50' } }, '短' + nearbyEstimate.tierCounts.short),
              ' ',
              React.createElement('span', { style: { color: '#FFC107' } }, '中' + nearbyEstimate.tierCounts.mid),
              ' ',
              React.createElement('span', { style: { color: '#F44336' } }, '長' + nearbyEstimate.tierCounts.long)
            ),
            nearbyEstimate.topArea && React.createElement('div', null,
              React.createElement('span', { style: { color: 'var(--text-muted)' } }, '最多エリア '),
              React.createElement('span', { style: { fontWeight: 600, color: '#fff' } }, nearbyEstimate.topArea)
            )
          ),
          // 配車方法内訳
          Object.keys(nearbyEstimate.sources).length > 0 && React.createElement('div', {
            style: { marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' },
          },
            ...Object.entries(nearbyEstimate.sources).sort((a, b) => b[1] - a[1]).map(([src, cnt]) =>
              React.createElement('span', {
                key: src,
                style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)' },
              }, src + ' ' + cnt + '件')
            )
          )
        ),

        // 凡例
        React.createElement('div', {
          style: { display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11px' },
        },
          React.createElement('span', { style: { fontWeight: 600, color: 'var(--text-secondary)' } }, '凡例:'),
          ...[
            { c: '#4CAF50', l: '¥1,000以下', s: 6 },
            { c: '#FFC107', l: '¥1,001〜1,999', s: 8 },
            { c: '#F44336', l: '¥2,000以上', s: 10 },
          ].map(item =>
            React.createElement('span', {
              key: item.l,
              style: { display: 'flex', alignItems: 'center', gap: '3px' },
            },
              React.createElement('span', {
                style: { display: 'inline-block', width: item.s * 2 + 'px', height: item.s * 2 + 'px', borderRadius: '50%', background: item.c, opacity: 0.7 },
              }),
              React.createElement('span', { style: { color: 'var(--text-secondary)' } }, item.l)
            )
          )
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

})();
