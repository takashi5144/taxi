// useGeolocation.js - GPS位置情報カスタムフック
window.useGeolocation = () => {
  const { useState, useEffect, useRef, useCallback } = React;
  const mapCtx = useMapContext();
  const [watchId, setWatchId] = useState(null);
  const watchIdRef = useRef(null);

  const isSupported = 'geolocation' in navigator;

  const getCurrentPosition = useCallback(() => {
    if (!isSupported) {
      mapCtx.setGpsError('このブラウザはGPSに対応していません');
      AppLogger.error('Geolocation API 非対応');
      return;
    }

    AppLogger.info('現在地を取得中...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapCtx.updatePosition(position);
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        mapCtx.setMapCenter(pos);
        AppLogger.info(`現在地取得成功: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
      },
      (error) => {
        const msg = getErrorMessage(error);
        mapCtx.setGpsError(msg);
        AppLogger.error(`GPS取得エラー: ${msg}`);
      },
      APP_CONSTANTS.GPS_OPTIONS
    );
  }, [isSupported, mapCtx]);

  const startTracking = useCallback(() => {
    if (!isSupported) return;

    AppLogger.info('GPS追跡を開始');
    mapCtx.setIsTracking(true);

    const id = navigator.geolocation.watchPosition(
      (position) => {
        mapCtx.updatePosition(position);
      },
      (error) => {
        const msg = getErrorMessage(error);
        mapCtx.setGpsError(msg);
        AppLogger.warn(`GPS追跡エラー: ${msg}`);
      },
      APP_CONSTANTS.GPS_OPTIONS
    );

    watchIdRef.current = id;
    setWatchId(id);
  }, [isSupported, mapCtx]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setWatchId(null);
    }
    mapCtx.setIsTracking(false);
    AppLogger.info('GPS追跡を停止');
  }, [mapCtx]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    isSupported,
    getCurrentPosition,
    startTracking,
    stopTracking,
    isTracking: mapCtx.isTracking,
  };
};

function getErrorMessage(error) {
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
