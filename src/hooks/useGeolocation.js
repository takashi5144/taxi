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

// 高精度GPS取得ユーティリティ
// watchPositionで精度が閾値以下になるまで監視し、最も精度の高い位置を返す
window.getAccuratePosition = (options = {}) => {
  const {
    accuracyThreshold = 50,   // メートル — この精度以下で即座に返す
    timeout = 20000,           // 全体タイムアウト（ms）
    maxWaitAfterFix = 8000,    // 初回取得後、改善を待つ最大時間（ms）
  } = options;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 0, message: 'このブラウザではGPS機能が使えません' });
      return;
    }

    let bestPosition = null;
    let watchId = null;
    let overallTimer = null;
    let waitTimer = null;

    const cleanup = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (overallTimer) clearTimeout(overallTimer);
      if (waitTimer) clearTimeout(waitTimer);
      watchId = null;
      overallTimer = null;
      waitTimer = null;
    };

    const finish = () => {
      cleanup();
      if (bestPosition) {
        AppLogger.info(`GPS確定: 精度${bestPosition.coords.accuracy.toFixed(0)}m (${bestPosition.coords.latitude.toFixed(6)}, ${bestPosition.coords.longitude.toFixed(6)})`);
        resolve(bestPosition);
      } else {
        reject({ code: 2, message: '現在地を取得できませんでした。' });
      }
    };

    // 全体タイムアウト
    overallTimer = setTimeout(finish, timeout);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const acc = position.coords.accuracy;
        AppLogger.debug(`GPS受信: 精度${acc.toFixed(0)}m`);

        // より精度が高い位置を保持
        if (!bestPosition || acc < bestPosition.coords.accuracy) {
          bestPosition = position;
        }

        // 精度が閾値以下なら即確定
        if (acc <= accuracyThreshold) {
          cleanup();
          AppLogger.info(`GPS高精度確定: ${acc.toFixed(0)}m`);
          resolve(position);
          return;
        }

        // 初回取得後、改善待ちタイマーを開始（1回だけ）
        if (!waitTimer) {
          waitTimer = setTimeout(finish, maxWaitAfterFix);
        }
      },
      (error) => {
        cleanup();
        reject(error);
      },
      { enableHighAccuracy: true, timeout: timeout, maximumAge: 0 }
    );
  });
};
