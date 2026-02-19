// Revenue.jsx - 売上記録ページ（DataService統合・バリデーション・CSVエクスポート）
// v0.3.2: DataServiceのCRUDメソッドに一元化。ローカルstate独自管理を廃止し、
//         DataServiceを唯一のデータソースとして使用する。
// v0.3.4: 乗車地・降車地のGPS現在地取得機能を追加
// v0.3.5: 日付・天候フィールドを追加
// v0.3.6: 乗車時間・降車時間フィールドを追加
// v0.3.7: 日付・曜日・天候の自動取得
window.RevenuePage = () => {
  const { useState, useEffect, useCallback, useRef } = React;

  // 本日の日付をデフォルト値に
  const todayDefault = new Date().toISOString().split('T')[0];

  // 現在時刻をHH:MM形式で取得
  const getNowTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  };

  // WMO天気コードを天候カテゴリに変換
  const wmoToWeather = (code) => {
    if (code === undefined || code === null) return '';
    // 0-1: 晴れ, 2-3: 曇り, 45-67: 雨系, 71-77,85-86: 雪系
    if (code <= 1) return '晴れ';
    if (code <= 3 || code === 45 || code === 48) return '曇り';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95 || code === 96 || code === 99) return '雨';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '雪';
    return '曇り'; // デフォルト
  };

  // DataServiceから最新データを取得するためのrefreshKey
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ date: todayDefault, weather: '', amount: '', pickup: '', pickupTime: '', dropoff: '', dropoffTime: '', passengers: '1', gender: '', purpose: '', memo: '' });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [gpsLoading, setGpsLoading] = useState({ pickup: false, dropoff: false });
  const [gpsInfo, setGpsInfo] = useState({ pickup: null, dropoff: null });
  const [weatherLoading, setWeatherLoading] = useState(false);
  const weatherFetched = useRef(false);

  const { apiKey } = useAppContext();

  // ページ読み込み時に天気を自動取得
  useEffect(() => {
    if (weatherFetched.current) return;
    weatherFetched.current = true;

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
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=Asia%2FTokyo`;
          return fetch(url).then(res => res.json());
        })
        .then(data => {
          setWeatherLoading(false);
          if (data && data.current_weather) {
            const w = wmoToWeather(data.current_weather.weathercode);
            if (w) {
              setForm(prev => prev.weather ? prev : { ...prev, weather: w });
              AppLogger.info(`天気自動取得成功: ${w} (WMO code: ${data.current_weather.weathercode})`);
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
  const entries = DataService.getEntries();

  // localStorageの変更を監視して自動更新
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA) {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleVisibility = () => {
      if (!document.hidden) setRefreshKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // GPS現在地を取得して住所に変換
  const getGpsLocation = useCallback((field) => {
    if (!navigator.geolocation) {
      setErrors(['このブラウザではGPS機能が使えません']);
      return;
    }

    setGpsLoading(prev => ({ ...prev, [field]: true }));
    setErrors([]);

    getAccuratePosition({ accuracyThreshold: 30, timeout: 20000, maxWaitAfterFix: 8000 })
      .then((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = Math.round(position.coords.accuracy);
        setGpsInfo(prev => ({ ...prev, [field]: { ...((prev && prev[field]) || {}), accuracy: acc } }));

        // Google Maps Geocoding APIで逆ジオコーディング
        if (apiKey && window.google && window.google.maps) {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            setGpsLoading(prev => ({ ...prev, [field]: false }));
            if (status === 'OK' && results[0]) {
              // 住所コンポーネントから簡潔な住所を生成
              const address = _formatAddress(results[0]);
              const fullAddress = results[0].formatted_address.replace(/、日本$/, '').replace(/^日本、/, '');
              const timeField = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
              setForm(prev => ({ ...prev, [field]: address, [timeField]: getNowTime() }));
              setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: fullAddress } }));
              AppLogger.info(`GPS逆ジオコーディング成功 (${field}): ${address}`);
            } else {
              // Google Geocoding失敗時はNominatimにフォールバック
              const timeField2 = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
              const nomUrl2 = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ja`;
              fetch(nomUrl2)
                .then(res2 => res2.json())
                .then(data2 => {
                  if (data2 && data2.address) {
                    const a2 = data2.address;
                    const parts2 = [a2.city || a2.town || a2.village || a2.county || '', a2.suburb || a2.neighbourhood || a2.quarter || '', a2.road || ''].filter(Boolean);
                    const shortAddr2 = parts2.join(' ') || data2.display_name.split(',').slice(0, 3).join(' ');
                    setForm(prev => ({ ...prev, [field]: shortAddr2, [timeField2]: getNowTime() }));
                    setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: data2.display_name || shortAddr2 } }));
                  } else {
                    const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    setForm(prev => ({ ...prev, [field]: coordStr, [timeField2]: getNowTime() }));
                    setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: null } }));
                  }
                })
                .catch(() => {
                  const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                  setForm(prev => ({ ...prev, [field]: coordStr, [timeField2]: getNowTime() }));
                  setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: null } }));
                });
              AppLogger.warn(`Google逆ジオコーディング失敗、Nominatimにフォールバック`);
            }
          });
        } else {
          // APIキーなし or Google Maps未ロードの場合はNominatim（OpenStreetMap）で逆ジオコーディング
          const timeField3 = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
          const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ja`;
          fetch(nomUrl)
            .then(res => res.json())
            .then(data => {
              setGpsLoading(prev => ({ ...prev, [field]: false }));
              if (data && data.address) {
                // 日本の住所形式で組み立て
                const a = data.address;
                const parts = [a.city || a.town || a.village || a.county || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || ''].filter(Boolean);
                const shortAddr = parts.join(' ') || data.display_name.split(',').slice(0, 3).join(' ');
                const fullAddr = data.display_name || shortAddr;
                setForm(prev => ({ ...prev, [field]: shortAddr, [timeField3]: getNowTime() }));
                setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: fullAddr } }));
                AppLogger.info(`Nominatim逆ジオコーディング成功 (${field}): ${shortAddr}`);
              } else {
                const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                setForm(prev => ({ ...prev, [field]: coordStr, [timeField3]: getNowTime() }));
                setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: null } }));
                AppLogger.warn(`Nominatim逆ジオコーディング失敗、座標を使用: ${coordStr}`);
              }
            })
            .catch(err => {
              setGpsLoading(prev => ({ ...prev, [field]: false }));
              const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              setForm(prev => ({ ...prev, [field]: coordStr, [timeField3]: getNowTime() }));
              setGpsInfo(prev => ({ ...prev, [field]: { lat, lng, address: null } }));
              AppLogger.warn(`Nominatim API失敗、座標を使用: ${err.message}`);
            });
        }
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
  }, [apiKey]);

  // Geocoding結果から簡潔な住所を抽出
  function _formatAddress(result) {
    const comps = result.address_components;
    // 都道府県、市区町村、町名、番地を抽出
    let prefecture = '';
    let city = '';
    let ward = '';
    let town = '';
    let sublocality = '';

    for (const c of comps) {
      if (c.types.includes('administrative_area_level_1')) prefecture = c.long_name;
      if (c.types.includes('locality')) city = c.long_name;
      if (c.types.includes('sublocality_level_1') || c.types.includes('ward')) ward = c.long_name;
      if (c.types.includes('sublocality_level_2')) town = c.long_name;
      if (c.types.includes('sublocality_level_3')) sublocality = c.long_name;
    }

    // 簡潔な形式: 市区町村 + 町名 (都道府県は省略可)
    const parts = [ward || city || prefecture, town, sublocality].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');

    // フォールバック: formatted_address から国名を除去
    return result.formatted_address.replace(/、日本$/, '').replace(/^日本、/, '');
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors([]);

    // DataServiceのaddEntryに完全委譲（バリデーション含む）
    const result = DataService.addEntry(form);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    setForm({ date: todayDefault, weather: form.weather, amount: '', pickup: '', pickupTime: '', dropoff: '', dropoffTime: '', passengers: '1', gender: '', purpose: '', memo: '' });
    setGpsInfo({ pickup: null, dropoff: null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  };

  const handleDelete = useCallback((id) => {
    DataService.deleteEntry(id);
    setRefreshKey(k => k + 1);
  }, []);

  const handleExportCSV = () => {
    DataService.downloadCSV();
  };

  const handleClearAll = () => {
    if (entries.length === 0) return;
    DataService.clearAllEntries();
    setRefreshKey(k => k + 1);
  };

  // 本日の日付文字列
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = entries.filter(e => (e.date || e.timestamp.split('T')[0]) === today);
  const todayTotal = todayEntries.reduce((sum, e) => sum + e.amount, 0);
  const allTotal = entries.reduce((sum, e) => sum + e.amount, 0);

  // GPS取得ボタンのスタイル
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
      React.createElement('span', { className: 'material-icons-round' }, 'receipt_long'),
      '売上記録'
    ),

    // 本日の合計
    React.createElement(Card, { style: { marginBottom: 'var(--space-lg)', textAlign: 'center' } },
      React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, '本日の売上合計'),
      React.createElement('div', {
        style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-secondary)', margin: '8px 0' },
      }, `¥${todayTotal.toLocaleString()}`),
      React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' } },
        `本日 ${todayEntries.length} 件 / 全 ${entries.length} 件（累計 ¥${allTotal.toLocaleString()}）`
      )
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
              }, '自動取得済')
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

          // 金額
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '金額 (円) *'),
            React.createElement('input', {
              className: 'form-input',
              type: 'number',
              min: '1',
              max: '1000000',
              placeholder: '3500',
              value: form.amount,
              onChange: (e) => { setForm({ ...form, amount: e.target.value }); setErrors([]); },
              required: true,
            })
          ),

          // 乗車地（GPS付き）
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '乗車地'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'text',
                placeholder: '東京駅',
                value: form.pickup,
                onChange: (e) => { setForm({ ...form, pickup: e.target.value }); if (!e.target.value) setGpsInfo(prev => ({ ...prev, pickup: null })); },
                style: { flex: 1, minWidth: 0 },
              }),
              React.createElement('button', {
                type: 'button',
                onClick: () => getGpsLocation('pickup'),
                disabled: gpsLoading.pickup,
                style: gpsButtonStyle(gpsLoading.pickup),
                title: 'GPSで現在地を取得',
              },
                React.createElement('span', {
                  className: 'material-icons-round',
                  style: { fontSize: '16px', animation: gpsLoading.pickup ? 'spin 1s linear infinite' : 'none' },
                }, gpsLoading.pickup ? 'sync' : 'my_location'),
                gpsLoading.pickup ? '取得中' : 'GPS'
              )
            ),
            // GPS取得結果の住所・座標表示
            gpsInfo.pickup && React.createElement('div', {
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
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '降車地'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'text',
                placeholder: '渋谷駅',
                value: form.dropoff,
                onChange: (e) => { setForm({ ...form, dropoff: e.target.value }); if (!e.target.value) setGpsInfo(prev => ({ ...prev, dropoff: null })); },
                style: { flex: 1, minWidth: 0 },
              }),
              React.createElement('button', {
                type: 'button',
                onClick: () => getGpsLocation('dropoff'),
                disabled: gpsLoading.dropoff,
                style: gpsButtonStyle(gpsLoading.dropoff),
                title: 'GPSで現在地を取得',
              },
                React.createElement('span', {
                  className: 'material-icons-round',
                  style: { fontSize: '16px', animation: gpsLoading.dropoff ? 'spin 1s linear infinite' : 'none' },
                }, gpsLoading.dropoff ? 'sync' : 'my_location'),
                gpsLoading.dropoff ? '取得中' : 'GPS'
              )
            ),
            // GPS取得結果の住所・座標表示
            gpsInfo.dropoff && React.createElement('div', {
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
                    color: gpsInfo.dropoff.accuracy <= 50 ? '#4caf50' : gpsInfo.dropoff.accuracy <= 200 ? '#e53935' : '#e53935' },
                }, `精度 ${gpsInfo.dropoff.accuracy}m`),
                React.createElement('a', { href: `https://www.google.com/maps?q=${gpsInfo.dropoff.lat},${gpsInfo.dropoff.lng}`, target: '_blank', rel: 'noopener', style: { color: 'var(--color-primary-light)', textDecoration: 'underline' } }, '地図で確認')
              )
            )
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
                { value: 'その他', icon: '📝' },
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
          style: { marginTop: 'var(--space-sm)' },
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
                const eDate = entry.date || new Date(entry.timestamp).toISOString().split('T')[0];
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
                  React.createElement('span', null, new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })),
                  entry.memo && React.createElement('span', null, `| ${entry.memo}`)
                );
              })()
            )
          ),
          React.createElement('div', {
            style: { fontWeight: 700, color: 'var(--color-secondary)', fontSize: 'var(--font-size-lg)', marginRight: '12px' },
          }, `¥${entry.amount.toLocaleString()}`),
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
