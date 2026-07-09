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

  // DataServiceから最新データを取得するためのrefreshKey
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ date: todayDefault, weather: '', temperature: null, amount: '', paymentMethod: 'cash', discounts: {}, pickup: '', pickupTime: '', dropoff: '', dropoffTime: '', passengers: '1', gender: '', purpose: '', memo: '', source: '', isRegisteredUser: false, customerName: '' });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [gpsLoading, setGpsLoading] = useState({ pickup: false, dropoff: false });
  const [gpsInfo, setGpsInfo] = useState({ pickup: null, dropoff: null });
  const [aggregateDate, setAggregateDate] = useState(() => {
    const h = new Date().getHours();
    return (h >= 0 && h < 5) ? 'previous' : 'today';
  }); // 0〜5時は前日合算がデフォルト
  const sourceSectionRef = useRef(null);

  const mapCtx = useMapContext();

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
        // 日付が変わっていたらフォームの日付を自動更新（シフト中は始業日を維持）
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

    if (false) {
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
  }, [false, _applyLandmarkName]);

  // GPS現在地を取得して住所に変換

  // GPS取得完了後に次のセクションへ自動スクロール

  // Geocoding結果から簡潔な住所を抽出（共通ユーティリティ委譲）
  const _formatAddress = TaxiApp.utils.formatAddress;


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
    // 待機情報を保存（オンの場合のみ）
    /* standby UI removed */

    // 合算日の設定（前日合算の場合、shiftDateを前日にする）
    if (aggregateDate === 'previous') {
      const d = new Date(formWithCoords.date || getLocalDateString());
      d.setDate(d.getDate() - 1);
      formWithCoords.shiftDate = getLocalDateString(d);
    } else {
      formWithCoords.shiftDate = formWithCoords.date || getLocalDateString();
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
    setAggregateDate((() => { const h = new Date().getHours(); return (h >= 0 && h < 5) ? 'previous' : 'today'; })());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
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

  // 起動時自動クリーンアップ（ゴミ箱 + 不要な待機記録）
  useEffect(() => { DataService.cleanupTrash(); DataService.cleanupOtherStandby(); }, []);

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
    getAccuratePosition({ accuracyThreshold: 30, timeout: 15000, maxWaitAfterFix: 5000, minReadings: 2 })
      .then((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = Math.round(position.coords.accuracy);
        const coordsKey = field === 'pickup' ? 'pickupCoords' : 'dropoffCoords';
        const timeField = field === 'pickup' ? 'pickupTime' : 'dropoffTime';
        AppLogger.info(`編集GPS取得 (${field}): ${lat.toFixed(6)}, ${lng.toFixed(6)} 精度${acc}m`);
        // 逆ジオコーディング（Nominatim）
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
          if (TaxiApp.utils.findNearbyLandmark) {
            const lmKey = field === 'pickup' ? 'pickupLandmark' : 'dropoffLandmark';
            TaxiApp.utils.findNearbyLandmark(lat, lng).then(lm => {
              if (lm) setEditForm(prev => ({ ...prev, [lmKey]: lm }));
            }).catch(() => {});
          }
        }).catch(() => {
          setEditGpsLoading(prev => ({ ...prev, [field]: false }));
          setEditForm(prev => ({ ...prev, [field]: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, [timeField]: getNowTime(), [coordsKey]: { lat, lng } }));
        });
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

          // 合算日の選択（当日/前日）
          React.createElement('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)',
              padding: '8px 12px', borderRadius: '8px',
              background: aggregateDate === 'previous' ? 'rgba(255,167,38,0.08)' : 'rgba(255,255,255,0.03)',
              border: aggregateDate === 'previous' ? '1px solid rgba(255,167,38,0.25)' : '1px solid rgba(255,255,255,0.08)',
            },
          },
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '16px', color: aggregateDate === 'previous' ? '#ffa726' : 'var(--text-muted)' },
            }, 'date_range'),
            React.createElement('span', { style: { fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' } }, '合算日:'),
            React.createElement('button', {
              onClick: () => setAggregateDate('today'),
              style: {
                padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: aggregateDate === 'today' ? 700 : 400,
                background: aggregateDate === 'today' ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: aggregateDate === 'today' ? '#fff' : 'var(--text-muted)',
              },
            }, '当日'),
            React.createElement('button', {
              onClick: () => setAggregateDate('previous'),
              style: {
                padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: aggregateDate === 'previous' ? 700 : 400,
                background: aggregateDate === 'previous' ? '#ffa726' : 'rgba(255,255,255,0.08)',
                color: aggregateDate === 'previous' ? '#fff' : 'var(--text-muted)',
              },
            }, '前日'),
            aggregateDate === 'previous' && React.createElement('span', {
              style: { fontSize: '10px', color: '#ffa726', marginLeft: 'auto' },
            }, (() => {
              const d = new Date(form.date || getLocalDateString());
              d.setDate(d.getDate() - 1);
              return getLocalDateString(d) + 'に合算';
            })())
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
              ...['cash', 'uncollected', 'didi', 'uber', 'ticket'].map(method => {
                const selected = form.paymentMethod === method;
                const labels = { cash: '現金', uncollected: '未収', didi: 'DIDI決済', uber: 'Uber', ticket: 'チケット' };
                const icons = { cash: 'payments', uncollected: 'pending', didi: 'smartphone', uber: 'hail', ticket: 'confirmation_number' };
                const colors = { cash: 'var(--color-accent)', uncollected: 'var(--color-error)', didi: 'var(--color-warning)', uber: '#fff', ticket: '#4fc3f7' };
                const bgs = { cash: 'rgba(0,200,83,0.15)', uncollected: 'rgba(229,57,53,0.15)', didi: 'rgba(255,152,0,0.15)', uber: 'rgba(0,0,0,0.3)', ticket: 'rgba(79,195,247,0.15)' };
                const label = labels[method];
                const icon = icons[method];
                const activeColor = colors[method];
                const activeBg = bgs[method];
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
              ...['disability', 'longDistance', 'coupon'].map(dtype => {
                const selected = dtype in (form.discounts || {});
                const labels = { disability: '障害者割引', longDistance: '遠距離割', coupon: 'クーポン' };
                const icons = { disability: 'accessible', longDistance: 'route', coupon: 'local_offer' };
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
                ...['disability', 'longDistance', 'coupon'].map(dtype => {
                  const sel = dtype in (editForm.discounts || {});
                  const labels = { disability: '障害者割引', longDistance: '遠距離割', coupon: 'クーポン' };
                  const icons = { disability: 'accessible', longDistance: 'route', coupon: 'local_offer' };
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
                  entry.shiftDate && entry.shiftDate !== eDate && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(255,152,0,0.15)', color: '#ffb74d', fontWeight: '600' },
                  }, `${entry.shiftDate}合算`),
                  entry.shiftDate && entry.shiftDate === eDate && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,200,83,0.12)', color: '#66bb6a', fontWeight: '600' },
                  }, '当日合算'),
                  entry.passengers && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' },
                  }, `${entry.passengers}名`),
                  entry.source && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255,152,0,0.15)', color: '#ffb74d', fontWeight: '600' },
                  }, entry.source),
                  entry.isRegisteredUser && React.createElement('span', {
                    style: { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '2px' },
                  },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '10px' } }, 'person'),
                    entry.customerName || 'ユーザー'
                  ),
                  React.createElement('span', null, new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }))
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
                const typeLabels = { disability: '障害者割引', longDistance: '遠距離割', coupon: 'クーポン', ticket: 'チケット' };
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
