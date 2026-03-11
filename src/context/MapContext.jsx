(function() {
// MapContext.jsx - 地図・GPS状態管理
// GPS追跡（watchPosition）をここで一元管理し、ページ遷移で途切れないようにする。
// 天気ポーリングもstartTracking/stopTrackingに連動。
const { createContext, useState, useCallback, useContext, useRef, useEffect, useMemo } = React;

window.MapContext = createContext(null);

// GPSエラーメッセージ変換
function _getGpsErrorMessage(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return '位置情報の権限が拒否されました';
    case error.POSITION_UNAVAILABLE:
      return '位置情報を取得できません';
    case error.TIMEOUT:
      return '位置情報の取得がタイムアウトしました';
    default:
      return '位置情報の取得中にエラーが発生しました';
  }
}

window.MapProvider = ({ children }) => {
  const [currentPosition, setCurrentPosition] = useState(null);
  const [mapCenter, setMapCenter] = useState(APP_CONSTANTS.DEFAULT_MAP_CENTER);
  const [zoom, setZoom] = useState(APP_CONSTANTS.DEFAULT_MAP_ZOOM);
  const [isTracking, setIsTracking] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [heading, setHeading] = useState(null);
  const [standbyStatus, setStandbyStatus] = useState(null);
  const [currentLocationName, setCurrentLocationName] = useState(null);

  const watchIdRef = useRef(null);
  const standbyTimerRef = useRef(null);
  const locationLookupRef = useRef(null); // 重複防止用

  const updatePosition = useCallback((position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    // 無効な座標を無視
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    const pos = { lat, lng };
    setCurrentPosition(pos);
    setAccuracy(position.coords.accuracy);
    setSpeed(position.coords.speed);
    setHeading(position.coords.heading);
    setGpsError(null);
    if (window.GpsLogService) {
      window.GpsLogService.maybeRecord(pos.lat, pos.lng, position.coords.accuracy, position.coords.speed);
      // 待機状態を更新
      setStandbyStatus(window.GpsLogService.getRealtimeStandbyStatus());
    }
    // 現在地名を更新（既知スポット→ランドマーク→住所の優先順位）
    const lookupId = Date.now();
    locationLookupRef.current = lookupId;
    // まず既知スポットを同期チェック
    const knownPlace = window.TaxiApp && TaxiApp.utils.matchKnownPlace
      ? TaxiApp.utils.matchKnownPlace(pos.lat, pos.lng) : null;
    if (knownPlace) {
      setCurrentLocationName(knownPlace);
      // 同期で確定したのでlookupIdを無効化（非同期結果に上書きされない）
      locationLookupRef.current = null;
    } else if (window.TaxiApp && TaxiApp.utils.findNearbyLandmark) {
      // 非同期でランドマーク/住所を取得
      TaxiApp.utils.findNearbyLandmark(pos.lat, pos.lng).then(name => {
        if (locationLookupRef.current !== lookupId) return; // 古い結果は無視
        if (name) {
          setCurrentLocationName(name);
        } else if (window.TaxiApp && TaxiApp.utils.reverseGeocode) {
          TaxiApp.utils.reverseGeocode(pos.lat, pos.lng).then(addr => {
            if (locationLookupRef.current !== lookupId) return;
            setCurrentLocationName(addr || null);
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  }, []);

  // GPS追跡開始（天気ポーリングも連動開始）
  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    // 既存のwatchがあればクリアしてから開始
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    AppLogger.info('GPS追跡を開始');
    setIsTracking(true);
    if (window.GpsLogService) window.GpsLogService.startWeatherPolling();

    const id = navigator.geolocation.watchPosition(
      (position) => { updatePosition(position); },
      (error) => {
        const msg = _getGpsErrorMessage(error);
        setGpsError(msg);
        AppLogger.warn(`GPS追跡エラー: ${msg}`);
      },
      APP_CONSTANTS.GPS_OPTIONS
    );
    watchIdRef.current = id;
  }, [updatePosition]);

  // GPS追跡停止（天気ポーリングも連動停止）
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setCurrentPosition(null);
    if (window.GpsLogService) window.GpsLogService.stopWeatherPolling();
    AppLogger.info('GPS追跡を停止');
  }, []);

  // 待機中の経過時間をリアルタイム更新（10秒間隔）
  useEffect(() => {
    if (standbyTimerRef.current) { clearInterval(standbyTimerRef.current); standbyTimerRef.current = null; }
    if (isTracking && window.GpsLogService) {
      standbyTimerRef.current = setInterval(() => {
        setStandbyStatus(window.GpsLogService.getRealtimeStandbyStatus());
      }, 10000);
    }
    return () => {
      if (standbyTimerRef.current) { clearInterval(standbyTimerRef.current); standbyTimerRef.current = null; }
    };
  }, [isTracking]);

  // 始業中なら自動でGPS追跡を開始（MapProviderはアプリ全体を包むため、ページ遷移で途切れない）
  useEffect(() => {
    let shifts = [];
    try { shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]'); } catch { /* ignore */ }
    const activeShift = shifts.find(s => !s.endTime);
    if ('geolocation' in navigator && !watchIdRef.current && activeShift) {
      AppLogger.info('GPS追跡を自動開始（始業中）');
      startTracking();
    }
    return () => {
      // アプリ全体アンマウント時のクリーンアップ
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (window.GpsLogService) window.GpsLogService.stopWeatherPolling();
    };
  }, [startTracking]);

  // 設定画面の基本勤務時間による自動始業/終業 + GPS追跡
  // MapProviderはアプリ全体を包むので、どのページにいても動作する
  const startTrackingRef = useRef(startTracking);
  startTrackingRef.current = startTracking;
  const stopTrackingRef = useRef(stopTracking);
  stopTrackingRef.current = stopTracking;
  const isTrackingRef = useRef(isTracking);
  isTrackingRef.current = isTracking;

  useEffect(() => {
    let lastFiredMinute = '';
    const checkAutoShift = () => {
      const scheduledStart = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_START);
      const scheduledEnd = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_END);
      if (!scheduledStart && !scheduledEnd) return;

      const now = new Date();
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (nowHHMM === lastFiredMinute) return;

      let shifts = [];
      try { shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]'); } catch { return; }
      const activeShift = shifts.find(s => !s.endTime);

      // 自動始業: 設定時刻と一致 && 未始業 && 今日まだ自動始業していない
      if (scheduledStart && nowHHMM === scheduledStart && !activeShift) {
        const todayStr = getLocalDateString();
        const alreadyStartedToday = shifts.some(s => {
          const d = getLocalDateString(new Date(s.startTime));
          return d === todayStr && s.autoStarted;
        });
        if (!alreadyStartedToday) {
          lastFiredMinute = nowHHMM;
          const newShift = { id: Date.now().toString(), startTime: now.toISOString(), endTime: null, autoStarted: true };
          shifts.push(newShift);
          localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
          if (window.DataService) DataService.syncShiftsToCloud();
          // GPS追跡を開始
          if (!isTrackingRef.current) startTrackingRef.current();
          if (window.GpsLogService) GpsLogService.startWeatherPolling();
          window.dispatchEvent(new CustomEvent('taxi-data-changed'));
          window.dispatchEvent(new CustomEvent('taxi-auto-shift', { detail: { type: 'start', startTime: now.toISOString() } }));
          AppLogger.info(`自動始業: ${scheduledStart} — GPS追跡開始`);
        }
      }

      // 自動終業: 設定時刻と一致 && 始業中
      if (scheduledEnd && nowHHMM === scheduledEnd && activeShift) {
        lastFiredMinute = nowHHMM;
        // 休憩中なら終了
        try {
          const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
          const ab = breaks.find(b => !b.endTime);
          if (ab) {
            ab.endTime = now.toISOString();
            localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
            if (window.DataService) DataService.syncBreaksToCloud();
          }
        } catch {}
        activeShift.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
        if (window.DataService) DataService.syncShiftsToCloud();
        // GPS追跡を停止
        if (window.GpsLogService && GpsLogService.flushRealtimeStandby) GpsLogService.flushRealtimeStandby();
        if (isTrackingRef.current) stopTrackingRef.current();
        if (window.GpsLogService) GpsLogService.stopWeatherPolling();
        window.dispatchEvent(new CustomEvent('taxi-data-changed'));
        window.dispatchEvent(new CustomEvent('taxi-auto-shift', { detail: { type: 'end' } }));
        AppLogger.info(`自動終業: ${scheduledEnd} — GPS追跡停止`);
      }
    };

    // 30秒間隔でチェック
    const timer = setInterval(checkAutoShift, 30000);
    const handleScheduleChanged = () => checkAutoShift();
    window.addEventListener('taxi-shift-schedule-changed', handleScheduleChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener('taxi-shift-schedule-changed', handleScheduleChanged);
    };
  }, []);

  // 待機開始時刻を手動変更
  const updateStandbyStartTime = useCallback((hhmm) => {
    if (window.GpsLogService && window.GpsLogService.setStandbyStartTime(hhmm)) {
      setStandbyStatus(window.GpsLogService.getRealtimeStandbyStatus());
      return true;
    }
    return false;
  }, []);

  // 待機場所名を手動変更
  const updateStandbyLocationName = useCallback((name) => {
    if (window.GpsLogService && window.GpsLogService.setStandbyLocationName(name)) {
      setStandbyStatus(window.GpsLogService.getRealtimeStandbyStatus());
      return true;
    }
    return false;
  }, []);

  // useMemoでvalueを安定化（不要な再レンダリング防止）
  const value = useMemo(() => ({
    currentPosition,
    setCurrentPosition,
    mapCenter,
    setMapCenter,
    zoom,
    setZoom,
    isTracking,
    setIsTracking,
    gpsError,
    setGpsError,
    accuracy,
    speed,
    heading,
    standbyStatus,
    currentLocationName,
    updatePosition,
    startTracking,
    stopTracking,
    updateStandbyStartTime,
    updateStandbyLocationName,
  }), [currentPosition, mapCenter, zoom, isTracking, gpsError, accuracy, speed, heading, standbyStatus, currentLocationName, updatePosition, startTracking, stopTracking, updateStandbyStartTime, updateStandbyLocationName]);

  return React.createElement(MapContext.Provider, { value }, children);
};

window.useMapContext = () => useContext(MapContext);

})();
