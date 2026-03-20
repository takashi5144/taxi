(function() {
// Revenue.jsx - 売上記録ページ（DataService統合・バリデーション・CSVエクスポート）
// v0.3.2: DataServiceのCRUDメソッドに一元化。ローカルstate独自管理を廃止し、
//         DataServiceを唯一のデータソースとして使用する。
// v0.3.4: 乗車地・降車地のGPS現在地取得機能を追加
// v0.3.5: 日付・天候フィールドを追加
// v0.3.6: 乗車時間・降車時間フィールドを追加
// v0.3.7: 日付・曜日・天候の自動取得
window.RevenuePage = () => {
  const { useState, useEffect, useCallback, useRef, useMemo } = React;

  // 本日の日付をデフォルト値に
  const todayDefault = getLocalDateString();

  const getNowTime = TaxiApp.utils.getNowTime;

  // WMO天気コードを天候カテゴリに変換（共通ユーティリティ委譲）
  const wmoToWeather = (code) => TaxiApp.utils.wmoToWeather(code, '');

  // DataServiceから最新データを取得するためのrefreshKey
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ date: todayDefault, weather: '', temperature: null, amount: '', paymentMethod: 'cash', discounts: {}, pickup: '', pickupTime: '', dropoff: '', dropoffTime: '', passengers: '1', gender: '', purpose: '', memo: '', source: '', isRegisteredUser: false, customerName: '' });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [gpsLoading, setGpsLoading] = useState({ pickup: false, dropoff: false });
  const [gpsInfo, setGpsInfo] = useState({ pickup: null, dropoff: null });
  const [mapPickerField, setMapPickerField] = useState(null); // 'pickup' | 'dropoff' | null
  const mapPickerRef = useRef(null);
  const mapPickerInstanceRef = useRef(null);
  const mapPickerMarkerRef = useRef(null);
  const dropoffSectionRef = useRef(null);
  const sourceSectionRef = useRef(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const weatherFetched = useRef(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [capturedStandby, setCapturedStandby] = useState(null);

  const { apiKey, geminiApiKey } = useAppContext();
  const mapCtx = useMapContext();

  // フォーム表示時に待機情報をキャプチャ（リアルタイム or 直前完了した待機）
  useEffect(() => {
    if (capturedStandby) return; // 既にキャプチャ済み
    // 1. リアルタイム待機中ならそれを使う
    if (mapCtx.standbyStatus) {
      setCapturedStandby({ ...mapCtx.standbyStatus });
      return;
    }
    // 2. 直前に完了した待機があればそれを使う
    if (window.GpsLogService) {
      const last = GpsLogService.getLastCompletedStandby();
      if (last && last.locationName) {
        setCapturedStandby(last);
      }
    }
  }, [mapCtx.standbyStatus]);
  const { isLoaded: mapsLoaded } = useGoogleMaps();

  // ページ読み込み時に天気を自動取得（GPSキャッシュ優先）
  useEffect(() => {
    if (weatherFetched.current) return;
    weatherFetched.current = true;

    // GPSキャッシュから天気取得を試みる
    const cached = GpsLogService.getCurrentWeather();
    if (cached && cached.weather) {
      setForm(prev => prev.weather ? prev : { ...prev, weather: cached.weather, temperature: cached.temperature != null ? cached.temperature : null });
      AppLogger.info(`売上 天気GPSキャッシュ使用: ${cached.weather} ${cached.temperature}℃`);
      return;
    }

    const fetchWeather = () => {
      if (!navigator.geolocation) {
        AppLogger.warn('天気自動取得: GPS利用不可');
        return;
      }
      setWeatherLoading(true);
      getAccuratePosition({ accuracyThreshold: 500, timeout: 10000, maxWaitAfterFix: 3000 })
        .then((position) => {
          const lat = position.coords.latitude.toFixed(4);
          const lng = position.coords.longitude.toFixed(4);
          const meteoParams = new URLSearchParams({ latitude: lat, longitude: lng, current_weather: 'true', timezone: 'Asia/Tokyo' });
          const url = `https://api.open-meteo.com/v1/forecast?${meteoParams}`;
          return fetch(url).then(res => res.json());
        })
        .then(data => {
          setWeatherLoading(false);
          if (data && data.current_weather) {
            const w = wmoToWeather(data.current_weather.weathercode);
            const temp = data.current_weather.temperature != null ? data.current_weather.temperature : null;
            if (w) {
              setForm(prev => prev.weather ? prev : { ...prev, weather: w, temperature: temp });
              AppLogger.info(`天気自動取得成功: ${w} ${temp != null ? temp + '℃' : ''} (WMO code: ${data.current_weather.weathercode})`);
            }
          }
        })
        .catch(err => {
          setWeatherLoading(false);
          AppLogger.warn('天気取得用GPS失敗: ' + (err.message || ''));
        });
    };
    fetchWeather();
  }, []);

  // データは常にDataServiceから取得（単一のデータソース）
  const entries = useMemo(() => DataService.getEntries(), [refreshKey]);

  // localStorageの変更・データ変更イベントを監視して自動更新
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA) {
        setRefreshKey(k => k + 1);
      }
    };
    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('taxi-data-changed', handleDataChanged);

    const handleVisibility = () => {
      if (!document.hidden) {
        setRefreshKey(k => k + 1);
        // 日付が変わっていたらフォームの日付を自動更新
        const currentDate = getLocalDateString();
        setForm(prev => {
          if (prev.date !== currentDate) {
            return { ...prev, date: currentDate };
          }
          return prev;
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // GPS座標から近くのランドマーク名を取得し、gpsInfoに保存（フォームの住所は上書きしない）
  const _applyLandmarkName = useCallback((lat, lng, field) => {
    TaxiApp.utils.findNearbyLandmark(lat, lng).then(landmark => {
      if (landmark) {
        AppLogger.info(`ランドマーク検出 (${field}): ${landmark}`);
        setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), landmark } }));
      }
    }).catch(() => {});
  }, []);

  // 逆ジオコーディングリクエストIDで競合防止（フィールドごと）
  const geocodeReqIdRef = useRef({ pickup: 0, dropoff: 0 });

  const _reverseGeocodeAndSetForm = useCallback((lat, lng, acc, field) => {
    // リクエストIDをインクリメント（同じフィールドの古いリクエストを無視）
    const reqId = ++geocodeReqIdRef.current[field];
    const isStale = () => geocodeReqIdRef.current[field] !== reqId;

    setGpsInfo(prev => ({ ...prev, [field]: { ...((prev && prev[field]) || {}), lat, lng, accuracy: acc } }));

    // 最優先: 座標ベースの既知場所マッチング
    const knownPlace = TaxiApp.utils.matchKnownPlace(lat, lng);
    if (knownPlace) {
      const timeField = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
      setGpsLoading(prev => ({ ...prev, [field]: false }));
      setForm(prev => ({ ...prev, [field]: knownPlace, [timeField]: getNowTime() }));
      setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), lat, lng, address: knownPlace } }));
      AppLogger.info(`既知場所マッチ (${field}): ${knownPlace} (精度${acc}m)`);
      return;
    }

    if (apiKey && window.google && window.google.maps) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (isStale()) return; // 古いリクエストは無視
        setGpsLoading(prev => ({ ...prev, [field]: false }));
        if (status === 'OK' && results && results.length > 0) {
          // クエリ座標に近い最適な結果を選択（距離検証付き）
          const preferred = TaxiApp.utils.pickBestGeocoderResult(results, lat, lng);
          const address = TaxiApp.utils.extractAddress(preferred);
          const fullAddress = preferred.formatted_address.replace(/、日本$/, '').replace(/^日本、/, '');
          const timeField = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
          setForm(prev => ({ ...prev, [field]: address, [timeField]: getNowTime() }));
          setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), lat, lng, address: fullAddress } }));
          AppLogger.info(`GPS逆ジオコーディング成功 (${field}): ${address}`);
          // ランドマーク名をgpsInfoに保存（住所は上書きしない）
          _applyLandmarkName(lat, lng, field);
        } else {
          const timeField2 = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
          const nomUrl2 = TaxiApp.utils.nominatimUrl(lat, lng, 18);
          fetch(nomUrl2)
            .then(res2 => res2.json())
            .then(data2 => {
              if (isStale()) return; // 古いリクエストは無視
              if (data2 && data2.address) {
                const a2 = data2.address;
                const parts2 = [a2.city || a2.town || a2.village || a2.county || '', a2.suburb || a2.neighbourhood || a2.quarter || '', a2.road || ''].filter(Boolean);
                const shortAddr2 = parts2.join(' ') || data2.display_name.split(',').slice(0, 3).join(' ');
                setForm(prev => ({ ...prev, [field]: shortAddr2, [timeField2]: getNowTime() }));
                setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), lat, lng, address: data2.display_name || shortAddr2 } }));
                _applyLandmarkName(lat, lng, field);
              } else {
                const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                setForm(prev => ({ ...prev, [field]: coordStr, [timeField2]: getNowTime() }));
                setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), lat, lng, address: null } }));
              }
            })
            .catch(() => {
              const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              setForm(prev => ({ ...prev, [field]: coordStr, [timeField2]: getNowTime() }));
              setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), lat, lng, address: null } }));
            });
          AppLogger.warn(`Google逆ジオコーディング失敗、Nominatimにフォールバック`);
        }
      });
    } else {
      const timeField3 = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
      const nomUrl = TaxiApp.utils.nominatimUrl(lat, lng, 18);
      fetch(nomUrl)
        .then(res => res.json())
        .then(data => {
          if (isStale()) return; // 古いリクエストは無視
          setGpsLoading(prev => ({ ...prev, [field]: false }));
          if (data && data.address) {
            const a = data.address;
            const parts = [a.city || a.town || a.village || a.county || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || ''].filter(Boolean);
            const shortAddr = parts.join(' ') || data.display_name.split(',').slice(0, 3).join(' ');
            const fullAddr = data.display_name || shortAddr;
            setForm(prev => ({ ...prev, [field]: shortAddr, [timeField3]: getNowTime() }));
            setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), lat, lng, address: fullAddr } }));
            AppLogger.info(`Nominatim逆ジオコーディング成功 (${field}): ${shortAddr}`);
            _applyLandmarkName(lat, lng, field);
          } else {
            const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            setForm(prev => ({ ...prev, [field]: coordStr, [timeField3]: getNowTime() }));
            setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), lat, lng, address: null } }));
            AppLogger.warn(`Nominatim逆ジオコーディング失敗、座標を使用: ${coordStr}`);
          }
        })
        .catch(err => {
          setGpsLoading(prev => ({ ...prev, [field]: false }));
          const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          setForm(prev => ({ ...prev, [field]: coordStr, [timeField3]: getNowTime() }));
          setGpsInfo(prev => ({ ...prev, [field]: { ...(prev[field] || {}), lat, lng, address: null } }));
          AppLogger.warn(`Nominatim API失敗、座標を使用: ${err.message}`);
        });
    }
  }, [apiKey, _applyLandmarkName]);

  // GPS現在地を取得して住所に変換
  // ボタン押下時は常にその場で新規GPS位置を取得する（キャッシュは使わない）
  const getGpsLocation = useCallback((field) => {
    if (!navigator.geolocation) {
      setErrors(['このブラウザではGPS機能が使えません']);
      return;
    }

    setGpsLoading(prev => ({ ...prev, [field]: true }));
    setErrors([]);

    // 常に新規GPS位置を取得（乗車地・降車地それぞれでボタンを押した瞬間の位置を使う）
    getAccuratePosition({ accuracyThreshold: 30, timeout: 20000, maxWaitAfterFix: 8000 })
      .then((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = Math.round(position.coords.accuracy);
        _reverseGeocodeAndSetForm(lat, lng, acc, field);
      })
      .catch((error) => {
        setGpsLoading(prev => ({ ...prev, [field]: false }));
        const messages = {
          1: 'GPS使用が許可されていません。ブラウザの設定を確認してください。',
          2: '現在地を取得できませんでした。',
          3: 'GPS取得がタイムアウトしました。',
        };
        setErrors([messages[error.code] || 'GPS取得に失敗しました']);
        AppLogger.error(`GPS取得失敗 (${field}): code=${error.code || 0}`);
      });
  }, [_reverseGeocodeAndSetForm]);

  // GPS取得完了後に次のセクションへ自動スクロール
  const prevGpsLoadingRef = useRef({ pickup: false, dropoff: false });
  useEffect(() => {
    const prev = prevGpsLoadingRef.current;
    // pickup: loading中→完了 → 降車地セクションへスクロール
    if (prev.pickup && !gpsLoading.pickup && dropoffSectionRef.current) {
      setTimeout(() => {
        dropoffSectionRef.current && dropoffSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
    // dropoff: loading中→完了 → 配車方法セクションへスクロール
    if (prev.dropoff && !gpsLoading.dropoff && sourceSectionRef.current) {
      setTimeout(() => {
        sourceSectionRef.current && sourceSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
    prevGpsLoadingRef.current = { pickup: gpsLoading.pickup, dropoff: gpsLoading.dropoff };
  }, [gpsLoading.pickup, gpsLoading.dropoff]);

  // Geocoding結果から簡潔な住所を抽出（共通ユーティリティ委譲）
  const _formatAddress = TaxiApp.utils.formatAddress;


  // マップピッカー状態表示用
  const [mapPickerStatus, setMapPickerStatus] = useState('');

  // マップピッカーの初期化・クリックハンドラ（売上記録ページ用）
  useEffect(() => {
    if (!mapPickerField || !mapPickerRef.current || !window.google || !window.google.maps) return;
    setMapPickerStatus('');
    setTimeout(() => { mapPickerRef.current && mapPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
    const center = APP_CONSTANTS.DEFAULT_MAP_CENTER;
    const map = new google.maps.Map(mapPickerRef.current, {
      center, zoom: 13, mapTypeId: 'roadmap', disableDefaultUI: true,
      zoomControl: true, fullscreenControl: false, mapTypeControl: false,
      gestureHandling: 'greedy',
    });
    mapPickerInstanceRef.current = map;
    const marker = new google.maps.Marker({ map, position: center, visible: false });
    mapPickerMarkerRef.current = marker;

    // GPS走行履歴を道路に沿ったルートで表示
    const _showGpsHistory = async () => {
      if (!window.GpsLogService) return;
      const todayStr = new Date().toISOString().slice(0, 10);
      try {
        const log = await GpsLogService.getLogForDate(todayStr);
        if (!log || log.length === 0) return;
        const path = log.filter(e => e.lat && e.lng).map(e => ({ lat: e.lat, lng: e.lng }));
        if (path.length === 0) return;

        // Directions Serviceで道路に沿ったルートを表示
        const directionsService = new google.maps.DirectionsService();
        // GPSポイントをサンプリング（Directions APIはwaypoint最大25個制限）
        const MAX_WAYPOINTS = 23;
        const _samplePoints = (pts, maxWp) => {
          if (pts.length <= maxWp + 2) return { origin: pts[0], destination: pts[pts.length - 1], waypoints: pts.slice(1, -1).map(p => ({ location: p, stopover: false })) };
          const step = (pts.length - 2) / (maxWp);
          const wps = [];
          for (let i = 0; i < maxWp; i++) {
            const idx = Math.round(1 + i * step);
            if (idx > 0 && idx < pts.length - 1) wps.push({ location: pts[idx], stopover: false });
          }
          return { origin: pts[0], destination: pts[pts.length - 1], waypoints: wps };
        };

        // ルートをセグメントに分割して表示（25個制限対策）
        const SEGMENT_SIZE = 25;
        const segments = [];
        for (let i = 0; i < path.length - 1; i += SEGMENT_SIZE - 1) {
          const seg = path.slice(i, Math.min(i + SEGMENT_SIZE, path.length));
          if (seg.length >= 2) segments.push(seg);
        }

        const bounds = new google.maps.LatLngBounds();
        let routeDrawn = false;

        for (const seg of segments) {
          const sampled = _samplePoints(seg, MAX_WAYPOINTS);
          try {
            const result = await new Promise((resolve, reject) => {
              directionsService.route({
                origin: sampled.origin,
                destination: sampled.destination,
                waypoints: sampled.waypoints,
                travelMode: google.maps.TravelMode.DRIVING,
                optimizeWaypoints: false,
              }, (res, status) => {
                if (status === 'OK') resolve(res);
                else reject(new Error(status));
              });
            });
            // ルートのポリラインを描画
            const routePath = result.routes[0].overview_path;
            new google.maps.Polyline({
              path: routePath, map, strokeColor: '#4285F4', strokeOpacity: 0.8, strokeWeight: 4, clickable: false,
              icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5, strokeColor: '#fff', strokeOpacity: 0.9 }, offset: '100%', repeat: '300px' }],
            });
            routePath.forEach(p => bounds.extend(p));
            routeDrawn = true;
          } catch (dirErr) {
            // Directions失敗時は直線フォールバック
            AppLogger.warn('Directions API失敗、直線表示にフォールバック: ' + dirErr.message);
            new google.maps.Polyline({
              path: seg, map, strokeColor: '#4285F4', strokeOpacity: 0.5, strokeWeight: 3, clickable: false,
            });
            seg.forEach(p => bounds.extend(p));
            routeDrawn = true;
          }
        }

        // イベント（乗車/降車）ピンを表示
        for (const entry of log) {
          if (entry.event && entry.lat && entry.lng) {
            const isPickup = entry.event === 'pickup';
            new google.maps.Marker({
              map, position: { lat: entry.lat, lng: entry.lng },
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6,
                fillColor: isPickup ? '#1a73e8' : '#00c853', fillOpacity: 0.9,
                strokeColor: '#fff', strokeWeight: 1.5 },
              title: `${isPickup ? '乗車' : '降車'} ${entry.t || ''}`,
            });
            bounds.extend({ lat: entry.lat, lng: entry.lng });
          }
        }

        // 履歴の範囲にフィット
        if (routeDrawn) {
          map.fitBounds(bounds, 40);
        }
        AppLogger.info('地図ピッカー: GPS履歴' + path.length + '件をルート表示');
      } catch (err) {
        AppLogger.warn('GPS履歴表示失敗: ' + (err.message || err));
      }
    };

    // GPS現在地を取得してマップの中心に設定（追跡中は即座に使用）
    const _showCurrentPos = (lat, lng) => {
      const pos = { lat, lng };
      map.setCenter(pos);
      map.setZoom(15);
      new google.maps.Marker({ map, position: pos, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }, title: '現在地', clickable: false });
    };

    // GPS履歴を先に表示し、現在地があればそちらも重ねて表示
    _showGpsHistory().then(() => {
      if (mapCtx.isTracking && mapCtx.currentPosition && mapCtx.currentPosition.lat) {
        _showCurrentPos(mapCtx.currentPosition.lat, mapCtx.currentPosition.lng);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => _showCurrentPos(pos.coords.latitude, pos.coords.longitude),
          () => {},
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
        );
      }
    });

    const _extractAddress = TaxiApp.utils.extractAddress;

    // 逆ジオコーディング処理（座標確定後に呼ばれる共通関数）
    const _resolveAddress = (lat, lng, field) => {
      setMapPickerStatus('住所を取得中...');
      const timeField = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
      // 最優先: 既知場所マッチング
      const knownPlace = TaxiApp.utils.matchKnownPlace(lat, lng);
      if (knownPlace) {
        setForm(f => ({ ...f, [field]: knownPlace, [timeField]: getNowTime() }));
        setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: knownPlace, accuracy: null } }));
        setMapPickerStatus(`設定完了: ${knownPlace}`);
        return;
      }
      // 逆ジオコーディング
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          const preferred = TaxiApp.utils.pickBestGeocoderResult(results, lat, lng);
          const addr = _extractAddress(preferred);
          setForm(f => ({ ...f, [field]: addr, [timeField]: getNowTime() }));
          setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: addr, accuracy: null } }));
          setMapPickerStatus(`設定完了: ${addr}`);
          TaxiApp.utils.findNearbyLandmark(lat, lng).then(lm => {
            if (lm) {
              setGpsInfo(prev => ({ ...prev, [field]: { ...prev[field], landmark: lm } }));
            }
          }).catch(() => {});
        } else {
          // Nominatimフォールバック
          fetch(TaxiApp.utils.nominatimUrl(lat, lng, 18))
            .then(r => r.json()).then(data => {
              const a = data.address || {};
              const parts = [a.city || a.town || a.village || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || '', a.house_number || ''].filter(Boolean);
              const addr = parts.join(' ') || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              setForm(f => ({ ...f, [field]: addr, [timeField]: getNowTime() }));
              setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: addr, accuracy: null } }));
              setMapPickerStatus(`設定完了: ${addr}`);
            }).catch(() => {
              const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              setForm(f => ({ ...f, [field]: coordStr, [timeField]: getNowTime() }));
              setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: null, accuracy: null } }));
              setMapPickerStatus(`設定完了: ${coordStr}`);
            });
        }
      });
    };

    map.addListener('click', (e) => {
      const tapLat = e.latLng.lat();
      const tapLng = e.latLng.lng();
      marker.setPosition(e.latLng);
      marker.setVisible(true);
      setMapPickerStatus('位置を処理中...');
      AppLogger.info(`地図タップ: ${tapLat.toFixed(6)}, ${tapLng.toFixed(6)} (field=${mapPickerField})`);

      // GPSログから近くの記録を検索し、より正確な位置に補正
      const todayStr = new Date().toISOString().slice(0, 10);
      if (window.GpsLogService) {
        GpsLogService.findNearestByLocation(todayStr, tapLat, tapLng, 200, 60).then(entry => {
          if (entry) {
            AppLogger.info(`地図修正→GPSログ補正: タップ(${tapLat.toFixed(6)},${tapLng.toFixed(6)}) → ログ(${entry.lat.toFixed(6)},${entry.lng.toFixed(6)}) 差${entry.distance}m 時刻=${entry.t}`);
            const correctedPos = new google.maps.LatLng(entry.lat, entry.lng);
            marker.setPosition(correctedPos);
            _resolveAddress(entry.lat, entry.lng, mapPickerField);
          } else {
            _resolveAddress(tapLat, tapLng, mapPickerField);
          }
        }).catch((err) => {
          AppLogger.warn(`GPSログ検索失敗: ${err.message || err}`);
          _resolveAddress(tapLat, tapLng, mapPickerField);
        });
      } else {
        _resolveAddress(tapLat, tapLng, mapPickerField);
      }
    });

    return () => { mapPickerInstanceRef.current = null; mapPickerMarkerRef.current = null; };
  }, [mapPickerField, mapsLoaded]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors([]);

    // GPS座標とランドマーク情報をformに注入
    const formWithCoords = { ...form };
    if (gpsInfo.pickup && gpsInfo.pickup.lat != null) {
      formWithCoords.pickupCoords = { lat: gpsInfo.pickup.lat, lng: gpsInfo.pickup.lng };
    }
    if (gpsInfo.dropoff && gpsInfo.dropoff.lat != null) {
      formWithCoords.dropoffCoords = { lat: gpsInfo.dropoff.lat, lng: gpsInfo.dropoff.lng };
    }
    if (gpsInfo.pickup && gpsInfo.pickup.landmark) {
      formWithCoords.pickupLandmark = gpsInfo.pickup.landmark;
    }
    if (gpsInfo.dropoff && gpsInfo.dropoff.landmark) {
      formWithCoords.dropoffLandmark = gpsInfo.dropoff.landmark;
    }
    // 待機情報を保存
    if (capturedStandby) {
      formWithCoords.standbyInfo = {
        locationName: capturedStandby.locationName,
        startTime: capturedStandby.startTimeHHMM || '',
        endTime: capturedStandby.endTimeHHMM || '',
        category: capturedStandby.category,
        lat: capturedStandby.lat,
        lng: capturedStandby.lng,
      };
    }

    // DataServiceのaddEntryに完全委譲（バリデーション含む）
    const result = DataService.addEntry(formWithCoords);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    // 保存後: GPSログに乗車/降車イベントを記録
    if (window.GpsLogService && result.entry) {
      const entry = result.entry;
      const dateStr = entry.date || getLocalDateString();
      if (entry.pickupCoords && entry.pickupCoords.lat) {
        GpsLogService.recordEvent(dateStr, 'pickup', entry.pickupCoords.lat, entry.pickupCoords.lng, entry.pickupTime, entry.id);
      }
      if (entry.dropoffCoords && entry.dropoffCoords.lat) {
        GpsLogService.recordEvent(dateStr, 'dropoff', entry.dropoffCoords.lat, entry.dropoffCoords.lng, entry.dropoffTime, entry.id);
      }
    }

    // 新規保存後: 待機情報がある場合、待機記録と同期
    if (result.entry && formWithCoords.standbyInfo && formWithCoords.standbyInfo.locationName) {
      const entry = result.entry;
      const standbyEntries = DataService.getStandbyEntries();
      const si = formWithCoords.standbyInfo;
      // 同じ日付・時刻が一致する待機記録を検索
      const matchingStandby = standbyEntries.find(s => {
        if (s.date !== entry.date) return false;
        const sSi = s.standbyInfo || {};
        const sStart = sSi.startTime || s.pickupTime || '';
        if (si.startTime && sStart && si.startTime === sStart) return true;
        // 時刻が近い（5分以内）
        if (sStart && si.startTime) {
          const sMin = parseInt(sStart.replace(':',''));
          const eMin = parseInt(si.startTime.replace(':',''));
          if (Math.abs(sMin - eMin) <= 5) return true;
        }
        return false;
      });
      if (matchingStandby) {
        // 既存の待機記録を更新
        DataService.updateEntry(matchingStandby.id, {
          pickup: si.locationName,
          dropoff: si.locationName,
          pickupTime: si.startTime,
          dropoffTime: si.endTime,
          standbyInfo: si,
        });
      } else {
        // 対応する待機記録がなければ新規作成
        DataService.addEntry({
          amount: '0',
          date: entry.date,
          weather: entry.weather || '',
          pickup: si.locationName,
          dropoff: si.locationName,
          pickupTime: si.startTime,
          dropoffTime: si.endTime || si.startTime,
          passengers: '0',
          gender: '',
          purpose: '待機',
          source: '',
          memo: `待機（${si.locationName}）売上記録連動`,
          noPassenger: true,
          paymentMethod: 'cash',
          standbyInfo: si,
        });
      }
    }

    setForm({ date: getLocalDateString(), weather: form.weather, amount: '', paymentMethod: 'cash', discounts: {}, pickup: '', pickupTime: '', dropoff: '', dropoffTime: '', passengers: '1', gender: '', purpose: '', memo: '', source: '', isRegisteredUser: false, customerName: '' });
    setGpsInfo({ pickup: null, dropoff: null });
    setCapturedStandby(null);
    setMapPickerField(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  };

  // レシート撮影 → 背面カメラで無音即時キャプチャし金額を自動入力
  const handleReceiptCapture = async () => {
    setReceiptLoading(true);
    setErrors([]);
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.muted = true;
      await video.play();
      // カメラ安定のため少し待つ
      await new Promise(r => setTimeout(r, 500));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      stream = null;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1];
      // Gemini APIで金額読み取り
      const amount = await GeminiService.analyzeReceiptImage(geminiApiKey, base64, 'image/jpeg');
      if (amount > 0) {
        setForm(prev => ({ ...prev, amount: String(amount) }));
      } else {
        setErrors(['レシートから金額を読み取れませんでした。手動で入力してください。']);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrors(['カメラの使用が許可されていません。ブラウザの設定を確認してください。']);
      } else {
        setErrors([`レシート読み取りエラー: ${err.message}`]);
      }
    } finally {
      if (stream) stream.getTracks().forEach(t => t.stop());
      setReceiptLoading(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(null);
  const confirmDeleteTimeoutRef = useRef(null);

  const handleDelete = useCallback((id) => {
    if (confirmDelete === id) {
      DataService.moveToTrash(id);
      setConfirmDelete(null);
      if (confirmDeleteTimeoutRef.current) { clearTimeout(confirmDeleteTimeoutRef.current); confirmDeleteTimeoutRef.current = null; }
      setRefreshKey(k => k + 1);
    } else {
      setConfirmDelete(id);
      if (confirmDeleteTimeoutRef.current) clearTimeout(confirmDeleteTimeoutRef.current);
      confirmDeleteTimeoutRef.current = setTimeout(() => { setConfirmDelete(null); confirmDeleteTimeoutRef.current = null; }, 3000);
    }
  }, [confirmDelete]);

  // 起動時ゴミ箱自動クリーンアップ
  useEffect(() => { DataService.cleanupTrash(); }, []);

  // 編集機能
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editErrors, setEditErrors] = useState([]);

  const startEdit = useCallback((entry) => {
    // 既存エントリーのデータを編集フォームに展開
    const discountsObj = {};
    if (entry.discounts && Array.isArray(entry.discounts)) {
      entry.discounts.forEach(d => {
        discountsObj[d.type] = String(d.amount || '');
        if (d.type === 'coupon') {
          discountsObj._couponUnitPrice = String(d.unitPrice || d.amount || '');
          discountsObj._couponSheets = String(d.sheets || '1');
        }
      });
    } else if (entry.discountType && entry.discountAmount) {
      discountsObj[entry.discountType] = String(entry.discountAmount);
    }
    setEditForm({
      amount: String((entry.amount || 0) + (entry.discountAmount || 0)),
      date: entry.date || '',
      weather: entry.weather || '',
      paymentMethod: entry.paymentMethod || 'cash',
      discounts: discountsObj,
      pickup: entry.pickup || '',
      pickupTime: entry.pickupTime || '',
      dropoff: entry.dropoff || '',
      dropoffTime: entry.dropoffTime || '',
      passengers: entry.passengers || '1',
      gender: entry.gender || '',
      purpose: entry.purpose || '',
      memo: entry.memo || '',
      source: entry.source || '',
      pickupCoords: entry.pickupCoords || null,
      dropoffCoords: entry.dropoffCoords || null,
      pickupLandmark: entry.pickupLandmark || null,
      dropoffLandmark: entry.dropoffLandmark || null,
      standbyLocation: (entry.standbyInfo && entry.standbyInfo.locationName) || '',
      standbyStartTime: (entry.standbyInfo && entry.standbyInfo.startTime) || '',
      standbyEndTime: (entry.standbyInfo && entry.standbyInfo.endTime) || '',
    });
    setEditingId(entry.id);
    setEditErrors([]);
  }, []);

  const [editGpsLoading, setEditGpsLoading] = useState({ pickup: false, dropoff: false });

  const getEditGpsLocation = useCallback((field) => {
    if (!navigator.geolocation) {
      setEditErrors(['このブラウザではGPS機能が使えません']);
      return;
    }
    setEditGpsLoading(prev => ({ ...prev, [field]: true }));
    setEditErrors([]);
    getAccuratePosition({ accuracyThreshold: 30, timeout: 20000, maxWaitAfterFix: 8000 })
      .then((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = Math.round(position.coords.accuracy);
        const coordsKey = field === 'pickup' ? 'pickupCoords' : 'dropoffCoords';
        const timeField = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
        AppLogger.info(`編集GPS取得 (${field}): ${lat.toFixed(6)}, ${lng.toFixed(6)} 精度${acc}m`);
        // 逆ジオコーディングで住所取得
        const apiKey = TaxiApp.utils.getGoogleMapsApiKey ? TaxiApp.utils.getGoogleMapsApiKey() : (localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.GOOGLE_MAPS_API_KEY) || '');
        if (apiKey && window.google && window.google.maps) {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            setEditGpsLoading(prev => ({ ...prev, [field]: false }));
            if (status === 'OK' && results && results.length > 0) {
              const preferred = TaxiApp.utils.pickBestGeocoderResult ? TaxiApp.utils.pickBestGeocoderResult(results, lat, lng) : results[0];
              const addr = TaxiApp.utils.extractAddress(preferred);
              setEditForm(prev => ({ ...prev, [field]: addr, [timeField]: getNowTime(), [coordsKey]: { lat, lng } }));
              // ランドマーク名を別フィールドに保存（住所は上書きしない）
              if (TaxiApp.utils.findNearbyLandmark) {
                const lmKey = field === 'pickup' ? 'pickupLandmark' : 'dropoffLandmark';
                TaxiApp.utils.findNearbyLandmark(lat, lng).then(lm => {
                  if (lm) setEditForm(prev => ({ ...prev, [lmKey]: lm }));
                }).catch(() => {});
              }
            } else {
              setEditForm(prev => ({ ...prev, [field]: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, [timeField]: getNowTime(), [coordsKey]: { lat, lng } }));
            }
          });
        } else {
          // Nominatimフォールバック
          const nomUrl = TaxiApp.utils.nominatimUrl(lat, lng, 18);
          fetch(nomUrl).then(r => r.json()).then(data => {
            setEditGpsLoading(prev => ({ ...prev, [field]: false }));
            if (data && data.address) {
              const a = data.address;
              const parts = [a.city || a.town || a.village || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || ''].filter(Boolean);
              const shortAddr = parts.join(' ') || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              setEditForm(prev => ({ ...prev, [field]: shortAddr, [timeField]: getNowTime(), [coordsKey]: { lat, lng } }));
            } else {
              setEditForm(prev => ({ ...prev, [field]: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, [timeField]: getNowTime(), [coordsKey]: { lat, lng } }));
            }
          }).catch(() => {
            setEditGpsLoading(prev => ({ ...prev, [field]: false }));
            setEditForm(prev => ({ ...prev, [field]: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, [timeField]: getNowTime(), [coordsKey]: { lat, lng } }));
          });
        }
      })
      .catch((error) => {
        setEditGpsLoading(prev => ({ ...prev, [field]: false }));
        const messages = { 1: 'GPS使用が許可されていません。', 2: '現在地を取得できませんでした。', 3: 'GPS取得がタイムアウトしました。' };
        setEditErrors([messages[error.code] || 'GPS取得に失敗しました']);
      });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm({});
    setEditErrors([]);
    setEditGpsLoading({ pickup: false, dropoff: false });
  }, []);

  const saveEdit = useCallback(() => {
    setEditErrors([]);
    // discountsを保存用に変換
    const d = editForm.discounts || {};
    const discounts = Object.entries(d).filter(([k, v]) => !k.startsWith('_') && v && parseInt(v) > 0).map(([type, amount]) => {
      const item = { type, amount: parseInt(amount) };
      if (type === 'coupon') {
        item.unitPrice = parseInt(d._couponUnitPrice) || parseInt(amount);
        item.sheets = parseInt(d._couponSheets) || 1;
      }
      return item;
    });
    const discountAmount = discounts.filter(dd => dd.type !== 'ticket' && dd.type !== 'coupon').reduce((sum, dd) => sum + dd.amount, 0);
    const couponAmount = discounts.filter(dd => dd.type === 'coupon').reduce((sum, dd) => sum + dd.amount, 0);
    const discountType = discounts.map(dd => dd.type).join(',');

    const updates = {
      ...editForm,
      amount: (parseInt(editForm.amount) || 0) - discountAmount - couponAmount,
      discounts: discounts.filter(dd => dd.type !== 'coupon'),
      discountAmount,
      discountType,
      couponAmount,
      pickupCoords: editForm.pickupCoords || null,
      dropoffCoords: editForm.dropoffCoords || null,
      pickupLandmark: editForm.pickupLandmark || null,
      dropoffLandmark: editForm.dropoffLandmark || null,
      standbyInfo: (editForm.standbyLocation || editForm.standbyStartTime) ? {
        locationName: editForm.standbyLocation || '',
        startTime: editForm.standbyStartTime || '',
        endTime: editForm.standbyEndTime || '',
      } : null,
    };
    delete updates.discounts; // 一旦削除してからセット
    updates.discounts = discounts.filter(dd => dd.type !== 'coupon');

    const result = DataService.updateEntry(editingId, updates);
    if (!result || !result.success) {
      setEditErrors((result && result.errors) || ['保存に失敗しました']);
      return;
    }

    // クーポン未収エントリの管理（既存のクーポンエントリを検索・更新/作成/削除）
    if (result.entry) {
      const couponEntryId = editingId + '_coupon';
      const allEntries = DataService.getRawEntries ? DataService.getRawEntries() : [];
      const existingCoupon = allEntries.find(ce => ce.id === couponEntryId || (ce.memo && ce.memo.includes('クーポン未収') && ce.date === result.entry.date && ce.pickup === result.entry.pickup));
      if (couponAmount > 0) {
        const couponData = {
          amount: couponAmount,
          date: result.entry.date,
          dayOfWeek: result.entry.dayOfWeek,
          holiday: result.entry.holiday || '',
          weather: result.entry.weather || '',
          pickup: result.entry.pickup || '',
          pickupTime: result.entry.pickupTime || '',
          dropoff: result.entry.dropoff || '',
          dropoffTime: result.entry.dropoffTime || '',
          passengers: '', gender: '', purpose: '',
          memo: `クーポン未収（¥${couponAmount.toLocaleString()}）`,
          source: result.entry.source || '',
          noPassenger: false,
          paymentMethod: 'uncollected',
          discounts: [], discountAmount: 0, discountType: '', couponAmount: 0,
        };
        if (existingCoupon) {
          DataService.updateEntry(existingCoupon.id, couponData);
        } else {
          DataService.addEntry({ ...couponData, amount: String(couponAmount), discounts: {} });
        }
      } else if (existingCoupon) {
        DataService.deleteEntry(existingCoupon.id);
      }
    }

    // 編集後: GPSログの乗車/降車イベントも更新
    if (window.GpsLogService && result.entry) {
      const entry = result.entry;
      const dateStr = entry.date || getLocalDateString();
      GpsLogService.updateEvent(dateStr, entry.id, 'pickup', entry.pickupCoords, entry.pickupTime);
      GpsLogService.updateEvent(dateStr, entry.id, 'dropoff', entry.dropoffCoords, entry.dropoffTime);
    }

    // 待機記録との双方向同期: 配車方法が「待機」またはstandbyInfoがある場合、待機記録も更新
    if (result.entry && (updates.source === '待機' || (updates.standbyInfo && updates.standbyInfo.locationName))) {
      const entry = result.entry;
      const si = updates.standbyInfo || {};
      const standbyEntries = DataService.getStandbyEntries();
      // 同じ日付で時刻が一致/近い待機記録を検索（元のstandbyInfoも考慮）
      const origSi = entry.standbyInfo || {};
      const matchingStandby = standbyEntries.find(s => {
        if (s.date !== entry.date) return false;
        const sSi = s.standbyInfo || {};
        const sStart = sSi.startTime || s.pickupTime || '';
        // 元の開始時刻と一致
        if (origSi.startTime && origSi.startTime === sStart) return true;
        // 新しい開始時刻と一致
        if (si.startTime && si.startTime === sStart) return true;
        // 時刻が近い（5分以内）
        if (sStart && si.startTime) {
          const sMin = parseInt(sStart.replace(':',''));
          const eMin = parseInt(si.startTime.replace(':',''));
          if (!isNaN(sMin) && !isNaN(eMin) && Math.abs(sMin - eMin) <= 5) return true;
        }
        return false;
      });
      if (matchingStandby && si.locationName) {
        DataService.updateEntry(matchingStandby.id, {
          pickup: si.locationName,
          dropoff: si.locationName,
          pickupTime: si.startTime,
          dropoffTime: si.endTime,
          standbyInfo: si,
        });
      } else if (!matchingStandby && si.locationName && si.startTime) {
        // 対応する待機記録がなければ新規作成
        DataService.addEntry({
          amount: '0',
          date: entry.date,
          weather: entry.weather || '',
          pickup: si.locationName,
          dropoff: si.locationName,
          pickupTime: si.startTime,
          dropoffTime: si.endTime || si.startTime,
          passengers: '0',
          gender: '',
          purpose: '待機',
          source: '',
          memo: `待機（${si.locationName}）売上記録連動`,
          noPassenger: true,
          paymentMethod: 'cash',
          standbyInfo: si,
        });
      }
    }

    setEditingId(null);
    setEditForm({});
    setEditErrors([]);
    setEditGpsLoading({ pickup: false, dropoff: false });
    setRefreshKey(k => k + 1);
  }, [editingId, editForm]);

  const handleExportCSV = () => {
    DataService.downloadCSV();
  };

  const handleClearAll = () => {
    if (entries.length === 0) return;
    DataService.clearAllEntries();
    setRefreshKey(k => k + 1);
  };


  // GPS取得ボタンのスタイル
  const gpsButtonStyle = (loading, type) => {
    const isPickup = type === 'pickup';
    const baseColor = isPickup ? '26,115,232' : '0,200,83';    // 青 / 緑
    const loadingColor = '249,168,37';                          // 黄
    return {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
      padding: '12px 16px', borderRadius: '10px',
      fontSize: '13px', fontWeight: '700',
      color: loading ? 'var(--color-secondary)' : '#fff',
      cursor: loading ? 'wait' : 'pointer',
      border: loading ? `2px solid rgba(${loadingColor},0.4)` : `2px solid rgba(${baseColor},0.4)`,
      background: loading ? `rgba(${loadingColor},0.15)` : `rgba(${baseColor},0.2)`,
      transition: 'all 0.2s ease',
      whiteSpace: 'nowrap',
      flex: 1,
      minHeight: '44px',
    };
  };
  const mapPickerButtonStyle = (active) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '12px 16px', borderRadius: '10px',
    fontSize: '13px', fontWeight: '700',
    color: '#fff', cursor: 'pointer',
    border: active ? '2px solid rgba(156,39,176,0.6)' : '2px solid rgba(156,39,176,0.3)',
    background: active ? 'rgba(156,39,176,0.6)' : 'rgba(156,39,176,0.2)',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    flex: 1,
    minHeight: '44px',
  });

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'receipt_long'),
      '売上記録'
    ),

    // 入力フォーム
    React.createElement(Card, { title: '新規売上を記録', style: { marginBottom: 'var(--space-lg)' } },
      // バリデーションエラー表示
      errors.length > 0 && React.createElement('div', {
        style: {
          background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.3)',
          borderRadius: '8px', padding: '8px 12px', marginBottom: 'var(--space-md)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '18px', color: 'var(--color-danger)' },
        }, 'error'),
        React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' } },
          errors.join('、')
        )
      ),

      // 保存成功メッセージ
      saved && React.createElement('div', {
        style: {
          background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.3)',
          borderRadius: '8px', padding: '8px 12px', marginBottom: 'var(--space-md)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '18px', color: 'var(--color-accent)' },
        }, 'check_circle'),
        React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-accent)' } },
          '記録を追加しました'
        )
      ),

      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'grid grid--2' },
          // 乗車地（GPS付き）
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '乗車地'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '東京駅',
              value: form.pickup,
              onChange: (e) => { setForm({ ...form, pickup: e.target.value }); if (!e.target.value) setGpsInfo(prev => ({ ...prev, pickup: null })); },
              style: { width: '100%', boxSizing: 'border-box' },
            }),
            React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } },
              React.createElement('button', {
                type: 'button',
                onClick: () => setMapPickerField(mapPickerField === 'pickup' ? null : 'pickup'),
                style: mapPickerButtonStyle(mapPickerField === 'pickup'),
                title: '地図から場所を選択',
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px' } }, 'map'),
                '地図で選択'
              ),
              React.createElement('button', {
                type: 'button',
                onClick: () => getGpsLocation('pickup'),
                disabled: gpsLoading.pickup,
                style: gpsButtonStyle(gpsLoading.pickup, 'pickup'),
                title: 'GPSで現在地を取得（乗車地）',
              },
                React.createElement('span', {
                  className: 'material-icons-round',
                  style: { fontSize: '20px', animation: gpsLoading.pickup ? 'spin 1s linear infinite' : 'none' },
                }, gpsLoading.pickup ? 'sync' : 'my_location'),
                gpsLoading.pickup ? '取得中...' : '🔵 乗車地GPS'
              )
            ),
            // GPS取得結果の住所・座標表示
            gpsInfo.pickup && gpsInfo.pickup.lat != null && React.createElement('div', {
              style: {
                marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
                background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.15)',
                fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5',
              },
            },
              gpsInfo.pickup.address && React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '4px', marginBottom: '3px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px', color: 'var(--color-primary-light)', marginTop: '1px', flexShrink: 0 } }, 'place'),
                React.createElement('span', { style: { fontWeight: '600', color: 'var(--color-primary-light)', wordBreak: 'break-all' } }, gpsInfo.pickup.address)
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '10px', flexWrap: 'wrap' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px', flexShrink: 0 } }, 'gps_fixed'),
                `${gpsInfo.pickup.lat.toFixed(6)}, ${gpsInfo.pickup.lng.toFixed(6)}`,
                gpsInfo.pickup.accuracy && React.createElement('span', {
                  style: { padding: '1px 6px', borderRadius: '3px', fontWeight: '600',
                    background: gpsInfo.pickup.accuracy <= 50 ? 'rgba(0,200,83,0.15)' : gpsInfo.pickup.accuracy <= 200 ? 'rgba(249,168,37,0.15)' : 'rgba(229,57,53,0.15)',
                    color: gpsInfo.pickup.accuracy <= 50 ? '#4caf50' : gpsInfo.pickup.accuracy <= 200 ? '#f9a825' : '#e53935' },
                }, `精度 ${gpsInfo.pickup.accuracy}m`),
                React.createElement('a', { href: `https://www.google.com/maps?q=${gpsInfo.pickup.lat},${gpsInfo.pickup.lng}`, target: '_blank', rel: 'noopener', style: { color: 'var(--color-primary-light)', textDecoration: 'underline' } }, '地図で確認')
              )
            ),
            // 乗車地マップピッカー
            mapPickerField === 'pickup' && React.createElement('div', { style: { marginTop: '6px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '11px', color: 'rgba(156,39,176,0.9)' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'touch_app'),
                '地図をタップして乗車地を選択',
                mapPickerStatus && React.createElement('span', { style: { marginLeft: '8px', color: mapPickerStatus.startsWith('設定完了') ? 'var(--color-accent)' : 'var(--text-muted)' } }, mapPickerStatus)
              ),
              mapsLoaded
                ? React.createElement('div', { ref: mapPickerRef, style: { width: '100%', height: '350px', borderRadius: '8px', border: '2px solid rgba(156,39,176,0.5)', overflow: 'hidden' } })
                : React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } },
                    apiKey ? 'Google Maps を読み込み中...' : '設定画面でGoogle Maps APIキーを入力してください')
            )
          ),

          // 乗車時間
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '乗車時間'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'time',
                value: form.pickupTime,
                onChange: (e) => setForm({ ...form, pickupTime: e.target.value }),
                style: { flex: 1, minWidth: 0, colorScheme: 'dark' },
              }),
              React.createElement('button', {
                type: 'button',
                onClick: () => setForm({ ...form, pickupTime: getNowTime() }),
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                  color: '#fff', cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(0,200,83,0.2)',
                  transition: 'all 0.2s ease', whiteSpace: 'nowrap', flex: '0 0 auto',
                },
                title: '現在時刻をセット',
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'schedule'),
                '現在'
              )
            )
          ),

          // 降車地（GPS付き）
          React.createElement('div', { className: 'form-group', ref: dropoffSectionRef },
            React.createElement('label', { className: 'form-label' }, '降車地'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '渋谷駅',
              value: form.dropoff,
              onChange: (e) => { setForm({ ...form, dropoff: e.target.value }); if (!e.target.value) setGpsInfo(prev => ({ ...prev, dropoff: null })); },
              style: { width: '100%', boxSizing: 'border-box' },
            }),
            React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } },
              React.createElement('button', {
                type: 'button',
                onClick: () => setMapPickerField(mapPickerField === 'dropoff' ? null : 'dropoff'),
                style: mapPickerButtonStyle(mapPickerField === 'dropoff'),
                title: '地図から場所を選択',
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px' } }, 'map'),
                '地図で選択'
              ),
              React.createElement('button', {
                type: 'button',
                onClick: () => getGpsLocation('dropoff'),
                disabled: gpsLoading.dropoff,
                style: gpsButtonStyle(gpsLoading.dropoff, 'dropoff'),
                title: 'GPSで現在地を取得（降車地）',
              },
                React.createElement('span', {
                  className: 'material-icons-round',
                  style: { fontSize: '20px', animation: gpsLoading.dropoff ? 'spin 1s linear infinite' : 'none' },
                }, gpsLoading.dropoff ? 'sync' : 'my_location'),
                gpsLoading.dropoff ? '取得中...' : '🟢 降車地GPS'
              )
            ),
            // GPS取得結果の住所・座標表示
            gpsInfo.dropoff && gpsInfo.dropoff.lat != null && React.createElement('div', {
              style: {
                marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
                background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.15)',
                fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5',
              },
            },
              gpsInfo.dropoff.address && React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '4px', marginBottom: '3px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px', color: 'var(--color-accent)', marginTop: '1px', flexShrink: 0 } }, 'place'),
                React.createElement('span', { style: { fontWeight: '600', color: 'var(--color-accent)', wordBreak: 'break-all' } }, gpsInfo.dropoff.address)
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '10px', flexWrap: 'wrap' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px', flexShrink: 0 } }, 'gps_fixed'),
                `${gpsInfo.dropoff.lat.toFixed(6)}, ${gpsInfo.dropoff.lng.toFixed(6)}`,
                gpsInfo.dropoff.accuracy && React.createElement('span', {
                  style: { padding: '1px 6px', borderRadius: '3px', fontWeight: '600',
                    background: gpsInfo.dropoff.accuracy <= 50 ? 'rgba(0,200,83,0.15)' : gpsInfo.dropoff.accuracy <= 200 ? 'rgba(249,168,37,0.15)' : 'rgba(229,57,53,0.15)',
                    color: gpsInfo.dropoff.accuracy <= 50 ? '#4caf50' : gpsInfo.dropoff.accuracy <= 200 ? '#f9a825' : '#e53935' },
                }, `精度 ${gpsInfo.dropoff.accuracy}m`),
                React.createElement('a', { href: `https://www.google.com/maps?q=${gpsInfo.dropoff.lat},${gpsInfo.dropoff.lng}`, target: '_blank', rel: 'noopener', style: { color: 'var(--color-primary-light)', textDecoration: 'underline' } }, '地図で確認')
              )
            ),
            // 降車地マップピッカー
            mapPickerField === 'dropoff' && React.createElement('div', { style: { marginTop: '6px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '11px', color: 'rgba(156,39,176,0.9)' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'touch_app'),
                '地図をタップして降車地を選択',
                mapPickerStatus && React.createElement('span', { style: { marginLeft: '8px', color: mapPickerStatus.startsWith('設定完了') ? 'var(--color-accent)' : 'var(--text-muted)' } }, mapPickerStatus)
              ),
              mapsLoaded
                ? React.createElement('div', { ref: mapPickerRef, style: { width: '100%', height: '350px', borderRadius: '8px', border: '2px solid rgba(156,39,176,0.5)', overflow: 'hidden' } })
                : React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } },
                    apiKey ? 'Google Maps を読み込み中...' : '設定画面でGoogle Maps APIキーを入力してください')
            ),
          ),

          // 降車時間
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '降車時間'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'time',
                value: form.dropoffTime,
                onChange: (e) => setForm({ ...form, dropoffTime: e.target.value }),
                style: { flex: 1, minWidth: 0, colorScheme: 'dark' },
              }),
              React.createElement('button', {
                type: 'button',
                onClick: () => setForm({ ...form, dropoffTime: getNowTime() }),
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                  color: '#fff', cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(0,200,83,0.2)',
                  transition: 'all 0.2s ease', whiteSpace: 'nowrap', flex: '0 0 auto',
                },
                title: '現在時刻をセット',
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'schedule'),
                '現在'
              )
            )
          ),

          // 待機情報（GPS検出・微調整可能）
          capturedStandby && capturedStandby.locationName && React.createElement('div', {
            style: {
              padding: '10px 12px', borderRadius: '8px',
              background: 'rgba(255, 167, 38, 0.08)',
              border: '1px solid rgba(255, 167, 38, 0.25)',
              fontSize: '12px', color: '#ffa726',
              marginBottom: 'var(--space-md)',
            },
          },
            // ヘッダー行
            React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' },
            },
              React.createElement('span', {
                className: 'material-icons-round',
                style: { fontSize: '16px', color: '#ffa726' },
              }, 'hourglass_top'),
              React.createElement('span', { style: { fontWeight: 600, fontSize: '12px' } }, '待機情報（GPS検出）'),
              React.createElement('span', { style: { fontSize: '10px', color: 'rgba(255,167,38,0.6)', marginLeft: 'auto' } }, 'タップで微調整')
            ),
            // 待機場所（プルダウン＋自由入力）
            React.createElement('div', { style: { marginBottom: '6px' } },
              React.createElement('label', { style: { fontSize: '10px', color: 'rgba(255,167,38,0.7)', display: 'block', marginBottom: '2px' } }, '待機場所'),
              React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                React.createElement('select', {
                  value: (() => {
                    const locs = APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
                    const spots = [];
                    if (locs && locs.waitingSpots) locs.waitingSpots.forEach(s => spots.push(s.name));
                    if (APP_CONSTANTS.KNOWN_PLACES) APP_CONSTANTS.KNOWN_PLACES.forEach(p => { if (!spots.includes(p.name)) spots.push(p.name); });
                    return spots.includes(capturedStandby.locationName) ? capturedStandby.locationName : '__custom__';
                  })(),
                  onChange: (e) => {
                    if (e.target.value !== '__custom__') {
                      setCapturedStandby({ ...capturedStandby, locationName: e.target.value });
                    }
                  },
                  style: {
                    flex: 1, padding: '5px 8px', borderRadius: '6px',
                    border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)',
                    color: 'var(--text-primary)', fontSize: '12px', colorScheme: 'dark',
                  },
                },
                  ...(() => {
                    const locs = APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
                    const spots = [];
                    if (locs && locs.waitingSpots) locs.waitingSpots.forEach(s => spots.push(s.name));
                    if (APP_CONSTANTS.KNOWN_PLACES) APP_CONSTANTS.KNOWN_PLACES.forEach(p => { if (!spots.includes(p.name)) spots.push(p.name); });
                    const options = spots.map(name => React.createElement('option', { key: name, value: name }, name));
                    if (!spots.includes(capturedStandby.locationName)) {
                      options.unshift(React.createElement('option', { key: '__custom__', value: '__custom__' }, capturedStandby.locationName + '（GPS検出）'));
                    }
                    return options;
                  })()
                ),
                React.createElement('input', {
                  type: 'text',
                  value: capturedStandby.locationName,
                  onChange: (e) => setCapturedStandby({ ...capturedStandby, locationName: e.target.value }),
                  style: {
                    flex: 1, padding: '5px 8px', borderRadius: '6px',
                    border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)',
                    color: 'var(--text-primary)', fontSize: '12px',
                  },
                  placeholder: '自由入力',
                })
              )
            ),
            // 待機時間（開始〜終了）
            React.createElement('div', null,
              React.createElement('label', { style: { fontSize: '10px', color: 'rgba(255,167,38,0.7)', display: 'block', marginBottom: '2px' } }, '待機時間'),
              React.createElement('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
                React.createElement('input', {
                  type: 'time',
                  value: capturedStandby.startTimeHHMM || '',
                  onChange: (e) => setCapturedStandby({ ...capturedStandby, startTimeHHMM: e.target.value }),
                  style: {
                    flex: 1, padding: '5px 8px', borderRadius: '6px',
                    border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)',
                    color: 'var(--text-primary)', fontSize: '12px', colorScheme: 'dark',
                  },
                }),
                React.createElement('span', { style: { fontSize: '12px', color: 'rgba(255,167,38,0.7)' } }, '〜'),
                React.createElement('input', {
                  type: 'time',
                  value: capturedStandby.endTimeHHMM || '',
                  onChange: (e) => setCapturedStandby({ ...capturedStandby, endTimeHHMM: e.target.value }),
                  style: {
                    flex: 1, padding: '5px 8px', borderRadius: '6px',
                    border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)',
                    color: 'var(--text-primary)', fontSize: '12px', colorScheme: 'dark',
                  },
                }),
                // 経過時間表示
                (() => {
                  const s = capturedStandby.startTimeHHMM;
                  const e = capturedStandby.endTimeHHMM;
                  if (s && e) {
                    const [sh, sm] = s.split(':').map(Number);
                    const [eh, em] = e.split(':').map(Number);
                    const diff = (eh * 60 + em) - (sh * 60 + sm);
                    if (diff > 0) return React.createElement('span', { style: { fontSize: '10px', color: 'rgba(255,167,38,0.6)', whiteSpace: 'nowrap' } }, `${diff}分`);
                  }
                  return null;
                })()
              )
            )
          ),

          // 日付（自動：本日 + 曜日・祝日を自動計算）
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '日付 *',
              React.createElement('span', {
                style: { fontSize: '10px', color: 'var(--color-accent)', fontWeight: '400', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,200,83,0.1)' },
              }, '自動')
            ),
            React.createElement('input', {
              className: 'form-input',
              type: 'date',
              value: form.date,
              onChange: (e) => setForm({ ...form, date: e.target.value }),
              required: true,
              style: { colorScheme: 'dark' },
            }),
            // 曜日・祝日の自動表示
            form.date && (() => {
              const info = JapaneseHolidays.getDateInfo(form.date);
              const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-secondary)';
              return React.createElement('div', {
                style: { marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
              },
                React.createElement('span', {
                  style: {
                    fontSize: '13px', fontWeight: '600', color: dayColor,
                    padding: '2px 10px', borderRadius: '4px',
                    background: info.isSunday || info.isHoliday ? 'rgba(239,68,68,0.12)' : info.isSaturday ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.06)',
                  },
                }, `${info.dayOfWeek}曜日`),
                info.holiday && React.createElement('span', {
                  style: {
                    fontSize: '12px', fontWeight: '600', color: '#ef4444',
                    padding: '2px 10px', borderRadius: '4px',
                    background: 'rgba(239,68,68,0.12)',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  },
                },
                  React.createElement('span', { style: { fontSize: '13px' } }, '🎌'),
                  info.holiday
                )
              );
            })()
          ),

          // 天候（自動取得 + 手動変更可）
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '天候',
              weatherLoading && React.createElement('span', {
                style: { fontSize: '11px', color: 'var(--color-secondary)', fontWeight: '400', animation: 'pulse 1.5s ease-in-out infinite' },
              }, '取得中...'),
              !weatherLoading && form.weather && React.createElement('span', {
                style: { fontSize: '10px', color: 'var(--color-accent)', fontWeight: '400', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,200,83,0.1)' },
              }, '自動取得済'),
              !weatherLoading && form.temperature != null && React.createElement('span', {
                style: { fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '400', marginLeft: '4px' },
              }, `${form.temperature}℃`)
            ),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              ...[
                { value: '晴れ', icon: '☀️' },
                { value: '曇り', icon: '☁️' },
                { value: '雨', icon: '🌧️' },
                { value: '雪', icon: '❄️' },
              ].map(w =>
                React.createElement('button', {
                  key: w.value,
                  type: 'button',
                  onClick: () => setForm({ ...form, weather: form.weather === w.value ? '' : w.value }),
                  style: {
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '8px 14px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: form.weather === w.value ? '700' : '400',
                    cursor: 'pointer',
                    border: form.weather === w.value ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: form.weather === w.value ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
                    color: form.weather === w.value ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  },
                },
                  React.createElement('span', { style: { fontSize: '16px' } }, w.icon),
                  w.value
                )
              )
            )
          ),

          // 配車方法
          React.createElement('div', { className: 'form-group', ref: sourceSectionRef },
            React.createElement('label', { className: 'form-label' }, '配車方法'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              ...[
                { value: 'Go', icon: '🟢' },
                { value: 'Uber', icon: '⚫' },
                { value: 'DIDI', icon: '🟠' },
                { value: '電話', icon: '📞' },
                { value: '流し', icon: '🚕' },
                { value: '待機', icon: '🅿' },
              ].map(s =>
                React.createElement('button', {
                  key: s.value,
                  type: 'button',
                  onClick: () => setForm({ ...form, source: form.source === s.value ? '' : s.value }),
                  style: {
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '8px 14px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: form.source === s.value ? '700' : '400',
                    cursor: 'pointer',
                    border: form.source === s.value ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: form.source === s.value ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
                    color: form.source === s.value ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  },
                },
                  React.createElement('span', { style: { fontSize: '16px' } }, s.icon),
                  s.value
                )
              )
            )
          ),

          // 金額
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '金額 (税込・円) *'),
            React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'number',
                min: '1',
                max: '1000000',
                placeholder: '3500',
                value: form.amount,
                onChange: (e) => { setForm({ ...form, amount: e.target.value }); setErrors([]); },
                required: true,
                style: { flex: 1 },
              }),
              geminiApiKey && React.createElement('button', {
                type: 'button',
                onClick: handleReceiptCapture,
                disabled: receiptLoading,
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: receiptLoading ? 'var(--bg-secondary)' : 'var(--bg-card)',
                  color: 'var(--text-primary)', cursor: receiptLoading ? 'wait' : 'pointer',
                  fontSize: '14px', whiteSpace: 'nowrap', minWidth: '44px',
                },
                title: 'レシート撮影で金額を読み取る',
              },
                receiptLoading
                  ? React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', animation: 'spin 1s linear infinite' } }, 'sync')
                  : React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px' } }, 'camera_alt')
              )
            ),
            // 税内訳表示
            form.amount && parseInt(form.amount) > 0 && (() => {
              const taxIncluded = parseInt(form.amount);
              const taxExcluded = Math.floor(taxIncluded / 1.1);
              const tax = taxIncluded - taxExcluded;
              return React.createElement('div', {
                style: {
                  marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
                  background: 'rgba(249,168,37,0.08)', border: '1px solid rgba(249,168,37,0.15)',
                  fontSize: '12px', color: 'var(--text-secondary)',
                  display: 'flex', gap: '12px', flexWrap: 'wrap',
                },
              },
                React.createElement('span', null, `税抜: ¥${taxExcluded.toLocaleString()}`),
                React.createElement('span', { style: { color: 'var(--color-warning)' } }, `消費税: ¥${tax.toLocaleString()}`),
                React.createElement('span', null, `税込: ¥${taxIncluded.toLocaleString()}`)
              );
            })()
          ),

          // 支払い方法
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '支払い方法'),
            React.createElement('div', { style: { display: 'flex', gap: '8px' } },
              ...['cash', 'uncollected', 'didi', 'uber'].map(method => {
                const selected = form.paymentMethod === method;
                const label = method === 'cash' ? '現金' : method === 'didi' ? 'DIDI決済' : method === 'uber' ? 'Uber' : '未収';
                const icon = method === 'cash' ? 'payments' : method === 'didi' ? 'smartphone' : method === 'uber' ? 'hail' : 'pending';
                const activeColor = method === 'cash' ? 'var(--color-accent)' : method === 'didi' ? 'var(--color-warning)' : method === 'uber' ? '#fff' : 'var(--color-error)';
                const activeBg = method === 'cash' ? 'rgba(0,200,83,0.15)' : method === 'didi' ? 'rgba(255,152,0,0.15)' : method === 'uber' ? 'rgba(0,0,0,0.3)' : 'rgba(229,57,53,0.15)';
                return React.createElement('button', {
                  key: method,
                  type: 'button',
                  onClick: () => setForm({ ...form, paymentMethod: method }),
                  style: {
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '10px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: selected ? 700 : 400,
                    cursor: 'pointer',
                    border: selected ? `2px solid ${activeColor}` : '1px solid rgba(255,255,255,0.15)',
                    background: selected ? activeBg : 'rgba(255,255,255,0.05)',
                    color: selected ? activeColor : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  },
                },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, icon),
                  label
                );
              })
            )
          ),

          // 割引（複数選択可）
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '割引（複数選択可）'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              ...['disability', 'longDistance', 'coupon', 'ticket'].map(dtype => {
                const selected = dtype in (form.discounts || {});
                const labels = { disability: '障害者割引', longDistance: '遠距離割', coupon: 'クーポン', ticket: 'タクシーチケット' };
                const icons = { disability: 'accessible', longDistance: 'route', coupon: 'local_offer', ticket: 'confirmation_number' };
                return React.createElement('div', { key: dtype, style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: dtype === 'coupon' ? 'wrap' : 'nowrap' } },
                  React.createElement('button', {
                    type: 'button',
                    onClick: () => {
                      const d = { ...(form.discounts || {}) };
                      if (selected) {
                        delete d[dtype]; if (dtype === 'coupon') { delete d._couponUnitPrice; delete d._couponSheets; }
                        setForm({ ...form, discounts: d });
                      } else {
                        if (dtype === 'ticket') {
                          d[dtype] = form.amount || '';
                          setForm({ ...form, discounts: d, paymentMethod: 'uncollected' });
                        } else {
                          d[dtype] = ''; if (dtype === 'coupon') { d._couponUnitPrice = ''; d._couponSheets = '1'; }
                          setForm({ ...form, discounts: d });
                        }
                      }
                    },
                    style: {
                      flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                      padding: '8px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: selected ? 700 : 400,
                      cursor: 'pointer', minWidth: '120px',
                      border: selected ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.15)',
                      background: selected ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
                      color: selected ? '#a78bfa' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                    },
                  },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, icons[dtype]),
                    labels[dtype]
                  ),
                  // クーポン: 単価 × 枚数
                  dtype === 'coupon' && selected && React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flex: 1, minWidth: '200px' } },
                    React.createElement('input', {
                      className: 'form-input', type: 'number', min: '0', max: '100000',
                      placeholder: '1枚の金額',
                      value: (form.discounts || {})._couponUnitPrice || '',
                      onChange: (e) => {
                        const unitPrice = e.target.value;
                        const sheets = (form.discounts || {})._couponSheets || '1';
                        const total = (parseInt(unitPrice) || 0) * (parseInt(sheets) || 0);
                        setForm({ ...form, discounts: { ...(form.discounts || {}), _couponUnitPrice: unitPrice, _couponSheets: sheets, coupon: String(total || '') } });
                      },
                      style: { flex: 1, minWidth: '70px' },
                    }),
                    React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, '円 ×'),
                    React.createElement('input', {
                      className: 'form-input', type: 'number', min: '1', max: '100',
                      placeholder: '枚数',
                      value: (form.discounts || {})._couponSheets || '',
                      onChange: (e) => {
                        const sheets = e.target.value;
                        const unitPrice = (form.discounts || {})._couponUnitPrice || '';
                        const total = (parseInt(unitPrice) || 0) * (parseInt(sheets) || 0);
                        setForm({ ...form, discounts: { ...(form.discounts || {}), _couponSheets: sheets, _couponUnitPrice: unitPrice, coupon: String(total || '') } });
                      },
                      style: { width: '50px' },
                    }),
                    React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, '枚'),
                    (parseInt((form.discounts || {}).coupon) || 0) > 0 && React.createElement('span', { style: { fontSize: '12px', color: '#a78bfa', fontWeight: 700, whiteSpace: 'nowrap' } },
                      `= ¥${parseInt((form.discounts || {}).coupon).toLocaleString()}`
                    )
                  ),
                  // その他の割引: 金額入力
                  dtype !== 'coupon' && selected && React.createElement('input', {
                    className: 'form-input',
                    type: 'number',
                    min: '0',
                    max: '1000000',
                    placeholder: `${labels[dtype]}金額`,
                    value: (form.discounts || {})[dtype] || '',
                    onChange: (e) => setForm({ ...form, discounts: { ...(form.discounts || {}), [dtype]: e.target.value } }),
                    style: { flex: 1 },
                  }),
                  dtype !== 'coupon' && selected && React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, '円')
                );
              })
            ),
            (() => {
              const d = form.discounts || {};
              const amt = parseInt(form.amount) || 0;
              const disabilityAmt = parseInt(d.disability) || 0;
              const longDistanceAmt = parseInt(d.longDistance) || 0;
              const couponAmt = parseInt(d.coupon) || 0;
              const ticketAmt = parseInt(d.ticket) || 0;
              const discountOnly = disabilityAmt + longDistanceAmt;
              const totalDeduction = discountOnly + couponAmt + ticketAmt;
              const remaining = amt - totalDeduction;
              if (totalDeduction > 0 && amt > 0) {
                const payLabel = form.paymentMethod === 'cash' ? '現金' : form.paymentMethod === 'didi' ? 'DIDI決済' : form.paymentMethod === 'uber' ? 'Uber' : '未収';
                return React.createElement('div', {
                  style: {
                    marginTop: '6px', padding: '8px 10px', borderRadius: '6px',
                    background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)',
                    fontSize: '12px', color: 'var(--text-secondary)',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  },
                },
                  React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                    React.createElement('span', null, `金額: ¥${amt.toLocaleString()}`)
                  ),
                  disabilityAmt > 0 && React.createElement('div', { style: { color: '#a78bfa' } },
                    `障害者割引: -¥${disabilityAmt.toLocaleString()}`
                  ),
                  longDistanceAmt > 0 && React.createElement('div', { style: { color: '#a78bfa' } },
                    `遠距離割: -¥${longDistanceAmt.toLocaleString()}`
                  ),
                  couponAmt > 0 && React.createElement('div', { style: { color: '#a78bfa' } },
                    `クーポン: -¥${couponAmt.toLocaleString()}（別途未収として記録）`
                  ),
                  ticketAmt > 0 && React.createElement('div', { style: { color: '#a78bfa' } },
                    `チケット: -¥${ticketAmt.toLocaleString()}`
                  ),
                  React.createElement('div', {
                    style: { borderTop: '1px solid rgba(167,139,250,0.2)', paddingTop: '4px', marginTop: '2px', fontWeight: 700, color: 'var(--color-accent)' },
                  },
                    `お支払い（${payLabel}）: ¥${Math.max(0, remaining).toLocaleString()}`
                  )
                );
              }
              return null;
            })()
          ),

          // お客様人数
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'お客様人数'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              ...['1', '2', '3', '4'].map(n =>
                React.createElement('button', {
                  key: n,
                  type: 'button',
                  onClick: () => setForm({ ...form, passengers: n }),
                  style: {
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '44px', height: '44px', borderRadius: '8px',
                    fontSize: '15px', fontWeight: form.passengers === n ? '700' : '400',
                    cursor: 'pointer',
                    border: form.passengers === n ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: form.passengers === n ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
                    color: form.passengers === n ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  },
                }, `${n}名`)
              ),
              React.createElement('input', {
                className: 'form-input',
                type: 'number',
                min: '1',
                max: '99',
                placeholder: '5+',
                value: !['1','2','3','4'].includes(form.passengers) ? form.passengers : '',
                onChange: (e) => setForm({ ...form, passengers: e.target.value }),
                onFocus: () => { if (['1','2','3','4'].includes(form.passengers)) setForm({ ...form, passengers: '' }); },
                style: { width: '60px', minWidth: '60px', flex: '0 0 auto', textAlign: 'center', fontSize: '14px' },
              })
            )
          ),

          // お客様性別
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'お客様性別'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              ...[
                { value: '男性', icon: '👨' },
                { value: '女性', icon: '👩' },
                { value: '混合', icon: '👥' },
              ].map(g =>
                React.createElement('button', {
                  key: g.value,
                  type: 'button',
                  onClick: () => setForm({ ...form, gender: form.gender === g.value ? '' : g.value }),
                  style: {
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '8px 14px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: form.gender === g.value ? '700' : '400',
                    cursor: 'pointer',
                    border: form.gender === g.value ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: form.gender === g.value ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
                    color: form.gender === g.value ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  },
                },
                  React.createElement('span', { style: { fontSize: '16px' } }, g.icon),
                  g.value
                )
              )
            )
          ),

          // 用途
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label' }, '用途'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              ...[
                { value: '通勤', icon: '🏢' },
                { value: '通院', icon: '🏥' },
                { value: '買物', icon: '🛒' },
                { value: '観光', icon: '📸' },
                { value: '出張', icon: '💼' },
                { value: '送迎', icon: '🚗' },
                { value: '空港', icon: '✈️' },
                { value: '飲食', icon: '🍺' },
                { value: 'パチンコ', icon: '🎰' },
                { value: '駅移動', icon: '🚉' },
              ].map(p =>
                React.createElement('button', {
                  key: p.value,
                  type: 'button',
                  onClick: () => setForm({ ...form, purpose: form.purpose === p.value ? '' : p.value }),
                  style: {
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '8px 12px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: form.purpose === p.value ? '700' : '400',
                    cursor: 'pointer',
                    border: form.purpose === p.value ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: form.purpose === p.value ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
                    color: form.purpose === p.value ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  },
                },
                  React.createElement('span', { style: { fontSize: '14px' } }, p.icon),
                  p.value
                )
              )
            )
          ),

          // ユーザー（リピーター登録）
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label' }, 'ユーザー（リピーター）'),
            React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
              React.createElement('button', {
                type: 'button',
                onClick: () => setForm({ ...form, isRegisteredUser: !form.isRegisteredUser, customerName: form.isRegisteredUser ? '' : form.customerName }),
                style: {
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 16px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: form.isRegisteredUser ? '700' : '400',
                  cursor: 'pointer',
                  border: form.isRegisteredUser ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.15)',
                  background: form.isRegisteredUser ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  color: form.isRegisteredUser ? '#f59e0b' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                },
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, form.isRegisteredUser ? 'person' : 'person_outline'),
                'ユーザー'
              )
            ),
            // ユーザーON時に登録済み顧客リスト + 名前入力を表示
            form.isRegisteredUser && (() => {
              const allEntries = DataService.getEntries();
              const registered = allEntries.filter(e => e.isRegisteredUser && e.customerName);
              const byName = {};
              registered.forEach(e => {
                const n = e.customerName;
                if (!byName[n]) byName[n] = { count: 0, total: 0, lastDate: '', topArea: {}, lastPayment: 'cash' };
                byName[n].count++;
                byName[n].total += e.amount || 0;
                const d = e.date || '';
                if (d > byName[n].lastDate) byName[n].lastDate = d;
                if (e.pickup) byName[n].topArea[e.pickup] = (byName[n].topArea[e.pickup] || 0) + 1;
                byName[n].lastPayment = e.paymentMethod || 'cash';
              });
              const customers = Object.entries(byName)
                .map(([name, d]) => {
                  const topArea = Object.entries(d.topArea).sort((a, b) => b[1] - a[1])[0];
                  return { name, count: d.count, total: d.total, lastDate: d.lastDate, topArea: topArea ? topArea[0] : '', lastPayment: d.lastPayment };
                })
                .sort((a, b) => b.count - a.count);
              return React.createElement('div', { style: { marginTop: '8px' } },
                // 登録済み顧客ボタン
                customers.length > 0 && React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' } },
                  ...customers.map(c => React.createElement('button', {
                    key: c.name, type: 'button',
                    onClick: () => setForm({ ...form, customerName: c.name, paymentMethod: 'cash' }),
                    style: {
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '6px 12px', borderRadius: '16px', cursor: 'pointer',
                      fontSize: '12px', fontWeight: form.customerName === c.name ? 700 : 400,
                      border: form.customerName === c.name ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.12)',
                      background: form.customerName === c.name ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                      color: form.customerName === c.name ? '#f59e0b' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                    },
                  },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: 14 } }, 'person'),
                    c.name,
                    React.createElement('span', { style: { fontSize: 10, color: 'var(--text-muted)' } }, `${c.count}回`)
                  ))
                ),
                // 選択中の顧客情報
                form.customerName && byName[form.customerName] && React.createElement('div', {
                  style: { padding: '8px 10px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: '8px', fontSize: '11px', color: 'var(--text-secondary)' },
                },
                  React.createElement('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                    React.createElement('span', null, `利用${byName[form.customerName].count}回`),
                    React.createElement('span', null, `累計¥${byName[form.customerName].total.toLocaleString()}`),
                    customers.find(c => c.name === form.customerName)?.topArea && React.createElement('span', null, `よく乗車: ${customers.find(c => c.name === form.customerName).topArea}`),
                    React.createElement('span', null, `最終: ${byName[form.customerName].lastDate}`)
                  )
                ),
                // 名前入力（新規 or 編集）
                React.createElement('input', {
                  className: 'form-input',
                  type: 'text',
                  placeholder: 'お客様の名前（選択 or 入力）',
                  value: form.customerName,
                  onChange: (e) => setForm({ ...form, customerName: e.target.value }),
                  style: { fontSize: '14px' },
                })
              );
            })()
          ),

          // メモ
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'メモ'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '任意のメモ',
              value: form.memo,
              onChange: (e) => setForm({ ...form, memo: e.target.value }),
            })
          )
        ),
        React.createElement(Button, {
          variant: 'primary',
          icon: 'add',
          style: { marginTop: 'var(--space-md)', width: '100%', padding: '16px 24px', fontSize: '16px', fontWeight: '700', minHeight: '56px', borderRadius: '12px' },
        }, '記録を追加')
      )
    ),

    // データ管理ツールバー
    React.createElement(Card, { style: { marginBottom: 'var(--space-md)' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-primary-light)' } }, 'folder'),
        React.createElement('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, 'データ管理'),
        entries.length > 0 && React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' } },
          `全 ${entries.length} 件の記録`
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        // 保存先フォルダ選択
        React.createElement(Button, {
          variant: 'secondary',
          icon: DataService.hasSaveFolder() ? 'folder_open' : 'create_new_folder',
          onClick: async () => {
            const result = await DataService.selectSaveFolder();
            if (result.success) {
              setSaved(false); setErrors([]);
              alert('保存先フォルダを設定しました: ' + result.folderName + '\n\n記録の追加時に自動保存されます。');
              setRefreshKey(k => k + 1);
            } else {
              if (result.message) alert(result.message);
            }
          },
          style: { padding: '6px 12px', fontSize: '11px' },
        }, DataService.hasSaveFolder() ? '保存先変更' : '保存先フォルダ設定'),
        // 手動保存
        entries.length > 0 && React.createElement(Button, {
          variant: 'secondary',
          icon: 'save',
          onClick: () => DataService.manualSaveToFile(),
          style: { padding: '6px 12px', fontSize: '11px' },
        }, 'JSON保存'),
        // CSVエクスポート
        entries.length > 0 && React.createElement(Button, {
          variant: 'secondary',
          icon: 'download',
          onClick: handleExportCSV,
          style: { padding: '6px 12px', fontSize: '11px' },
        }, 'CSV出力'),
        // ファイルから復元
        React.createElement(Button, {
          variant: 'secondary',
          icon: 'upload_file',
          onClick: async () => {
            const result = await DataService.importFromFile();
            if (result.success) {
              setRefreshKey(k => k + 1);
              alert(result.message);
            } else {
              if (result.message) alert(result.message);
            }
          },
          style: { padding: '6px 12px', fontSize: '11px' },
        }, 'ファイル復元'),
        // 全削除
        entries.length > 0 && React.createElement(Button, {
          variant: 'danger',
          icon: 'delete_forever',
          onClick: () => { if (confirm('全ての売上記録を削除しますか？この操作は取り消せません。')) handleClearAll(); },
          style: { padding: '6px 12px', fontSize: '11px' },
        }, '全削除')
      ),
      // 保存先フォルダ状態表示
      React.createElement('div', {
        style: { marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, 'info'),
        DataService.hasSaveFolder()
          ? '保存先フォルダ設定済み — 「売上記録」サブフォルダに自動保存されます'
          : '保存先フォルダ未設定 — 記録追加時にダウンロードとして保存されます'
      )
    ),

    // 記録一覧
    entries.length > 0 && React.createElement(Card, { title: `記録一覧（${entries.length}件）` },
      entries.map(entry =>
        editingId === entry.id
        // ===== 編集モード =====
        ? React.createElement('div', {
            key: entry.id,
            style: {
              padding: '12px 0',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(26,115,232,0.03)',
              borderRadius: '8px',
              margin: '4px 0',
              padding: '12px',
            },
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)' } }, 'edit'),
              React.createElement('span', { style: { fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-light)' } }, '記録を編集')
            ),
            // 乗車地（GPS付き）
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)' } }, '乗車地'),
                React.createElement('button', {
                  type: 'button',
                  onClick: () => getEditGpsLocation('pickup'),
                  disabled: editGpsLoading.pickup,
                  style: { display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0,200,83,0.4)', background: 'rgba(0,200,83,0.1)', color: 'var(--color-accent)', fontSize: '11px', cursor: 'pointer' },
                },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, editGpsLoading.pickup ? 'hourglass_top' : 'gps_fixed'),
                  editGpsLoading.pickup ? 'GPS取得中...' : 'GPS'
                )
              ),
              React.createElement('input', { type: 'text', value: editForm.pickup || '', onChange: (e) => setEditForm({ ...editForm, pickup: e.target.value }), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }, placeholder: '乗車地' }),
              editForm.pickupCoords && React.createElement('div', { style: { fontSize: '10px', color: 'var(--color-accent)', marginTop: '2px' } }, `${editForm.pickupCoords.lat.toFixed(5)}, ${editForm.pickupCoords.lng.toFixed(5)}`)
            ),
            // 乗車時間
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '乗車時間'),
              React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
                React.createElement('input', { type: 'time', value: editForm.pickupTime || '', onChange: (e) => setEditForm({ ...editForm, pickupTime: e.target.value }), style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' } }),
                React.createElement('button', { type: 'button', onClick: () => setEditForm({ ...editForm, pickupTime: getNowTime() }),
                  style: { display: 'flex', alignItems: 'center', gap: '3px', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#fff', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,200,83,0.2)', whiteSpace: 'nowrap' },
                }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'schedule'), '現在')
              )
            ),
            // 降車地（GPS付き）
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)' } }, '降車地'),
                React.createElement('button', {
                  type: 'button',
                  onClick: () => getEditGpsLocation('dropoff'),
                  disabled: editGpsLoading.dropoff,
                  style: { display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0,200,83,0.4)', background: 'rgba(0,200,83,0.1)', color: 'var(--color-accent)', fontSize: '11px', cursor: 'pointer' },
                },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, editGpsLoading.dropoff ? 'hourglass_top' : 'gps_fixed'),
                  editGpsLoading.dropoff ? 'GPS取得中...' : 'GPS'
                )
              ),
              React.createElement('input', { type: 'text', value: editForm.dropoff || '', onChange: (e) => setEditForm({ ...editForm, dropoff: e.target.value }), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }, placeholder: '降車地' }),
              editForm.dropoffCoords && React.createElement('div', { style: { fontSize: '10px', color: 'var(--color-accent)', marginTop: '2px' } }, `${editForm.dropoffCoords.lat.toFixed(5)}, ${editForm.dropoffCoords.lng.toFixed(5)}`)
            ),
            // 降車時間
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '降車時間'),
              React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
                React.createElement('input', { type: 'time', value: editForm.dropoffTime || '', onChange: (e) => setEditForm({ ...editForm, dropoffTime: e.target.value }), style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' } }),
                React.createElement('button', { type: 'button', onClick: () => setEditForm({ ...editForm, dropoffTime: getNowTime() }),
                  style: { display: 'flex', alignItems: 'center', gap: '3px', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#fff', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,200,83,0.2)', whiteSpace: 'nowrap' },
                }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'schedule'), '現在')
              )
            ),
            // 待機場所
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: '#ffa726', display: 'block', marginBottom: '2px' } }, '待機場所'),
              React.createElement('input', {
                type: 'text', value: editForm.standbyLocation || '',
                onChange: (e) => setEditForm({ ...editForm, standbyLocation: e.target.value }),
                style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' },
                placeholder: '例: 旭川駅',
              })
            ),
            // 待機時間（開始〜終了）
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: '#ffa726', display: 'block', marginBottom: '2px' } }, '待機時間'),
              React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                React.createElement('input', {
                  type: 'time', value: editForm.standbyStartTime || '',
                  onChange: (e) => setEditForm({ ...editForm, standbyStartTime: e.target.value }),
                  style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' },
                }),
                React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, '〜'),
                React.createElement('input', {
                  type: 'time', value: editForm.standbyEndTime || '',
                  onChange: (e) => setEditForm({ ...editForm, standbyEndTime: e.target.value }),
                  style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' },
                })
              )
            ),
            // 天候（ボタン選択 — 新規フォームと同じ）
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '天候'),
              React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                ...['晴れ', '曇り', '雨', '雪'].map(w => React.createElement('button', {
                  key: w, type: 'button',
                  onClick: () => setEditForm({ ...editForm, weather: editForm.weather === w ? '' : w }),
                  style: {
                    padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: editForm.weather === w ? 700 : 400,
                    cursor: 'pointer', border: editForm.weather === w ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: editForm.weather === w ? 'rgba(26,115,232,0.15)' : 'rgba(255,255,255,0.05)',
                    color: editForm.weather === w ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                  },
                }, w))
              )
            ),
            // 配車方法（新規フォームと同じ選択肢）
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '配車方法'),
              React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                ...['Go', 'Uber', 'DIDI', '電話', '流し', '待機'].map(s => React.createElement('button', {
                  key: s, type: 'button',
                  onClick: () => setEditForm({ ...editForm, source: editForm.source === s ? '' : s }),
                  style: {
                    padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: editForm.source === s ? 700 : 400,
                    cursor: 'pointer', border: editForm.source === s ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: editForm.source === s ? 'rgba(26,115,232,0.15)' : 'rgba(255,255,255,0.05)',
                    color: editForm.source === s ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                  },
                }, s))
              )
            ),
            // 金額
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '金額 (税込・円)'),
              React.createElement('input', { type: 'number', min: '1', max: '1000000', value: editForm.amount || '', onChange: (e) => setEditForm({ ...editForm, amount: e.target.value }), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 700, boxSizing: 'border-box' }, placeholder: '金額' }),
              // 税内訳表示
              editForm.amount && parseInt(editForm.amount) > 0 && (() => {
                const taxIncluded = parseInt(editForm.amount);
                const taxExcluded = Math.floor(taxIncluded / 1.1);
                const tax = taxIncluded - taxExcluded;
                return React.createElement('div', {
                  style: {
                    marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
                    background: 'rgba(249,168,37,0.08)', border: '1px solid rgba(249,168,37,0.15)',
                    fontSize: '12px', color: 'var(--text-secondary)',
                    display: 'flex', gap: '12px', flexWrap: 'wrap',
                  },
                },
                  React.createElement('span', null, `税抜: ¥${taxExcluded.toLocaleString()}`),
                  React.createElement('span', { style: { color: 'var(--color-warning)' } }, `消費税: ¥${tax.toLocaleString()}`),
                  React.createElement('span', null, `税込: ¥${taxIncluded.toLocaleString()}`)
                );
              })()
            ),
            // 支払い方法
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '支払い方法'),
              React.createElement('div', { style: { display: 'flex', gap: '6px' } },
                ...['cash', 'uncollected', 'didi', 'uber'].map(method => {
                  const selected = editForm.paymentMethod === method;
                  const label = method === 'cash' ? '現金' : method === 'didi' ? 'DIDI決済' : method === 'uber' ? 'Uber' : '未収';
                  const activeColor = method === 'cash' ? 'var(--color-accent)' : method === 'didi' ? 'var(--color-warning)' : method === 'uber' ? '#fff' : 'var(--color-error)';
                  const activeBg = method === 'cash' ? 'rgba(0,200,83,0.15)' : method === 'didi' ? 'rgba(255,152,0,0.15)' : method === 'uber' ? 'rgba(0,0,0,0.3)' : 'rgba(229,57,53,0.15)';
                  return React.createElement('button', {
                    key: method, type: 'button',
                    onClick: () => setEditForm({ ...editForm, paymentMethod: method }),
                    style: {
                      flex: 1, padding: '6px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: selected ? 700 : 400,
                      cursor: 'pointer',
                      border: selected ? `2px solid ${activeColor}` : '1px solid rgba(255,255,255,0.15)',
                      background: selected ? activeBg : 'rgba(255,255,255,0.05)',
                      color: selected ? activeColor : 'var(--text-secondary)',
                    },
                  }, label);
                })
              )
            ),
            // 割引（複数選択可）
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' } }, '割引（複数選択可）'),
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                ...['disability', 'longDistance', 'coupon', 'ticket'].map(dtype => {
                  const sel = dtype in (editForm.discounts || {});
                  const labels = { disability: '障害者割引', longDistance: '遠距離割', coupon: 'クーポン', ticket: 'タクシーチケット' };
                  const icons = { disability: 'accessible', longDistance: 'route', coupon: 'local_offer', ticket: 'confirmation_number' };
                  return React.createElement('div', { key: dtype, style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: dtype === 'coupon' ? 'wrap' : 'nowrap' } },
                    React.createElement('button', {
                      type: 'button',
                      onClick: () => {
                        const dd = { ...(editForm.discounts || {}) };
                        if (sel) {
                          delete dd[dtype]; if (dtype === 'coupon') { delete dd._couponUnitPrice; delete dd._couponSheets; }
                          setEditForm({ ...editForm, discounts: dd });
                        } else {
                          if (dtype === 'ticket') {
                            dd[dtype] = editForm.amount || '';
                            setEditForm({ ...editForm, discounts: dd, paymentMethod: 'uncollected' });
                          } else {
                            dd[dtype] = ''; if (dtype === 'coupon') { dd._couponUnitPrice = ''; dd._couponSheets = '1'; }
                            setEditForm({ ...editForm, discounts: dd });
                          }
                        }
                      },
                      style: {
                        flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: sel ? 700 : 400,
                        cursor: 'pointer', minWidth: '110px',
                        border: sel ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.15)',
                        background: sel ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
                        color: sel ? '#a78bfa' : 'var(--text-secondary)',
                      },
                    },
                      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, icons[dtype]),
                      labels[dtype]
                    ),
                    dtype === 'coupon' && sel && React.createElement('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', flex: 1, minWidth: '180px' } },
                      React.createElement('input', { type: 'number', min: '0', placeholder: '1枚金額', value: (editForm.discounts || {})._couponUnitPrice || '',
                        onChange: (e) => { const up = e.target.value; const sh = (editForm.discounts || {})._couponSheets || '1'; const tot = (parseInt(up) || 0) * (parseInt(sh) || 0); setEditForm({ ...editForm, discounts: { ...(editForm.discounts || {}), _couponUnitPrice: up, _couponSheets: sh, coupon: String(tot || '') } }); },
                        style: { flex: 1, minWidth: '55px', padding: '4px 6px', borderRadius: '4px', border: '1px solid rgba(167,139,250,0.3)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' } }),
                      React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, '円×'),
                      React.createElement('input', { type: 'number', min: '1', placeholder: '枚', value: (editForm.discounts || {})._couponSheets || '',
                        onChange: (e) => { const sh = e.target.value; const up = (editForm.discounts || {})._couponUnitPrice || ''; const tot = (parseInt(up) || 0) * (parseInt(sh) || 0); setEditForm({ ...editForm, discounts: { ...(editForm.discounts || {}), _couponSheets: sh, _couponUnitPrice: up, coupon: String(tot || '') } }); },
                        style: { width: '40px', padding: '4px 6px', borderRadius: '4px', border: '1px solid rgba(167,139,250,0.3)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' } }),
                      React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, '枚'),
                      (parseInt((editForm.discounts || {}).coupon) || 0) > 0 && React.createElement('span', { style: { fontSize: '11px', color: '#a78bfa', fontWeight: 700 } },
                        `= ¥${parseInt((editForm.discounts || {}).coupon).toLocaleString()}`)
                    ),
                    dtype !== 'coupon' && sel && React.createElement('input', { type: 'number', min: '0', placeholder: `${labels[dtype]}金額`, value: (editForm.discounts || {})[dtype] || '',
                      onChange: (e) => setEditForm({ ...editForm, discounts: { ...(editForm.discounts || {}), [dtype]: e.target.value } }),
                      style: { flex: 1, padding: '4px 6px', borderRadius: '4px', border: '1px solid rgba(167,139,250,0.3)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' } }),
                    dtype !== 'coupon' && sel && React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, '円')
                  );
                })
              ),
              // 割引サマリー
              (() => {
                const d = editForm.discounts || {};
                const totalDiscount = Object.entries(d).filter(([k]) => !k.startsWith('_')).reduce((s, [, v]) => s + (parseInt(v) || 0), 0);
                const amt = parseInt(editForm.amount) || 0;
                const couponAmt = parseInt(d.coupon) || 0;
                const cashAfterDiscount = amt - totalDiscount;
                const cashReceived = cashAfterDiscount - couponAmt;
                if (totalDiscount > 0 && amt > 0) {
                  return React.createElement('div', {
                    style: {
                      marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
                      background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)',
                      fontSize: '12px', color: 'var(--text-secondary)',
                      display: 'flex', flexDirection: 'column', gap: '4px',
                    },
                  },
                    React.createElement('div', { style: { display: 'flex', gap: '12px' } },
                      React.createElement('span', null, `割引合計: -¥${totalDiscount.toLocaleString()}`),
                      React.createElement('span', null, `割引後: ¥${cashAfterDiscount.toLocaleString()}`),
                      React.createElement('span', { style: { color: '#a78bfa' } },
                        `割引率: ${Math.round((totalDiscount / amt) * 100)}%`)
                    ),
                    couponAmt > 0 && React.createElement('div', { style: { display: 'flex', gap: '12px', color: '#a78bfa' } },
                      React.createElement('span', null, `クーポン未収: ¥${couponAmt.toLocaleString()}`),
                      React.createElement('span', { style: { fontWeight: 700 } }, `現金受取: ¥${Math.max(0, cashReceived).toLocaleString()}`)
                    )
                  );
                }
                return null;
              })()
            ),
            // お客様人数
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, 'お客様人数'),
              React.createElement('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
                ...['1', '2', '3', '4'].map(n => React.createElement('button', {
                  key: n, type: 'button',
                  onClick: () => setEditForm({ ...editForm, passengers: n }),
                  style: {
                    width: '40px', height: '40px', borderRadius: '6px', fontSize: '13px', fontWeight: editForm.passengers === n ? 700 : 400,
                    cursor: 'pointer', border: editForm.passengers === n ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: editForm.passengers === n ? 'rgba(26,115,232,0.15)' : 'rgba(255,255,255,0.05)',
                    color: editForm.passengers === n ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                  },
                }, `${n}名`)),
                React.createElement('input', { type: 'number', min: '1', max: '99', placeholder: '5+',
                  value: !['1','2','3','4'].includes(editForm.passengers) ? (editForm.passengers || '') : '',
                  onChange: (e) => setEditForm({ ...editForm, passengers: e.target.value }),
                  onFocus: () => { if (['1','2','3','4'].includes(editForm.passengers)) setEditForm({ ...editForm, passengers: '' }); },
                  style: { width: '50px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', textAlign: 'center' } })
              )
            ),
            // お客様性別（混合追加）
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, 'お客様性別'),
              React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                ...[{ v: '男性', e: '\uD83D\uDC68' }, { v: '女性', e: '\uD83D\uDC69' }, { v: '混合', e: '\uD83D\uDC65' }].map(g => React.createElement('button', {
                  key: g.v, type: 'button',
                  onClick: () => setEditForm({ ...editForm, gender: editForm.gender === g.v ? '' : g.v }),
                  style: {
                    padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: editForm.gender === g.v ? 700 : 400,
                    cursor: 'pointer', border: editForm.gender === g.v ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: editForm.gender === g.v ? 'rgba(26,115,232,0.15)' : 'rgba(255,255,255,0.05)',
                    color: editForm.gender === g.v ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                  },
                }, g.e + ' ' + g.v))
              )
            ),
            // 用途
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '用途'),
              React.createElement('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
                ...[
                  { v: '通勤', e: '\uD83D\uDCBC' }, { v: '通院', e: '\uD83C\uDFE5' }, { v: '買物', e: '\uD83D\uDED2' },
                  { v: '観光', e: '\uD83D\uDDFC' }, { v: '出張', e: '\u2708\uFE0F' }, { v: '送迎', e: '\uD83D\uDE97' },
                  { v: '空港', e: '\uD83D\uDEEB' }, { v: '飲食', e: '\uD83C\uDF7B' }, { v: 'パチンコ', e: '\uD83C\uDFB0' },
                  { v: '駅移動', e: '\uD83D\uDE89' },
                ].map(p => React.createElement('button', {
                  key: p.v, type: 'button',
                  onClick: () => setEditForm({ ...editForm, purpose: editForm.purpose === p.v ? '' : p.v }),
                  style: {
                    padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: editForm.purpose === p.v ? 700 : 400,
                    cursor: 'pointer', border: editForm.purpose === p.v ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: editForm.purpose === p.v ? 'rgba(26,115,232,0.15)' : 'rgba(255,255,255,0.05)',
                    color: editForm.purpose === p.v ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                  },
                }, p.e + ' ' + p.v))
              )
            ),
            // メモ
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, 'メモ'),
              React.createElement('input', { type: 'text', value: editForm.memo || '', onChange: (e) => setEditForm({ ...editForm, memo: e.target.value }), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }, placeholder: 'メモ' })
            ),
            // エラー
            editErrors.length > 0 && React.createElement('div', { style: { color: 'var(--color-error)', fontSize: '12px', marginBottom: '8px' } }, editErrors.join(', ')),
            // 保存・キャンセル
            React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
              React.createElement('button', {
                type: 'button', onClick: cancelEdit,
                style: { padding: '6px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' },
              }, 'キャンセル'),
              React.createElement('button', {
                type: 'button', onClick: saveEdit,
                style: { padding: '6px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '2px solid var(--color-primary)', background: 'rgba(26,115,232,0.15)', color: 'var(--color-primary-light)' },
              }, '保存')
            )
          )
        // ===== 通常表示モード =====
        : React.createElement('div', {
          key: entry.id,
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          },
        },
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' } },
              entry.pickupTime && React.createElement('span', {
                style: { fontSize: '11px', color: 'var(--color-primary-light)', fontWeight: '600', padding: '1px 6px', borderRadius: '3px', background: 'rgba(26,115,232,0.12)' },
              }, entry.pickupTime),
              React.createElement('span', null, `${entry.pickup || '---'}`),
              React.createElement('span', { style: { color: 'var(--text-muted)', margin: '0 2px' } }, '→'),
              entry.dropoffTime && React.createElement('span', {
                style: { fontSize: '11px', color: 'var(--color-accent)', fontWeight: '600', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,200,83,0.12)' },
              }, entry.dropoffTime),
              React.createElement('span', null, `${entry.dropoff || '---'}`)
            ),
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' } },
              (() => {
                const eDate = entry.date || getLocalDateString(new Date(entry.timestamp));
                const info = entry.dayOfWeek ? { dayOfWeek: entry.dayOfWeek, holiday: entry.holiday, isSunday: entry.dayOfWeek === '日', isSaturday: entry.dayOfWeek === '土', isHoliday: !!entry.holiday } : JapaneseHolidays.getDateInfo(eDate);
                const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-muted)';
                return React.createElement(React.Fragment, null,
                  React.createElement('span', null, eDate),
                  React.createElement('span', { style: { color: dayColor, fontWeight: '600' } }, `(${info.dayOfWeek})`),
                  info.holiday && React.createElement('span', {
                    style: { color: '#ef4444', fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(239,68,68,0.1)' },
                  }, info.holiday),
                  entry.weather && React.createElement('span', null, entry.weather),
                  entry.passengers && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' },
                  }, `${entry.passengers}名`),
                  entry.gender && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' },
                  }, entry.gender),
                  entry.purpose && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(26,115,232,0.1)', color: 'var(--color-primary-light)' },
                  }, entry.purpose),
                  entry.source && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255,152,0,0.15)', color: '#ffb74d', fontWeight: '600' },
                  }, entry.source),
                  entry.isRegisteredUser && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '2px' },
                  },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '10px' } }, 'person'),
                    entry.customerName || 'ユーザー'
                  ),
                  React.createElement('span', null, new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })),
                  entry.memo && React.createElement('span', null, `| ${entry.memo}`)
                );
              })()
            )
          ),
          React.createElement('div', { style: { marginRight: '12px', textAlign: 'right' } },
            entry.noPassenger
              ? React.createElement('div', null,
                  React.createElement('div', { style: { fontWeight: 700, color: '#d32f2f', fontSize: 'var(--font-size-lg)' } }, '¥0（空車）'),
                  entry.memo && entry.memo.includes('自動記録') && React.createElement('div', { style: { fontSize: '9px', color: '#ff9800', marginTop: '1px' } }, 'GPS自動検出')
                )
              : React.createElement('div', { style: { fontWeight: 700, color: 'var(--color-secondary)', fontSize: 'var(--font-size-lg)' } }, `¥${entry.amount.toLocaleString()}`),
            !entry.noPassenger && React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(entry.amount / 1.1).toLocaleString()} 税¥${(entry.amount - Math.floor(entry.amount / 1.1)).toLocaleString()}`),
            entry.paymentMethod === 'uncollected' && React.createElement('div', {
              style: { fontSize: '10px', color: 'var(--color-error)', fontWeight: 600, marginTop: '2px' }
            }, '未収'),
            entry.paymentMethod === 'didi' && React.createElement('div', {
              style: { fontSize: '10px', color: 'var(--color-warning)', fontWeight: 600, marginTop: '2px' }
            }, 'DIDI決済'),
            entry.paymentMethod === 'uber' && React.createElement('div', {
              style: { fontSize: '10px', color: '#fff', fontWeight: 600, marginTop: '2px', background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: '3px', display: 'inline-block' }
            }, 'Uber'),
            (entry.discountAmount > 0 || entry.couponAmount > 0 || (entry.discounts && Array.isArray(entry.discounts) && entry.discounts.some(d => d.type === 'ticket' || d.type === 'coupon'))) && React.createElement('div', {
              style: { fontSize: '10px', marginTop: '3px', padding: '3px 6px', borderRadius: '4px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }
            },
              (() => {
                const typeLabels = { disability: '障害者割引', longDistance: '遠距離割', coupon: 'クーポン', ticket: 'タクシーチケット' };
                if (entry.discounts && Array.isArray(entry.discounts) && entry.discounts.length > 0) {
                  const realDiscounts = entry.discounts.filter(d => d.type !== 'ticket' && d.type !== 'coupon');
                  const paymentDiscounts = entry.discounts.filter(d => d.type === 'ticket' || d.type === 'coupon');
                  return React.createElement(React.Fragment, null,
                    ...realDiscounts.map((d, i) => React.createElement('div', { key: i, style: { color: '#a78bfa', fontWeight: 600 } },
                      `${typeLabels[d.type] || d.type}: -¥${(d.amount || 0).toLocaleString()}`
                    )),
                    realDiscounts.length > 1 && React.createElement('div', { style: { color: '#a78bfa', fontWeight: 700, borderTop: '1px solid rgba(167,139,250,0.2)', marginTop: '2px', paddingTop: '2px' } },
                      `割引合計: -¥${entry.discountAmount.toLocaleString()}`
                    ),
                    entry.discountAmount > 0 && React.createElement('div', { style: { color: 'var(--text-muted)', marginTop: '1px' } },
                      `割引前: ¥${(entry.amount + entry.discountAmount).toLocaleString()}`
                    ),
                    ...paymentDiscounts.map((d, i) => React.createElement('div', { key: 'pay' + i, style: { color: '#a78bfa', fontWeight: 600, marginTop: (realDiscounts.length > 0 || i > 0) ? '3px' : '0', borderTop: (realDiscounts.length > 0 || i > 0) ? '1px solid rgba(167,139,250,0.2)' : 'none', paddingTop: (realDiscounts.length > 0 || i > 0) ? '3px' : '0' } },
                      d.type === 'coupon' && d.sheets
                        ? `${typeLabels[d.type]}: ¥${(d.unitPrice || d.amount).toLocaleString()} × ${d.sheets}枚 = ¥${(d.amount || 0).toLocaleString()}（未収）`
                        : `${typeLabels[d.type]}: ¥${(d.amount || 0).toLocaleString()}（未収）`
                    ))
                  );
                }
                // 旧フォーマットフォールバック or couponAmountのみ
                if (entry.discountAmount > 0) {
                  return React.createElement(React.Fragment, null,
                    React.createElement('div', { style: { color: '#a78bfa', fontWeight: 600 } },
                      typeLabels[entry.discountType] || entry.discountType || '割引'
                    ),
                    React.createElement('div', { style: { color: 'var(--text-muted)', marginTop: '1px' } },
                      `割引前: ¥${(entry.amount + entry.discountAmount + (entry.couponAmount || 0)).toLocaleString()}`
                    ),
                    React.createElement('div', { style: { color: '#a78bfa' } },
                      `割引額: -¥${entry.discountAmount.toLocaleString()}`
                    ),
                    entry.couponAmount > 0 && React.createElement('div', { style: { color: '#a78bfa', marginTop: '2px' } },
                      `クーポン: -¥${entry.couponAmount.toLocaleString()}（別途未収）`
                    )
                  );
                }
                if (entry.couponAmount > 0) {
                  return React.createElement('div', { style: { color: '#a78bfa', fontWeight: 600 } },
                    `クーポン: -¥${entry.couponAmount.toLocaleString()}（別途未収）`
                  );
                }
                return null;
              })()
            )
          ),
          // 編集・削除ボタン
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            React.createElement('button', {
              onClick: () => startEdit(entry),
              style: {
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-primary-light)', padding: '4px',
                borderRadius: '4px', transition: 'color 0.2s',
              },
              title: '編集',
            },
              React.createElement('span', {
                className: 'material-icons-round',
                style: { fontSize: '18px' },
              }, 'edit')
            ),
            React.createElement('button', {
              onClick: () => handleDelete(entry.id),
              style: {
                background: 'none', border: 'none', cursor: 'pointer',
                color: confirmDelete === entry.id ? 'var(--color-danger)' : 'var(--text-muted)', padding: '4px',
                borderRadius: '4px', transition: 'color 0.2s',
              },
              title: confirmDelete === entry.id ? 'もう一度押して削除' : '削除',
            },
              React.createElement('span', {
                className: 'material-icons-round',
                style: { fontSize: '18px' },
              }, confirmDelete === entry.id ? 'delete_forever' : 'delete_outline')
            )
          )
        )
      )
    )
  );
};

})();
