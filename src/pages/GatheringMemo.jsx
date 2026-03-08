(function() {
// GatheringMemo.jsx - 集客メモページ（音声入力対応）
window.GatheringMemoPage = () => {
  const { useState, useEffect, useCallback, useRef, useMemo } = React;

  const todayDefault = getLocalDateString();
  const getNowTime = TaxiApp.utils.getNowTime;

  // ============================================================
  // 定数
  // ============================================================
  const DENSITY_OPTIONS = [
    { value: 'many', label: '多い', color: '#4caf50', bg: 'rgba(76,175,80,0.15)' },
    { value: 'normal', label: '普通', color: '#f9a825', bg: 'rgba(249,168,37,0.15)' },
    { value: 'few', label: '少ない', color: '#ff9800', bg: 'rgba(255,152,0,0.15)' },
    { value: 'none', label: 'いない', color: '#e53935', bg: 'rgba(229,57,53,0.15)' },
  ];

  const LOCATION_TYPE_OPTIONS = [
    { value: 'station', label: '駅' },
    { value: 'hospital', label: '病院' },
    { value: 'commercial', label: '商業施設' },
    { value: 'office', label: 'オフィス街' },
    { value: 'residential', label: '住宅街' },
    { value: 'event', label: 'イベント' },
    { value: 'other', label: 'その他' },
  ];

  const WEATHER_OPTIONS = [
    { value: '晴れ', icon: '☀️' },
    { value: '曇り', icon: '☁️' },
    { value: '雨', icon: '🌧️' },
    { value: '雪', icon: '❄️' },
  ];

  const wmoToWeather = (code) => TaxiApp.utils.wmoToWeather(code, '');

  // ============================================================
  // State
  // ============================================================
  const emptyForm = { date: todayDefault, time: getNowTime(), weather: '', temperature: null, location: '', locationCoords: null, density: '', locationType: 'other', stayMinutes: '', memo: '', source: 'manual' };
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const weatherFetched = useRef(false);
  const locationFetched = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // 音声入力
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);
  const speechSupported = useRef(!!(window.SpeechRecognition || window.webkitSpeechRecognition));

  const { apiKey } = useAppContext();

  // ============================================================
  // 天気・GPS自動取得（GPSキャッシュ優先）
  // ============================================================
  useEffect(() => {
    if (weatherFetched.current) return;
    weatherFetched.current = true;

    // GPSキャッシュから天気取得を試みる
    const cached = GpsLogService.getCurrentWeather();
    if (cached && cached.weather) {
      setForm(prev => prev.weather ? prev : { ...prev, weather: cached.weather, temperature: cached.temperature != null ? cached.temperature : null });
      AppLogger.info(`集客メモ 天気GPSキャッシュ使用: ${cached.weather} ${cached.temperature}℃`);
      return;
    }

    if (!navigator.geolocation) return;
    setWeatherLoading(true);
    getAccuratePosition({ accuracyThreshold: 500, timeout: 10000, maxWaitAfterFix: 3000 })
      .then((position) => {
        const lat = position.coords.latitude.toFixed(4);
        const lng = position.coords.longitude.toFixed(4);
        const meteoParams = new URLSearchParams({ latitude: lat, longitude: lng, current_weather: 'true', timezone: 'Asia/Tokyo' });
        return fetch(`https://api.open-meteo.com/v1/forecast?${meteoParams}`).then(res => res.json());
      })
      .then(data => {
        setWeatherLoading(false);
        if (data && data.current_weather) {
          const w = wmoToWeather(data.current_weather.weathercode);
          const temp = data.current_weather.temperature != null ? data.current_weather.temperature : null;
          if (w) setForm(prev => prev.weather ? prev : { ...prev, weather: w, temperature: temp });
        }
      })
      .catch(() => setWeatherLoading(false));
  }, []);

  useEffect(() => {
    if (locationFetched.current) return;
    locationFetched.current = true;
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    getAccuratePosition({ accuracyThreshold: 200, timeout: 15000, maxWaitAfterFix: 5000 })
      .then((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setForm(prev => ({ ...prev, locationCoords: { lat, lng } }));
        setGpsLoading(false);
      })
      .catch(() => setGpsLoading(false));
  }, []);

  // ============================================================
  // データ変更リスナー
  // ============================================================
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.GATHERING_MEMOS) setRefreshKey(k => k + 1);
    };
    window.addEventListener('storage', handleStorage);
    const handleVisibility = () => { if (!document.hidden) setRefreshKey(k => k + 1); };
    document.addEventListener('visibilitychange', handleVisibility);
    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('taxi-data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
    };
  }, []);

  const entries = useMemo(() => DataService.getGatheringMemos(), [refreshKey]);
  const analysis = useMemo(() => showAnalysis ? DataService.getGatheringAnalysis() : null, [refreshKey, showAnalysis]);
  const gatheringRevenue = useMemo(() => showAnalysis ? DataService.getGatheringRevenueCorrelation() : [], [refreshKey, showAnalysis]);

  // ============================================================
  // 音声入力
  // ============================================================
  const KNOWN_LOCATIONS_LIST = useMemo(() => {
    const locs = [];
    const kl = APP_CONSTANTS.KNOWN_LOCATIONS;
    if (kl && kl.asahikawa) {
      if (kl.asahikawa.station) locs.push(kl.asahikawa.station.name);
      if (kl.asahikawa.hospitals) kl.asahikawa.hospitals.forEach(h => locs.push(h.name));
      if (kl.asahikawa.hotels) kl.asahikawa.hotels.forEach(h => locs.push(h.name));
    }
    return locs;
  }, []);

  const parseVoiceInput = useCallback((text) => {
    if (!text) return {};
    const result = {};

    // 全角→半角数字変換
    const normalized = text.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

    // 場所抽出: 既知の場所名マッチング
    for (const loc of KNOWN_LOCATIONS_LIST) {
      if (normalized.includes(loc)) { result.location = loc; break; }
    }
    // 場所タイプ推定
    if (/駅/.test(normalized)) result.locationType = 'station';
    else if (/病院|医大|クリニック/.test(normalized)) result.locationType = 'hospital';
    else if (/モール|イオン|商業|ショッピング|デパート/.test(normalized)) result.locationType = 'commercial';
    else if (/オフィス|ビル街/.test(normalized)) result.locationType = 'office';
    else if (/住宅|マンション/.test(normalized)) result.locationType = 'residential';
    else if (/イベント|祭り|ライブ|コンサート/.test(normalized)) result.locationType = 'event';

    // 密度抽出
    if (/多い|たくさん|いっぱい|混んで|混雑/.test(normalized)) result.density = 'many';
    else if (/普通|まあまあ|そこそこ/.test(normalized)) result.density = 'normal';
    else if (/少ない|あまり|ちょっと|少し/.test(normalized)) result.density = 'few';
    else if (/いない|ゼロ|全然|誰も|皆無|ガラガラ/.test(normalized)) result.density = 'none';

    // 時刻抽出: N時M分、N時半、N時
    const timeMatch = normalized.match(/(\d{1,2})時(?:(\d{1,2})分|半)?/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : (normalized.includes('半') && timeMatch[0].includes('半') ? 30 : 0);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        result.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    // 滞在時間抽出: N分待った、N分滞在、N時間
    const stayMatch = normalized.match(/(\d{1,3})分(?:待|滞在|くらい)?/);
    if (stayMatch) result.stayMinutes = stayMatch[1];
    const stayHourMatch = normalized.match(/(\d{1,2})時間(?:待|滞在)?/);
    if (stayHourMatch && !timeMatch) result.stayMinutes = String(parseInt(stayHourMatch[1], 10) * 60);

    // 場所名が既知でなかった場合、入力テキストから場所名候補を抽出
    if (!result.location) {
      // 「〇〇駅」「〇〇病院」「〇〇前」等のパターン
      const locMatch = normalized.match(/([^\s、。,]{2,}(?:駅|病院|前|口|モール|イオン|ホテル|空港))/);
      if (locMatch) result.location = locMatch[1];
    }

    return result;
  }, [KNOWN_LOCATIONS_LIST]);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += t;
          else interim += t;
        }
        setInterimTranscript(interim);
        if (final) {
          setTranscript(prev => prev + final);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (e) => {
        setIsListening(false);
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          AppLogger.warn('音声認識エラー: ' + e.error);
        }
      };

      recognition.start();
      setIsListening(true);
      setTranscript('');
      setInterimTranscript('');
      recognitionRef.current = recognition;
    } catch (e) {
      AppLogger.warn('音声認識の開始に失敗: ' + e.message);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  // 音声認識が終了したら解析 → フォーム反映 → 自動記録＆クラウド送信
  const [voiceAutoSaved, setVoiceAutoSaved] = useState(false);
  useEffect(() => {
    if (!isListening && transcript) {
      const parsed = parseVoiceInput(transcript);
      setForm(prev => {
        const merged = {
          ...prev,
          location: parsed.location || prev.location,
          density: parsed.density || prev.density,
          locationType: parsed.locationType || prev.locationType,
          time: parsed.time || prev.time,
          stayMinutes: parsed.stayMinutes || prev.stayMinutes,
          source: 'voice',
        };
        // 場所と客の多さが揃っていれば自動記録（addGatheringMemo内でクラウド同期される）
        if (merged.location && merged.location.trim() && merged.density) {
          const result = DataService.addGatheringMemo(merged);
          if (result.success) {
            AppLogger.info(`音声入力 自動記録＆クラウド送信: ${merged.location} (${merged.density})`);
            setSaved(true);
            setVoiceAutoSaved(true);
            setTimeout(() => { setSaved(false); setVoiceAutoSaved(false); }, 3000);
            setRefreshKey(k => k + 1);
            // フォームリセット（天気は保持）
            return { ...emptyForm, weather: merged.weather, source: 'manual' };
          }
        }
        return merged;
      });
    }
  }, [isListening, transcript, parseVoiceInput]);

  // ============================================================
  // GPS位置取得（手動）
  // ============================================================
  const getGpsLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    getAccuratePosition({ accuracyThreshold: 50, timeout: 20000, maxWaitAfterFix: 8000 })
      .then((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setForm(prev => ({ ...prev, locationCoords: { lat, lng } }));
        // 逆ジオコーディング
        if (apiKey && window.google && window.google.maps) {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            setGpsLoading(false);
            if (status === 'OK' && results[0]) {
              const comps = results[0].address_components;
              let ward = '', town = '', sublocality = '';
              for (const c of comps) {
                if (c.types.includes('sublocality_level_1') || c.types.includes('ward')) ward = c.long_name;
                if (c.types.includes('sublocality_level_2')) town = c.long_name;
                if (c.types.includes('sublocality_level_3')) sublocality = c.long_name;
              }
              const shortAddr = [ward, town, sublocality].filter(Boolean).join(' ') || results[0].formatted_address.replace(/、日本$/, '').replace(/^日本、/, '');
              setForm(prev => ({ ...prev, location: prev.location || shortAddr }));
            }
          });
        } else {
          const nomUrl = TaxiApp.utils.nominatimUrl(lat, lng, 18);
          fetch(nomUrl).then(res => res.json()).then(data => {
            setGpsLoading(false);
            if (data && data.address) {
              const a = data.address;
              const parts = [a.city || a.town || '', a.suburb || a.neighbourhood || '', a.road || ''].filter(Boolean);
              const shortAddr = parts.join(' ') || data.display_name.split(',').slice(0, 3).join(' ');
              setForm(prev => ({ ...prev, location: prev.location || shortAddr }));
            }
          }).catch(() => setGpsLoading(false));
        }
      })
      .catch(() => setGpsLoading(false));
  }, [apiKey]);

  // ============================================================
  // フォーム送信
  // ============================================================
  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors([]);
    const result = DataService.addGatheringMemo(form);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setForm({ ...emptyForm, weather: form.weather, source: 'manual' });
    setTranscript('');
    setInterimTranscript('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setRefreshKey(k => k + 1);
  };

  // ============================================================
  // 編集・削除
  // ============================================================
  const startEdit = useCallback((entry) => {
    setEditingId(entry.id);
    setEditForm({ ...entry });
    setDeleteConfirmId(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editForm) return;
    const result = DataService.updateGatheringMemo(editingId, editForm);
    if (result.success) {
      setEditingId(null);
      setEditForm(null);
      setRefreshKey(k => k + 1);
    }
  }, [editingId, editForm]);

  const handleDelete = useCallback((id) => {
    if (deleteConfirmId === id) {
      DataService.deleteGatheringMemo(id);
      setDeleteConfirmId(null);
      setRefreshKey(k => k + 1);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(prev => prev === id ? null : prev), 3000);
    }
  }, [deleteConfirmId]);

  // ============================================================
  // フィルタリング
  // ============================================================
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(e =>
      (e.location || '').toLowerCase().includes(q) ||
      (e.memo || '').toLowerCase().includes(q) ||
      (e.date || '').includes(q) ||
      (e.dayOfWeek || '').includes(q)
    );
  }, [entries, searchQuery]);

  // ============================================================
  // スタイル定数
  // ============================================================
  const chipStyle = (selected) => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '8px 14px', borderRadius: '8px',
    fontSize: '13px', fontWeight: selected ? '700' : '400',
    cursor: 'pointer',
    border: selected ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
    background: selected ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
    color: selected ? 'var(--color-primary-light)' : 'var(--text-secondary)',
    transition: 'all 0.15s ease',
  });

  const densityBadge = (density) => {
    const opt = DENSITY_OPTIONS.find(d => d.value === density);
    if (!opt) return null;
    return React.createElement('span', {
      style: { fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', color: opt.color, background: opt.bg },
    }, opt.label);
  };

  // ============================================================
  // Render
  // ============================================================
  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'mic'),
      '集客メモ'
    ),

    // 記録件数カード
    React.createElement(Card, { style: { marginBottom: 'var(--space-lg)', textAlign: 'center' } },
      React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, '集客観察メモ'),
      React.createElement('div', {
        style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)', margin: '8px 0' },
      }, `${entries.length} 件`),
      React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' } },
        entries.length > 0 ? `最新: ${entries[0].date} ${entries[0].time} ${entries[0].location}` : 'まだ記録がありません'
      )
    ),

    // ============================================================
    // 音声入力セクション
    // ============================================================
    speechSupported.current && React.createElement(Card, { style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('div', { style: { textAlign: 'center', marginBottom: 'var(--space-md)' } },
        React.createElement('button', {
          type: 'button',
          onClick: isListening ? stopListening : startListening,
          style: {
            width: '80px', height: '80px', borderRadius: '50%',
            border: isListening ? '3px solid #e53935' : '3px solid var(--color-primary)',
            background: isListening ? 'rgba(229,57,53,0.2)' : 'rgba(26,115,232,0.15)',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s ease',
            animation: isListening ? 'pulse 1.5s ease-in-out infinite' : 'none',
          },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '36px', color: isListening ? '#e53935' : 'var(--color-primary-light)' },
          }, isListening ? 'stop' : 'mic')
        ),
        React.createElement('div', {
          style: { marginTop: '8px', fontSize: '12px', color: isListening ? '#e53935' : 'var(--text-muted)', fontWeight: isListening ? '600' : '400' },
        }, isListening ? '録音中... タップで停止' : '音声で記録する'),
        React.createElement('div', {
          style: { marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' },
        }, '場所と客の多さを話すと自動記録＆クラウド送信されます')
      ),

      // 認識テキスト表示
      (transcript || interimTranscript) && React.createElement('div', {
        style: {
          padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          fontSize: '14px', lineHeight: '1.6', minHeight: '40px',
        },
      },
        transcript && React.createElement('span', { style: { color: 'var(--text-primary)' } }, transcript),
        interimTranscript && React.createElement('span', { style: { color: 'var(--text-muted)', fontStyle: 'italic' } }, interimTranscript)
      )
    ),

    // ============================================================
    // 入力フォーム
    // ============================================================
    React.createElement(Card, { title: '集客観察を記録', style: { marginBottom: 'var(--space-lg)' } },
      errors.length > 0 && React.createElement('div', {
        style: {
          background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.3)',
          borderRadius: '8px', padding: '8px 12px', marginBottom: 'var(--space-md)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-danger)' } }, 'error'),
        React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' } }, errors.join('、'))
      ),

      saved && React.createElement('div', {
        style: {
          background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.3)',
          borderRadius: '8px', padding: '8px 12px', marginBottom: 'var(--space-md)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-accent)' } }, 'check_circle'),
        React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-accent)' } },
          voiceAutoSaved ? '音声入力から自動記録しました（クラウド同期済）' : '集客メモを記録しました'
        )
      ),

      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'grid grid--2' },

          // 場所
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              '場所 *',
              gpsLoading && React.createElement('span', {
                style: { fontSize: '11px', color: 'var(--color-secondary)', fontWeight: '400', animation: 'pulse 1.5s ease-in-out infinite' },
              }, 'GPS取得中...')
            ),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input', type: 'text',
                placeholder: '旭川駅南口、△△病院前 など',
                value: form.location,
                onChange: (e) => setForm({ ...form, location: e.target.value }),
                required: true,
                style: { flex: 1, minWidth: 0 },
              }),
              React.createElement('button', {
                type: 'button', onClick: getGpsLocation, disabled: gpsLoading,
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                  color: gpsLoading ? 'var(--color-secondary)' : '#fff', cursor: gpsLoading ? 'wait' : 'pointer',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: gpsLoading ? 'rgba(249,168,37,0.15)' : 'rgba(26,115,232,0.2)',
                  transition: 'all 0.2s ease', whiteSpace: 'nowrap', flex: '0 0 auto',
                },
              },
                React.createElement('span', {
                  className: 'material-icons-round',
                  style: { fontSize: '16px', animation: gpsLoading ? 'spin 1s linear infinite' : 'none' },
                }, gpsLoading ? 'sync' : 'my_location'),
                'GPS'
              )
            )
          ),

          // 客の多さ
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label' }, '客の多さ *'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              ...DENSITY_OPTIONS.map(d =>
                React.createElement('button', {
                  key: d.value, type: 'button',
                  onClick: () => setForm({ ...form, density: form.density === d.value ? '' : d.value }),
                  style: {
                    ...chipStyle(form.density === d.value),
                    ...(form.density === d.value ? { borderColor: d.color, background: d.bg, color: d.color } : {}),
                  },
                }, d.label)
              )
            )
          ),

          // 場所タイプ
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label' }, '場所タイプ'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              ...LOCATION_TYPE_OPTIONS.map(t =>
                React.createElement('button', {
                  key: t.value, type: 'button',
                  onClick: () => setForm({ ...form, locationType: t.value }),
                  style: chipStyle(form.locationType === t.value),
                }, t.label)
              )
            )
          ),

          // 日付
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '日付'),
            React.createElement('input', {
              className: 'form-input', type: 'date', value: form.date,
              onChange: (e) => setForm({ ...form, date: e.target.value }),
              style: { colorScheme: 'dark' },
            })
          ),

          // 時刻
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '時刻'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
              React.createElement('input', {
                className: 'form-input', type: 'time', value: form.time,
                onChange: (e) => setForm({ ...form, time: e.target.value }),
                style: { flex: 1, minWidth: 0, colorScheme: 'dark' },
              }),
              React.createElement('button', {
                type: 'button',
                onClick: () => setForm({ ...form, time: getNowTime() }),
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                  color: '#fff', cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,200,83,0.2)',
                  transition: 'all 0.2s ease', whiteSpace: 'nowrap', flex: '0 0 auto',
                },
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'schedule'),
                '現在'
              )
            )
          ),

          // 天気
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
              ...WEATHER_OPTIONS.map(w =>
                React.createElement('button', {
                  key: w.value, type: 'button',
                  onClick: () => setForm({ ...form, weather: form.weather === w.value ? '' : w.value }),
                  style: chipStyle(form.weather === w.value),
                },
                  React.createElement('span', { style: { fontSize: '16px' } }, w.icon),
                  w.value
                )
              )
            )
          ),

          // 滞在時間
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '滞在/観察時間'),
            React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
              React.createElement('input', {
                className: 'form-input', type: 'number', min: '0', max: '999',
                placeholder: '15',
                value: form.stayMinutes,
                onChange: (e) => setForm({ ...form, stayMinutes: e.target.value }),
                style: { width: '80px' },
              }),
              React.createElement('span', { style: { color: 'var(--text-secondary)', fontSize: '13px' } }, '分')
            )
          ),

          // メモ
          React.createElement('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'form-label' }, 'メモ'),
            React.createElement('input', {
              className: 'form-input', type: 'text',
              placeholder: '自由メモ（例: タクシー乗り場に行列あり）',
              value: form.memo,
              onChange: (e) => setForm({ ...form, memo: e.target.value }),
            })
          ),

          // 送信ボタン
          React.createElement('div', { style: { gridColumn: '1 / -1', marginTop: 'var(--space-sm)' } },
            React.createElement(Button, { variant: 'primary', icon: 'add', type: 'submit' }, '記録する')
          )
        )
      )
    ),

    // ============================================================
    // データ管理ツールバー
    // ============================================================
    React.createElement(Card, { style: { marginBottom: 'var(--space-md)' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-primary-light)' } }, 'folder'),
        React.createElement('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, 'データ管理'),
        entries.length > 0 && React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' } },
          `全 ${entries.length} 件`
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        React.createElement(Button, {
          variant: 'secondary', icon: DataService.hasSaveFolder() ? 'folder_open' : 'create_new_folder',
          onClick: async () => {
            const result = await DataService.selectSaveFolder();
            if (result.success) {
              alert('保存先フォルダを設定しました: ' + result.folderName);
              setRefreshKey(k => k + 1);
            }
          },
          style: { padding: '6px 12px', fontSize: '11px' },
        }, DataService.hasSaveFolder() ? '保存先変更' : '保存先フォルダ設定'),
        entries.length > 0 && React.createElement(Button, {
          variant: 'secondary', icon: 'save',
          onClick: () => DataService.manualSaveGatheringToFile(),
          style: { padding: '6px 12px', fontSize: '11px' },
        }, 'JSON保存'),
        entries.length > 0 && React.createElement(Button, {
          variant: 'secondary', icon: 'download',
          onClick: () => DataService.downloadGatheringCSV(),
          style: { padding: '6px 12px', fontSize: '11px' },
        }, 'CSV出力'),
        entries.length > 0 && React.createElement(Button, {
          variant: 'danger', icon: 'delete_forever',
          onClick: () => { if (confirm('全ての集客メモを削除しますか？この操作は取り消せません。')) { DataService.clearAllGatheringMemos(); setRefreshKey(k => k + 1); } },
          style: { padding: '6px 12px', fontSize: '11px' },
        }, '全削除')
      )
    ),

    // ============================================================
    // 集客パターン分析
    // ============================================================
    React.createElement(Card, { style: { marginBottom: 'var(--space-md)' } },
      React.createElement('div', {
        onClick: () => setShowAnalysis(p => !p),
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', padding: '4px 0',
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-primary-light)' } }, 'insights'),
          React.createElement('span', { style: { fontSize: '14px', fontWeight: '600' } }, '集客パターン分析')
        ),
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showAnalysis ? 'rotate(180deg)' : 'none' } }, 'expand_more')
      ),

      showAnalysis && analysis && React.createElement('div', { style: { marginTop: 'var(--space-md)' } },

        // 密度分布
        React.createElement('div', { style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)' } }, '客の多さ分布'),
          React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            ...DENSITY_OPTIONS.map(d => {
              const count = analysis.densityBreakdown[d.value] || 0;
              const pct = analysis.total > 0 ? Math.round(count / analysis.total * 100) : 0;
              return React.createElement('div', {
                key: d.value,
                style: { flex: '1 1 80px', padding: '10px', borderRadius: '8px', background: d.bg, textAlign: 'center', minWidth: '70px' },
              },
                React.createElement('div', { style: { fontSize: '18px', fontWeight: '700', color: d.color } }, count),
                React.createElement('div', { style: { fontSize: '11px', color: d.color, marginTop: '2px' } }, `${d.label} (${pct}%)`)
              );
            })
          )
        ),

        // 場所タイプ別
        analysis.typeBreakdown.length > 0 && React.createElement('div', { style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)' } }, '場所タイプ別'),
          ...analysis.typeBreakdown.map(t =>
            React.createElement('div', {
              key: t.type,
              style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
            },
              React.createElement('span', { style: { fontSize: '12px', fontWeight: '600', minWidth: '70px' } }, t.label),
              React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, `${t.count}件`),
              React.createElement('div', { style: { flex: 1, display: 'flex', gap: '4px', marginLeft: '8px' } },
                ...DENSITY_OPTIONS.map(d => {
                  const c = t.densities[d.value] || 0;
                  return c > 0 ? React.createElement('span', {
                    key: d.value,
                    style: { fontSize: '10px', padding: '1px 6px', borderRadius: '3px', color: d.color, background: d.bg },
                  }, `${d.label}:${c}`) : null;
                }).filter(Boolean)
              )
            )
          )
        ),

        // 曜日別
        React.createElement('div', { style: { marginBottom: 'var(--space-lg)' } },
          React.createElement('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)' } }, '曜日別'),
          React.createElement('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
            ...analysis.dayBreakdown.map(d => {
              const isSun = d.day === '日';
              const isSat = d.day === '土';
              return React.createElement('div', {
                key: d.day,
                style: {
                  flex: '1 1 40px', textAlign: 'center', padding: '6px 4px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.04)', minWidth: '38px',
                },
              },
                React.createElement('div', {
                  style: { fontSize: '11px', fontWeight: '600', color: isSun ? '#ef4444' : isSat ? '#3b82f6' : 'var(--text-secondary)', marginBottom: '4px' },
                }, d.day),
                React.createElement('div', { style: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' } }, d.count)
              );
            })
          )
        ),

        // 場所×時間帯マトリクス
        analysis.locationMatrix.length > 0 && React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)' } }, '場所 x 時間帯（客の多さ）'),
          React.createElement('div', { style: { overflowX: 'auto' } },
            React.createElement('table', {
              style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '400px' },
            },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', { style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontWeight: '600' } }, '場所'),
                  ...analysis.timeBands.map(tb =>
                    React.createElement('th', { key: tb, style: { textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontWeight: '600' } }, tb)
                  )
                )
              ),
              React.createElement('tbody', null,
                ...analysis.locationMatrix.slice(0, 15).map((row, ri) =>
                  React.createElement('tr', { key: ri },
                    React.createElement('td', {
                      style: { padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: '500', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                    }, row.location),
                    ...analysis.timeBands.map(tb => {
                      const cell = row[tb];
                      if (!cell) return React.createElement('td', { key: tb, style: { textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' } }, '-');
                      const scoreColor = cell.score >= 2.5 ? '#4caf50' : cell.score >= 1.5 ? '#f9a825' : cell.score >= 0.5 ? '#ff9800' : '#e53935';
                      return React.createElement('td', {
                        key: tb,
                        style: { textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
                      },
                        React.createElement('span', {
                          style: { display: 'inline-block', width: '20px', height: '20px', borderRadius: '4px', lineHeight: '20px', fontSize: '10px', fontWeight: '700', color: '#fff', background: scoreColor },
                        }, cell.count)
                      );
                    })
                  )
                )
              )
            )
          )
        )
      ),

      // 売上検証セクション
      showAnalysis && gatheringRevenue.length > 0 && React.createElement('div', { style: { marginTop: 'var(--space-lg)' } },
        React.createElement('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-secondary)' } }, 'fact_check'),
          '集客メモ x 売上 検証'
        ),
        React.createElement('div', { style: { overflowX: 'auto' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '450px' } },
            React.createElement('thead', null,
              React.createElement('tr', null,
                ['場所', 'メモ件数', '平均密度', '乗車件数', '総売上', '判定'].map(h =>
                  React.createElement('th', {
                    key: h,
                    style: { padding: '6px 8px', textAlign: h === '場所' ? 'left' : 'right', borderBottom: '2px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontWeight: 600 },
                  }, h)
                )
              )
            ),
            React.createElement('tbody', null,
              ...gatheringRevenue.slice(0, 15).map((gr, i) => {
                const verdictColor = gr.verdict === '行く価値あり' ? '#4caf50' : gr.verdict === '要検討' ? '#f9a825' : 'var(--text-muted)';
                const densityLabel = gr.avgDensity >= 2.5 ? '多い' : gr.avgDensity >= 1.5 ? '普通' : gr.avgDensity >= 0.5 ? '少ない' : 'いない';
                return React.createElement('tr', { key: i, style: { borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                  React.createElement('td', { style: { padding: '6px 8px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, gr.location),
                  React.createElement('td', { style: { padding: '6px 8px', textAlign: 'right' } }, `${gr.memoCount}件`),
                  React.createElement('td', { style: { padding: '6px 8px', textAlign: 'right' } }, `${densityLabel} (${gr.avgDensity})`),
                  React.createElement('td', { style: { padding: '6px 8px', textAlign: 'right', fontWeight: 500 } }, `${gr.matchedRides}回`),
                  React.createElement('td', { style: { padding: '6px 8px', textAlign: 'right', fontWeight: 500, color: 'var(--color-secondary)' } }, `¥${gr.matchedAmount.toLocaleString()}`),
                  React.createElement('td', { style: { padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: verdictColor } }, gr.verdict)
                );
              })
            )
          )
        )
      ),

      showAnalysis && !analysis && entries.length === 0 && React.createElement('div', {
        style: { marginTop: 'var(--space-md)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' },
      }, 'データがありません。集客メモを記録すると分析が表示されます。')
    ),

    // ============================================================
    // 記録一覧
    // ============================================================
    React.createElement(Card, { title: `記録一覧（${filteredEntries.length}件）` },
      entries.length > 5 && React.createElement('div', { style: { marginBottom: 'var(--space-md)' } },
        React.createElement('input', {
          className: 'form-input', type: 'text',
          placeholder: '場所、メモ、日付で検索...',
          value: searchQuery,
          onChange: (e) => setSearchQuery(e.target.value),
          style: { fontSize: '13px' },
        })
      ),

      filteredEntries.length === 0 && React.createElement('div', {
        style: { textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: '13px' },
      }, entries.length === 0 ? 'まだ記録がありません' : '検索結果がありません'),

      ...filteredEntries.map(entry => {
        const isEditing = editingId === entry.id;
        const isDeleteConfirm = deleteConfirmId === entry.id;

        if (isEditing && editForm) {
          // 編集モード
          return React.createElement('div', {
            key: entry.id,
            style: {
              padding: '12px', marginBottom: '8px', borderRadius: '8px',
              background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.2)',
            },
          },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                React.createElement('input', {
                  className: 'form-input', type: 'text', value: editForm.location || '',
                  onChange: (e) => setEditForm({ ...editForm, location: e.target.value }),
                  placeholder: '場所', style: { flex: '1 1 150px', fontSize: '12px' },
                }),
                React.createElement('input', {
                  className: 'form-input', type: 'date', value: editForm.date || '',
                  onChange: (e) => setEditForm({ ...editForm, date: e.target.value }),
                  style: { flex: '0 0 130px', fontSize: '12px', colorScheme: 'dark' },
                }),
                React.createElement('input', {
                  className: 'form-input', type: 'time', value: editForm.time || '',
                  onChange: (e) => setEditForm({ ...editForm, time: e.target.value }),
                  style: { flex: '0 0 100px', fontSize: '12px', colorScheme: 'dark' },
                })
              ),
              React.createElement('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
                ...DENSITY_OPTIONS.map(d =>
                  React.createElement('button', {
                    key: d.value, type: 'button',
                    onClick: () => setEditForm({ ...editForm, density: d.value }),
                    style: {
                      ...chipStyle(editForm.density === d.value),
                      ...(editForm.density === d.value ? { borderColor: d.color, background: d.bg, color: d.color } : {}),
                      padding: '4px 10px', fontSize: '11px',
                    },
                  }, d.label)
                )
              ),
              React.createElement('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
                ...LOCATION_TYPE_OPTIONS.map(t =>
                  React.createElement('button', {
                    key: t.value, type: 'button',
                    onClick: () => setEditForm({ ...editForm, locationType: t.value }),
                    style: { ...chipStyle(editForm.locationType === t.value), padding: '4px 10px', fontSize: '11px' },
                  }, t.label)
                )
              ),
              React.createElement('input', {
                className: 'form-input', type: 'text', value: editForm.memo || '',
                onChange: (e) => setEditForm({ ...editForm, memo: e.target.value }),
                placeholder: 'メモ', style: { fontSize: '12px' },
              }),
              React.createElement('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
                React.createElement(Button, { variant: 'secondary', onClick: cancelEdit, style: { padding: '4px 12px', fontSize: '11px' } }, '取消'),
                React.createElement(Button, { variant: 'primary', onClick: saveEdit, style: { padding: '4px 12px', fontSize: '11px' } }, '保存')
              )
            )
          );
        }

        // 通常表示
        const info = entry.dayOfWeek ? { dayOfWeek: entry.dayOfWeek, holiday: entry.holiday, isSunday: entry.dayOfWeek === '日', isSaturday: entry.dayOfWeek === '土', isHoliday: !!entry.holiday } : JapaneseHolidays.getDateInfo(entry.date);
        const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-muted)';
        const typeLabel = LOCATION_TYPE_OPTIONS.find(t => t.value === entry.locationType)?.label || '';

        return React.createElement('div', {
          key: entry.id,
          style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
          },
        },
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)' } }, 'place'),
              React.createElement('span', { style: { wordBreak: 'break-all' } }, entry.location || '---'),
              densityBadge(entry.density)
            ),
            React.createElement('div', {
              style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', marginTop: '4px' },
            },
              React.createElement('span', null, entry.date),
              React.createElement('span', { style: { color: dayColor, fontWeight: '600' } }, `(${info.dayOfWeek})`),
              info.holiday && React.createElement('span', {
                style: { color: '#ef4444', fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(239,68,68,0.1)' },
              }, info.holiday),
              entry.time && React.createElement('span', {
                style: { fontSize: '11px', color: 'var(--color-primary-light)', fontWeight: '600', padding: '1px 6px', borderRadius: '3px', background: 'rgba(26,115,232,0.12)' },
              }, entry.time),
              entry.weather && React.createElement('span', null, entry.weather),
              typeLabel && React.createElement('span', {
                style: { fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' },
              }, typeLabel),
              entry.stayMinutes > 0 && React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${entry.stayMinutes}分`),
              entry.memo && React.createElement('span', { style: { color: 'var(--text-secondary)' } }, `| ${entry.memo}`),
              entry.source === 'voice' && React.createElement('span', {
                className: 'material-icons-round',
                style: { fontSize: '12px', color: 'var(--color-secondary)', marginLeft: '2px' },
                title: '音声入力',
              }, 'mic')
            )
          ),
          React.createElement('div', { style: { display: 'flex', gap: '2px', flexShrink: 0, marginLeft: '8px' } },
            React.createElement('button', {
              onClick: () => startEdit(entry),
              style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '4px' },
              title: '編集',
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'edit')
            ),
            React.createElement('button', {
              onClick: () => handleDelete(entry.id),
              style: {
                background: 'none', border: 'none', cursor: 'pointer',
                color: isDeleteConfirm ? '#e53935' : 'var(--text-muted)',
                padding: '4px', borderRadius: '4px',
              },
              title: isDeleteConfirm ? '本当に削除しますか？' : '削除',
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, isDeleteConfirm ? 'delete_forever' : 'delete_outline')
            )
          )
        );
      })
    )
  );
};

})();
