(function() {
// RivalRide.jsx - 他社乗車情報記録ページ
window.RivalRidePage = () => {
  const { useState, useEffect, useCallback, useRef, useMemo } = React;

  const todayDefault = getLocalDateString();

  const getNowTime = TaxiApp.utils.getNowTime;

  const wmoToWeather = (code) => TaxiApp.utils.wmoToWeather(code, '');

  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ date: todayDefault, time: getNowTime(), weather: '', temperature: null, location: '', locationCoords: null, memo: '' });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsInfo, setGpsInfo] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const weatherFetched = useRef(false);
  const locationFetched = useRef(false);
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  const { apiKey } = useAppContext();

  // ページロード時に天気を自動取得（GPSキャッシュ優先）
  useEffect(() => {
    if (weatherFetched.current) return;
    weatherFetched.current = true;

    // GPSキャッシュから天気取得を試みる
    const cached = GpsLogService.getCurrentWeather();
    if (cached && cached.weather) {
      setForm(prev => prev.weather ? prev : { ...prev, weather: cached.weather, temperature: cached.temperature != null ? cached.temperature : null });
      AppLogger.info(`他社乗車 天気GPSキャッシュ使用: ${cached.weather} ${cached.temperature}℃`);
      return;
    }

    if (!navigator.geolocation) return;
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
            AppLogger.info(`他社乗車 天気自動取得成功: ${w} ${temp != null ? temp + '℃' : ''}`);
          }
        }
      })
      .catch(() => setWeatherLoading(false));
  }, []);

  // ページロード時にGPS場所を自動取得
  useEffect(() => {
    if (locationFetched.current) return;
    locationFetched.current = true;
    getGpsLocationAuto();
  }, []);

  const getGpsLocationAuto = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    getAccuratePosition({ accuracyThreshold: 50, timeout: 20000, maxWaitAfterFix: 8000 })
      .then((position) => {
        setGpsInfo(prev => ({ ...prev, accuracy: Math.round(position.coords.accuracy) }));
        reverseGeocode(position.coords.latitude, position.coords.longitude, false);
      })
      .catch(() => setGpsLoading(false));
  };

  const getGpsLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setErrors(['このブラウザではGPS機能が使えません']);
      return;
    }
    setGpsLoading(true);
    setErrors([]);
    getAccuratePosition({ accuracyThreshold: 30, timeout: 20000, maxWaitAfterFix: 8000 })
      .then((position) => {
        setGpsInfo(prev => ({ ...prev, accuracy: Math.round(position.coords.accuracy) }));
        reverseGeocode(position.coords.latitude, position.coords.longitude, true);
      })
      .catch((error) => {
        setGpsLoading(false);
        const messages = {
          1: 'GPS使用が許可されていません。ブラウザの設定を確認してください。',
          2: '現在地を取得できませんでした。',
          3: 'GPS取得がタイムアウトしました。',
        };
        setErrors([messages[error.code] || 'GPS取得に失敗しました']);
      });
  }, [apiKey]);

  // GPS解決時に自動記録追加
  const autoAddEntry = (location, coords) => {
    const cur = formRef.current;
    const entryData = { date: cur.date, time: getNowTime(), weather: cur.weather, location, locationCoords: coords, memo: cur.memo };
    const result = DataService.addRivalEntry(entryData);
    if (result.success) {
      setForm({ date: getLocalDateString(), time: getNowTime(), weather: cur.weather, location: '', locationCoords: null, memo: '' });
      setGpsInfo(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setRefreshKey(k => k + 1);
    }
  };

  // 逆ジオコーディング共通処理（autoAdd=trueでGPS解決時に自動記録追加）
  const reverseGeocode = (lat, lng, autoAdd) => {
    // 最優先: 座標ベースの既知場所マッチング
    const knownPlace = TaxiApp.utils.matchKnownPlace(lat, lng);
    if (knownPlace) {
      setGpsLoading(false);
      AppLogger.info(`他社乗車 既知場所マッチ: ${knownPlace}`);
      if (autoAdd) {
        autoAddEntry(knownPlace, { lat, lng });
      } else {
        setForm(prev => ({ ...prev, location: knownPlace, locationCoords: { lat, lng }, time: getNowTime() }));
        setGpsInfo(prev => ({ ...prev, lat, lng, address: knownPlace }));
      }
      return;
    }
    if (apiKey && window.google && window.google.maps) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        setGpsLoading(false);
        if (status === 'OK' && results && results.length > 0) {
          const best = TaxiApp.utils.pickBestGeocoderResult(results, lat, lng);
          const address = _formatRivalAddress(best);
          const fullAddress = best.formatted_address.replace(/、日本$/, '').replace(/^日本、/, '');
          AppLogger.info(`他社乗車 GPS逆ジオコーディング成功: ${address}`);
          if (autoAdd) {
            autoAddEntry(address, { lat, lng });
            // ランドマーク名で後から更新
            TaxiApp.utils.findNearbyLandmark(lat, lng).then(lm => {
              if (lm && lm !== address) {
                AppLogger.info(`他社乗車 ランドマーク検出: ${lm}`);
                // 直近追加エントリの場所名を更新
                const rivals = DataService.getRivalEntries();
                if (rivals.length > 0 && rivals[0].location === address) {
                  DataService.updateRivalEntry(rivals[0].id, { location: lm });
                }
              }
            }).catch(() => {});
          } else {
            setForm(prev => ({ ...prev, location: address, locationCoords: { lat, lng }, time: getNowTime() }));
            setGpsInfo(prev => ({ ...prev, lat, lng, address: fullAddress }));
            // ランドマーク名で上書き試行
            TaxiApp.utils.findNearbyLandmark(lat, lng).then(lm => {
              if (lm) {
                AppLogger.info(`他社乗車 ランドマーク検出: ${lm}`);
                setForm(prev => prev.location === address ? { ...prev, location: lm } : prev);
              }
            }).catch(() => {});
          }
        } else {
          nominatimFallback(lat, lng, autoAdd);
        }
      });
    } else {
      nominatimFallback(lat, lng, autoAdd);
    }
  };

  const nominatimFallback = (lat, lng, autoAdd) => {
    const nomUrl = TaxiApp.utils.nominatimUrl(lat, lng, 18);
    fetch(nomUrl)
      .then(res => res.json())
      .then(data => {
        setGpsLoading(false);
        if (data && data.address) {
          const a = data.address;
          const parts = [a.city || a.town || a.village || a.county || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || ''].filter(Boolean);
          const shortAddr = parts.join(' ') || data.display_name.split(',').slice(0, 3).join(' ');
          AppLogger.info(`他社乗車 Nominatim逆ジオコーディング成功: ${shortAddr}`);
          if (autoAdd) {
            autoAddEntry(shortAddr, { lat, lng });
          } else {
            setForm(prev => ({ ...prev, location: shortAddr, locationCoords: { lat, lng }, time: getNowTime() }));
            setGpsInfo(prev => ({ ...prev, lat, lng, address: data.display_name || shortAddr }));
          }
        } else {
          const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          if (autoAdd) {
            autoAddEntry(coordStr, { lat, lng });
          } else {
            setForm(prev => ({ ...prev, location: coordStr, locationCoords: { lat, lng }, time: getNowTime() }));
            setGpsInfo(prev => ({ ...prev, lat, lng, address: null }));
          }
        }
      })
      .catch(() => {
        setGpsLoading(false);
        const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        if (autoAdd) {
          autoAddEntry(coordStr, { lat, lng });
        } else {
          setForm(prev => ({ ...prev, location: coordStr, locationCoords: { lat, lng } }));
          setGpsInfo(prev => ({ ...prev, lat, lng, address: null }));
        }
      });
  };

  const _formatRivalAddress = TaxiApp.utils.formatAddress;

  const entries = useMemo(() => DataService.getRivalEntries(), [refreshKey]);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.RIVAL_RIDES) {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('storage', handleStorage);
    const handleVisibility = () => {
      if (!document.hidden) setRefreshKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('taxi-data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors([]);
    const result = DataService.addRivalEntry(form);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setForm({ date: getLocalDateString(), time: getNowTime(), weather: form.weather, location: '', locationCoords: null, memo: '' });
    setGpsInfo(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  };

  const handleDelete = useCallback((id) => {
    DataService.deleteRivalEntry(id);
    setRefreshKey(k => k + 1);
  }, []);

  const handleExportCSV = () => {
    DataService.downloadRivalCSV();
  };

  const handleClearAll = () => {
    if (entries.length === 0) return;
    DataService.clearAllRivalEntries();
    setRefreshKey(k => k + 1);
  };

  const gpsButtonStyle = (loading) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
    padding: '8px 12px', borderRadius: '6px',
    fontSize: '11px', fontWeight: '600',
    color: loading ? 'var(--color-secondary)' : '#fff',
    cursor: loading ? 'wait' : 'pointer',
    border: '1px solid rgba(255,255,255,0.15)',
    background: loading ? 'rgba(249,168,37,0.15)' : 'rgba(26,115,232,0.2)',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    minWidth: '0',
    flex: '0 0 auto',
  });

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'local_taxi'),
      '他社乗車情報'
    ),

    // 記録件数
    React.createElement(Card, { style: { marginBottom: 'var(--space-lg)', textAlign: 'center' } },
      React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, '他社乗車記録'),
      React.createElement('div', {
        style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)', margin: '8px 0' },
      }, `${entries.length} 件`),
      React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' } },
        entries.length > 0 ? `最新: ${entries[0].date} ${entries[0].time}` : 'まだ記録がありません'
      )
    ),

    // 入力フォーム
    React.createElement(Card, { title: '他社乗車を記録', style: { marginBottom: 'var(--space-lg)' } },
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
          // 日付
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '年月日 *',
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

          // 時間
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '時間 *',
              React.createElement('span', {
                style: { fontSize: '10px', color: 'var(--color-accent)', fontWeight: '400', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,200,83,0.1)' },
              }, '自動')
            ),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'time',
                value: form.time,
                onChange: (e) => setForm({ ...form, time: e.target.value }),
                required: true,
                style: { flex: 1, minWidth: 0, colorScheme: 'dark' },
              }),
              React.createElement('button', {
                type: 'button',
                onClick: () => setForm({ ...form, time: getNowTime() }),
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

          // 天候
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '天気',
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

          // 乗車場所（GPS付き）
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '乗車場所 *',
              gpsLoading && React.createElement('span', {
                style: { fontSize: '11px', color: 'var(--color-secondary)', fontWeight: '400', animation: 'pulse 1.5s ease-in-out infinite' },
              }, '取得中...'),
              !gpsLoading && form.location && React.createElement('span', {
                style: { fontSize: '10px', color: 'var(--color-accent)', fontWeight: '400', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,200,83,0.1)' },
              }, 'GPS取得済')
            ),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'text',
                placeholder: '東京駅前',
                value: form.location,
                onChange: (e) => { setForm({ ...form, location: e.target.value }); if (!e.target.value) setGpsInfo(null); },
                required: true,
                style: { flex: 1, minWidth: 0 },
              }),
              React.createElement('button', {
                type: 'button',
                onClick: getGpsLocation,
                disabled: gpsLoading,
                style: gpsButtonStyle(gpsLoading),
                title: 'GPSで現在地を取得',
              },
                React.createElement('span', {
                  className: 'material-icons-round',
                  style: { fontSize: '16px', animation: gpsLoading ? 'spin 1s linear infinite' : 'none' },
                }, gpsLoading ? 'sync' : 'my_location'),
                gpsLoading ? '取得中' : 'GPS'
              )
            ),
            gpsInfo && gpsInfo.lat && React.createElement('div', {
              style: {
                marginTop: '6px', padding: '8px 10px', borderRadius: '6px',
                background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.15)',
                fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6',
              },
            },
              gpsInfo.address && React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '4px', marginBottom: '4px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px', color: 'var(--color-primary-light)', marginTop: '1px', flexShrink: 0 } }, 'place'),
                React.createElement('span', { style: { fontWeight: '600', color: 'var(--color-primary-light)', wordBreak: 'break-all' } }, gpsInfo.address)
              ),
              // 座標 + 精度
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '10px', flexWrap: 'wrap' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px', flexShrink: 0 } }, 'gps_fixed'),
                `${gpsInfo.lat.toFixed(6)}, ${gpsInfo.lng.toFixed(6)}`,
                gpsInfo.accuracy && React.createElement('span', {
                  style: {
                    padding: '1px 6px', borderRadius: '3px', fontWeight: '600',
                    background: gpsInfo.accuracy <= 50 ? 'rgba(0,200,83,0.15)' : gpsInfo.accuracy <= 200 ? 'rgba(249,168,37,0.15)' : 'rgba(229,57,53,0.15)',
                    color: gpsInfo.accuracy <= 50 ? '#4caf50' : gpsInfo.accuracy <= 200 ? '#f9a825' : '#e53935',
                  },
                }, `精度 ${gpsInfo.accuracy}m`)
              ),
              // Google Maps で確認リンク
              React.createElement('div', { style: { marginTop: '4px' } },
                React.createElement('a', {
                  href: `https://www.google.com/maps?q=${gpsInfo.lat},${gpsInfo.lng}`,
                  target: '_blank',
                  rel: 'noopener',
                  style: { fontSize: '10px', color: 'var(--color-primary-light)', textDecoration: 'underline' },
                }, 'Google Mapsで位置を確認'),
              ),
              // 精度が低い場合のガイド
              gpsInfo.accuracy && gpsInfo.accuracy > 100 && React.createElement('div', {
                style: {
                  marginTop: '6px', padding: '6px 8px', borderRadius: '4px',
                  background: 'rgba(249,168,37,0.1)', border: '1px solid rgba(249,168,37,0.2)',
                  fontSize: '10px', color: '#f9a825', lineHeight: '1.5',
                },
              },
                React.createElement('div', { style: { fontWeight: '600', marginBottom: '2px' } }, 'GPS精度が低い場合:'),
                React.createElement('div', null, '・Androidの設定 → 位置情報 → 「正確な位置情報」をON'),
                React.createElement('div', null, '・Chromeの権限 → 位置情報 → 「正確な位置情報」を許可'),
                React.createElement('div', null, '・屋外で再取得すると精度が向上します')
              )
            )
          ),

          // メモ
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label' }, 'メモ'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '任意のメモ',
              value: form.memo,
              onChange: (e) => setForm({ ...form, memo: e.target.value }),
            })
          ),

          // 送信ボタン
          React.createElement('div', { style: { gridColumn: '1 / -1', marginTop: 'var(--space-sm)' } },
            React.createElement(Button, {
              variant: 'primary',
              icon: 'add',
              type: 'submit',
            }, '記録')
          )
        )
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
              alert('保存先フォルダを設定しました: ' + result.folderName + '\n\n記録の追加時に自動保存されます。\n（売上記録と共通の親フォルダです）');
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
          onClick: () => DataService.manualSaveRivalToFile(),
          style: { padding: '6px 12px', fontSize: '11px' },
        }, 'JSON保存'),
        entries.length > 0 && React.createElement(Button, {
          variant: 'secondary',
          icon: 'download',
          onClick: handleExportCSV,
          style: { padding: '6px 12px', fontSize: '11px' },
        }, 'CSV出力'),
        entries.length > 0 && React.createElement(Button, {
          variant: 'danger',
          icon: 'delete_forever',
          onClick: () => { if (confirm('全ての他社乗車記録を削除しますか？この操作は取り消せません。')) handleClearAll(); },
          style: { padding: '6px 12px', fontSize: '11px' },
        }, '全削除')
      ),
      // 保存先フォルダ状態表示
      React.createElement('div', {
        style: { marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, 'info'),
        DataService.hasSaveFolder()
          ? '保存先フォルダ設定済み — 「他社乗車」サブフォルダに自動保存されます'
          : '保存先フォルダ未設定 — 記録追加時にダウンロードとして保存されます'
      )
    ),

    // 記録一覧
    entries.length > 0 && React.createElement(Card, { title: `記録一覧（${entries.length}件）` },
      entries.map(entry =>
        React.createElement('div', {
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
            React.createElement('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)' } }, 'local_taxi'),
              React.createElement('span', null, entry.location || '---')
            ),
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', marginTop: '4px' } },
              (() => {
                const info = entry.dayOfWeek ? { dayOfWeek: entry.dayOfWeek, holiday: entry.holiday, isSunday: entry.dayOfWeek === '日', isSaturday: entry.dayOfWeek === '土', isHoliday: !!entry.holiday } : JapaneseHolidays.getDateInfo(entry.date);
                const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-muted)';
                return React.createElement(React.Fragment, null,
                  React.createElement('span', null, entry.date),
                  React.createElement('span', { style: { color: dayColor, fontWeight: '600' } }, `(${info.dayOfWeek})`),
                  info.holiday && React.createElement('span', {
                    style: { color: '#ef4444', fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(239,68,68,0.1)' },
                  }, info.holiday),
                  entry.time && React.createElement('span', {
                    style: { fontSize: '11px', color: 'var(--color-primary-light)', fontWeight: '600', padding: '1px 6px', borderRadius: '3px', background: 'rgba(26,115,232,0.12)' },
                  }, entry.time),
                  entry.weather && React.createElement('span', null, entry.weather),
                  entry.memo && React.createElement('span', null, `| ${entry.memo}`)
                );
              })()
            )
          ),
          React.createElement('button', {
            onClick: () => handleDelete(entry.id),
            style: {
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px',
              borderRadius: '4px', transition: 'color 0.2s',
            },
            title: '削除',
          },
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '18px' },
            }, 'delete_outline')
          )
        )
      )
    )
  );
};

})();
