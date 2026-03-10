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

  const watchIdRef = useRef(null);
  const standbyTimerRef = useRef(null);

  const updatePosition = useCallback((position) => {
    const pos = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    setCurrentPosition(pos);
    setAccuracy(position.coords.accuracy);
    setSpeed(position.coords.speed);
    setHeading(position.coords.heading);
    setGpsError(null);
    if (window.GpsLogService) {
      GpsLogService.maybeRecord(pos.lat, pos.lng, position.coords.accuracy, position.coords.speed);
      // 待機状態を更新
      setStandbyStatus(GpsLogService.getRealtimeStandbyStatus());
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
    if (window.GpsLogService) GpsLogService.startWeatherPolling();

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
    if (window.GpsLogService) GpsLogService.stopWeatherPolling();
    AppLogger.info('GPS追跡を停止');
  }, []);

  // 待機中の経過時間をリアルタイム更新（10秒間隔）
  useEffect(() => {
    if (standbyTimerRef.current) { clearInterval(standbyTimerRef.current); standbyTimerRef.current = null; }
    if (isTracking && window.GpsLogService) {
      standbyTimerRef.current = setInterval(() => {
        setStandbyStatus(GpsLogService.getRealtimeStandbyStatus());
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
      if (window.GpsLogService) GpsLogService.stopWeatherPolling();
    };
  }, []);

  // 待機開始時刻を手動変更
  const updateStandbyStartTime = useCallback((hhmm) => {
    if (window.GpsLogService && GpsLogService.setStandbyStartTime(hhmm)) {
      setStandbyStatus(GpsLogService.getRealtimeStandbyStatus());
      return true;
    }
    return false;
  }, []);

  // 待機場所名を手動変更
  const updateStandbyLocationName = useCallback((name) => {
    if (window.GpsLogService && GpsLogService.setStandbyLocationName(name)) {
      setStandbyStatus(GpsLogService.getRealtimeStandbyStatus());
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
    updatePosition,
    startTracking,
    stopTracking,
    updateStandbyStartTime,
    updateStandbyLocationName,
  }), [currentPosition, mapCenter, zoom, isTracking, gpsError, accuracy, speed, heading, standbyStatus, updatePosition, startTracking, stopTracking, updateStandbyStartTime, updateStandbyLocationName]);

  return React.createElement(MapContext.Provider, { value }, children);
};

window.useMapContext = () => useContext(MapContext);

})();
