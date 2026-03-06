(function() {
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

    AppLogger.info('現在地を取得中（高精度モード）...');

    // getAccuratePositionを使い、複数回のGPS測位から最良の結果を取得
    getAccuratePosition({ accuracyThreshold: 100, timeout: 15000, maxWaitAfterFix: 5000 })
      .then((position) => {
        mapCtx.updatePosition(position);
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        mapCtx.setMapCenter(pos);
        AppLogger.info(`現在地取得成功: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} 精度: ${Math.round(position.coords.accuracy)}m`);
      })
      .catch((error) => {
        const msg = error.message || getErrorMessage(error);
        mapCtx.setGpsError(msg);
        AppLogger.error(`GPS取得エラー: ${msg}`);
      });
  }, [isSupported, mapCtx]);

  const startTracking = useCallback(() => {
    if (!isSupported) return;

    // 既存のwatchがあればクリアしてから開始
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

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
    mapCtx.setCurrentPosition(null);
    AppLogger.info('GPS追跡を停止');
  }, [mapCtx]);

  // 始業中なら自動でGPS追跡を開始（始業していなければ開始しない）
  useEffect(() => {
    let shifts = [];
    try { shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]'); } catch { /* ignore */ }
    const activeShift = shifts.find(s => !s.endTime);
    if (isSupported && !watchIdRef.current && activeShift) {
      AppLogger.info('GPS追跡を自動開始（始業中）');
      GpsLogService.startWeatherPolling();
      mapCtx.setIsTracking(true);
      const id = navigator.geolocation.watchPosition(
        (position) => { mapCtx.updatePosition(position); },
        (error) => {
          const msg = getErrorMessage(error);
          mapCtx.setGpsError(msg);
          AppLogger.warn(`GPS追跡エラー: ${msg}`);
        },
        APP_CONSTANTS.GPS_OPTIONS
      );
      watchIdRef.current = id;
      setWatchId(id);
    }
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
window.getAccuratePosition = (options = {}) => {
  const {
    accuracyThreshold = 50,
    timeout = 20000,
    maxWaitAfterFix = 8000,
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
    let settled = false;

    const cleanup = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (overallTimer) clearTimeout(overallTimer);
      if (waitTimer) clearTimeout(waitTimer);
      watchId = null;
      overallTimer = null;
      waitTimer = null;
    };

    const doResolve = (pos) => {
      if (settled) return;
      settled = true;
      cleanup();
      AppLogger.info(`GPS確定: 精度${pos.coords.accuracy.toFixed(0)}m (${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)})`);
      resolve(pos);
    };

    const doReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const finish = () => {
      if (bestPosition) {
        doResolve(bestPosition);
      } else {
        doReject({ code: 2, message: '現在地を取得できませんでした。' });
      }
    };

    overallTimer = setTimeout(finish, timeout);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (settled) return;
        const acc = position.coords.accuracy;
        AppLogger.info(`GPS受信: 精度${acc.toFixed(0)}m lat=${position.coords.latitude.toFixed(6)} lng=${position.coords.longitude.toFixed(6)}`);

        if (!bestPosition || acc < bestPosition.coords.accuracy) {
          bestPosition = position;
        }

        if (acc <= accuracyThreshold) {
          doResolve(position);
          return;
        }

        if (!waitTimer) {
          waitTimer = setTimeout(finish, maxWaitAfterFix);
        }
      },
      (error) => {
        // Permission denied は即座にreject（リトライしても無駄）
        if (error.code === 1) {
          doReject(error);
          return;
        }
        // その他のエラー（TIMEOUT/POSITION_UNAVAILABLE）は一時的な場合があるので
        // bestPositionがあればそれを使い、なければ全体タイムアウトに任せる
        AppLogger.warn(`GPS一時エラー: code=${error.code} ${error.message || ''}`);
        if (bestPosition) {
          doResolve(bestPosition);
        }
        // bestPositionがなければoverallTimerのfinish()でrejectされる
      },
      { enableHighAccuracy: true, timeout: Math.min(timeout, 15000), maximumAge: 0 }
    );
  });
};

})();
