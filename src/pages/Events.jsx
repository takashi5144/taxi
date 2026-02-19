// Events.jsx - イベント記録ページ
// 周辺イベントの記録CRUD（RivalRide.jsx パターン踏襲）
window.EventsPage = () => {
  const { useState, useEffect, useCallback, useRef } = React;

  const todayDefault = new Date().toISOString().split('T')[0];

  const getNowTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  };

  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({
    name: '', date: todayDefault, startTime: '', endTime: '',
    location: '', locationCoords: null, scale: '', impact: '', memo: '',
  });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsInfo, setGpsInfo] = useState(null);

  const { apiKey } = useAppContext();

  const entries = DataService.getEvents();

  // localStorage変更の監視
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.EVENTS) {
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

  // GPS逆ジオコーディング
  const getGpsLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setErrors(['このブラウザではGPS機能が使えません']);
      return;
    }
    setGpsLoading(true);
    setErrors([]);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        reverseGeocode(lat, lng);
      },
      (error) => {
        setGpsLoading(false);
        const messages = {
          1: 'GPS使用が許可されていません。ブラウザの設定を確認してください。',
          2: '現在地を取得できませんでした。',
          3: 'GPS取得がタイムアウトしました。',
        };
        setErrors([messages[error.code] || 'GPS取得に失敗しました']);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [apiKey]);

  const reverseGeocode = (lat, lng) => {
    if (apiKey && window.google && window.google.maps) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        setGpsLoading(false);
        if (status === 'OK' && results[0]) {
          const address = formatAddress(results[0]);
          setForm(prev => ({ ...prev, location: address, locationCoords: { lat, lng } }));
          setGpsInfo({ lat, lng, address: results[0].formatted_address.replace(/、日本$/, '').replace(/^日本、/, '') });
        } else {
          nominatimFallback(lat, lng);
        }
      });
    } else {
      nominatimFallback(lat, lng);
    }
  };

  const nominatimFallback = (lat, lng) => {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ja`;
    fetch(nomUrl)
      .then(res => res.json())
      .then(data => {
        setGpsLoading(false);
        if (data && data.address) {
          const a = data.address;
          const parts = [a.city || a.town || a.village || a.county || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || ''].filter(Boolean);
          const shortAddr = parts.join(' ') || data.display_name.split(',').slice(0, 3).join(' ');
          setForm(prev => ({ ...prev, location: shortAddr, locationCoords: { lat, lng } }));
          setGpsInfo({ lat, lng, address: data.display_name || shortAddr });
        } else {
          const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          setForm(prev => ({ ...prev, location: coordStr, locationCoords: { lat, lng } }));
          setGpsInfo({ lat, lng, address: null });
        }
      })
      .catch(() => {
        setGpsLoading(false);
        const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setForm(prev => ({ ...prev, location: coordStr, locationCoords: { lat, lng } }));
        setGpsInfo({ lat, lng, address: null });
      });
  };

  function formatAddress(result) {
    const comps = result.address_components;
    let prefecture = '', city = '', ward = '', town = '', sublocality = '';
    for (const c of comps) {
      if (c.types.includes('administrative_area_level_1')) prefecture = c.long_name;
      if (c.types.includes('locality')) city = c.long_name;
      if (c.types.includes('sublocality_level_1') || c.types.includes('ward')) ward = c.long_name;
      if (c.types.includes('sublocality_level_2')) town = c.long_name;
      if (c.types.includes('sublocality_level_3')) sublocality = c.long_name;
    }
    const parts = [ward || city || prefecture, town, sublocality].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
    return result.formatted_address.replace(/、日本$/, '').replace(/^日本、/, '');
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors([]);
    const result = DataService.addEvent(form);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setForm({
      name: '', date: todayDefault, startTime: '', endTime: '',
      location: '', locationCoords: null, scale: '', impact: '', memo: '',
    });
    setGpsInfo(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  };

  const handleDelete = useCallback((id) => {
    DataService.deleteEvent(id);
    setRefreshKey(k => k + 1);
  }, []);

  const handleClearAll = () => {
    if (entries.length === 0) return;
    DataService.clearAllEvents();
    setRefreshKey(k => k + 1);
  };

  const scaleOptions = [
    { value: '小', label: '小', desc: '〜100人' },
    { value: '中', label: '中', desc: '100〜1000人' },
    { value: '大', label: '大', desc: '1000〜10000人' },
    { value: '特大', label: '特大', desc: '10000人〜' },
  ];

  const impactOptions = [
    { value: '需要増', icon: 'trending_up', color: 'var(--color-accent)' },
    { value: '需要減', icon: 'trending_down', color: 'var(--color-danger)' },
    { value: '不明', icon: 'help_outline', color: 'var(--text-muted)' },
  ];

  const gpsButtonStyle = (loading) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
    padding: '8px 12px', borderRadius: '6px',
    fontSize: '11px', fontWeight: '600',
    color: loading ? 'var(--color-secondary)' : '#fff',
    cursor: loading ? 'wait' : 'pointer',
    border: '1px solid rgba(255,255,255,0.15)',
    background: loading ? 'rgba(249,168,37,0.15)' : 'rgba(26,115,232,0.2)',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap', minWidth: '0', flex: '0 0 auto',
  });

  const scaleImpactLabel = (entry) => {
    const parts = [];
    if (entry.scale) parts.push(`規模: ${entry.scale}`);
    if (entry.impact) parts.push(`影響: ${entry.impact}`);
    return parts.join(' / ');
  };

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'event'),
      'イベント記録'
    ),

    // 記録件数
    React.createElement(Card, { style: { marginBottom: 'var(--space-lg)', textAlign: 'center' } },
      React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, 'イベント記録'),
      React.createElement('div', {
        style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)', margin: '8px 0' },
      }, `${entries.length} 件`),
      React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' } },
        entries.length > 0 ? `最新: ${entries[0].name} (${entries[0].date})` : 'まだ記録がありません'
      )
    ),

    // 入力フォーム
    React.createElement(Card, { title: 'イベントを記録', style: { marginBottom: 'var(--space-lg)' } },
      // エラー表示
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
          'イベントを記録しました'
        )
      ),

      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'grid grid--2' },

          // イベント名（必須）
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label' }, 'イベント名 *'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '例: 東京マラソン、花火大会、コンサート',
              value: form.name,
              onChange: (e) => setForm({ ...form, name: e.target.value }),
              required: true,
            })
          ),

          // 日付
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '日付',
              React.createElement('span', {
                style: { fontSize: '10px', color: 'var(--color-accent)', fontWeight: '400', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,200,83,0.1)' },
              }, '自動')
            ),
            React.createElement('input', {
              className: 'form-input',
              type: 'date',
              value: form.date,
              onChange: (e) => setForm({ ...form, date: e.target.value }),
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
                  React.createElement('span', { style: { fontSize: '13px' } }, '\u{1F38C}'),
                  info.holiday
                )
              );
            })()
          ),

          // 時間帯
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '時間帯'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'time',
                value: form.startTime,
                onChange: (e) => setForm({ ...form, startTime: e.target.value }),
                style: { flex: 1, minWidth: 0, colorScheme: 'dark' },
                placeholder: '開始',
              }),
              React.createElement('span', { style: { color: 'var(--text-muted)', fontSize: '14px' } }, '〜'),
              React.createElement('input', {
                className: 'form-input',
                type: 'time',
                value: form.endTime,
                onChange: (e) => setForm({ ...form, endTime: e.target.value }),
                style: { flex: 1, minWidth: 0, colorScheme: 'dark' },
                placeholder: '終了',
              })
            )
          ),

          // 場所（GPS付き）
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '場所',
              gpsLoading && React.createElement('span', {
                style: { fontSize: '11px', color: 'var(--color-secondary)', fontWeight: '400', animation: 'pulse 1.5s ease-in-out infinite' },
              }, '取得中...')
            ),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input',
                type: 'text',
                placeholder: '東京ドーム、渋谷駅前 等',
                value: form.location,
                onChange: (e) => { setForm({ ...form, location: e.target.value }); if (!e.target.value) setGpsInfo(null); },
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
            gpsInfo && React.createElement('div', {
              style: {
                marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
                background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.15)',
                fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5',
              },
            },
              gpsInfo.address && React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '4px', marginBottom: '3px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '13px', color: 'var(--color-primary-light)', marginTop: '1px', flexShrink: 0 } }, 'place'),
                React.createElement('span', { style: { fontWeight: '600', color: 'var(--color-primary-light)', wordBreak: 'break-all' } }, gpsInfo.address)
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '10px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px', flexShrink: 0 } }, 'gps_fixed'),
                `${gpsInfo.lat.toFixed(6)}, ${gpsInfo.lng.toFixed(6)}`
              )
            )
          ),

          // 規模
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '規模'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              scaleOptions.map(s =>
                React.createElement('button', {
                  key: s.value,
                  type: 'button',
                  onClick: () => setForm({ ...form, scale: form.scale === s.value ? '' : s.value }),
                  style: {
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                    padding: '8px 14px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: form.scale === s.value ? '700' : '400',
                    cursor: 'pointer',
                    border: form.scale === s.value ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: form.scale === s.value ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
                    color: form.scale === s.value ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  },
                },
                  React.createElement('span', null, s.label),
                  React.createElement('span', { style: { fontSize: '9px', color: 'var(--text-muted)' } }, s.desc)
                )
              )
            )
          ),

          // 予想影響
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '予想影響'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              impactOptions.map(opt =>
                React.createElement('button', {
                  key: opt.value,
                  type: 'button',
                  onClick: () => setForm({ ...form, impact: form.impact === opt.value ? '' : opt.value }),
                  style: {
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: form.impact === opt.value ? '700' : '400',
                    cursor: 'pointer',
                    border: form.impact === opt.value ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                    background: form.impact === opt.value ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
                    color: form.impact === opt.value ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  },
                },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: opt.color } }, opt.icon),
                  opt.value
                )
              )
            )
          ),

          // メモ
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label' }, 'メモ'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '任意のメモ（集客予想、注意点など）',
              value: form.memo,
              onChange: (e) => setForm({ ...form, memo: e.target.value }),
            })
          )
        ),
        React.createElement(Button, {
          variant: 'primary',
          icon: 'add',
          style: { marginTop: 'var(--space-sm)' },
        }, 'イベントを記録')
      )
    ),

    // データ管理ツールバー
    entries.length > 0 && React.createElement(Card, { style: { marginBottom: 'var(--space-md)' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-primary-light)' } }, 'folder'),
        React.createElement('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, 'データ管理'),
        React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' } },
          `全 ${entries.length} 件の記録`
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        React.createElement(Button, {
          variant: 'danger',
          icon: 'delete_forever',
          onClick: () => { if (confirm('全てのイベント記録を削除しますか？この操作は取り消せません。')) handleClearAll(); },
          style: { padding: '6px 12px', fontSize: '11px' },
        }, '全削除')
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
            alignItems: 'flex-start',
            padding: '12px 0',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          },
        },
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-secondary)' } }, 'event'),
              React.createElement('span', null, entry.name)
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
                  (entry.startTime || entry.endTime) && React.createElement('span', {
                    style: { fontSize: '11px', color: 'var(--color-primary-light)', fontWeight: '600', padding: '1px 6px', borderRadius: '3px', background: 'rgba(26,115,232,0.12)' },
                  }, `${entry.startTime || '?'}〜${entry.endTime || '?'}`),
                  entry.location && React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '2px' } },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, 'place'),
                    entry.location
                  )
                );
              })()
            ),
            (entry.scale || entry.impact) && React.createElement('div', {
              style: { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' },
            },
              entry.scale && React.createElement('span', {
                style: { padding: '1px 8px', borderRadius: '3px', background: 'rgba(249,168,37,0.12)', color: 'var(--color-secondary)', fontWeight: '600' },
              }, `規模: ${entry.scale}`),
              entry.impact && React.createElement('span', {
                style: {
                  padding: '1px 8px', borderRadius: '3px', fontWeight: '600',
                  background: entry.impact === '需要増' ? 'rgba(0,200,83,0.12)' : entry.impact === '需要減' ? 'rgba(229,57,53,0.12)' : 'rgba(255,255,255,0.06)',
                  color: entry.impact === '需要増' ? 'var(--color-accent)' : entry.impact === '需要減' ? 'var(--color-danger)' : 'var(--text-muted)',
                },
              }, `影響: ${entry.impact}`)
            ),
            entry.memo && React.createElement('div', {
              style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' },
            }, `${entry.memo}`)
          ),
          React.createElement('button', {
            onClick: () => handleDelete(entry.id),
            style: {
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px',
              borderRadius: '4px', transition: 'color 0.2s',
              marginTop: '4px',
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
