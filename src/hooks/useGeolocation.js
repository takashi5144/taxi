(function() {
// useGeolocation.js - GPS位置情報カスタムフック
// GPS追跡（watchPosition）はMapContextで一元管理。
// このフックはgetCurrentPosition（単発高精度取得）と、MapContextへの委譲を提供する。
window.useGeolocation = () => {
  const { useCallback } = React;
  const { updatePosition, setGpsError, setMapCenter, startTracking, stopTracking, isTracking } = useMapContext();

  const isSupported = 'geolocation' in navigator;

  const getCurrentPosition = useCallback(() => {
    if (!isSupported) {
      setGpsError('このブラウザはGPSに対応していません');
      AppLogger.error('Geolocation API 非対応');
      return;
    }

    AppLogger.info('現在地を取得中（高精度モード）...');

    // getAccuratePositionを使い、複数回のGPS測位から最良の結果を取得
    getAccuratePosition({ accuracyThreshold: 30, timeout: 20000, maxWaitAfterFix: 8000, minReadings: 3 })
      .then((position) => {
        updatePosition(position);
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMapCenter(pos);
        AppLogger.info(`現在地取得成功: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} 精度: ${Math.round(position.coords.accuracy)}m`);
      })
      .catch((error) => {
        const msg = error.message || _getGeoErrorMessage(error);
        setGpsError(msg);
        AppLogger.error(`GPS取得エラー: ${msg}`);
      });
  }, [isSupported, updatePosition, setGpsError, setMapCenter]);

  return {
    isSupported,
    getCurrentPosition,
    startTracking,
    stopTracking,
    isTracking,
  };
};

function _getGeoErrorMessage(error) {
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
    minReadings = 3,         // 最低取得回数（精度改善のため複数回取得）
  } = options;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 0, message: 'このブラウザではGPS機能が使えません' });
      return;
    }

    let bestPosition = null;
    let readingCount = 0;
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
      AppLogger.info(`GPS確定: 精度${pos.coords.accuracy.toFixed(0)}m (${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}) [${readingCount}回測位]`);
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
        readingCount++;
        AppLogger.info(`GPS受信 #${readingCount}: 精度${acc.toFixed(0)}m lat=${position.coords.latitude.toFixed(6)} lng=${position.coords.longitude.toFixed(6)}`);

        if (!bestPosition || acc < bestPosition.coords.accuracy) {
          bestPosition = position;
        }

        // 閾値以下の精度かつ最低取得回数を満たした場合に即確定
        if (acc <= accuracyThreshold && readingCount >= minReadings) {
          doResolve(bestPosition);
          return;
        }

        // 閾値以下でもまだ最低取得回数に達していない場合は待つ
        if (acc <= accuracyThreshold && readingCount < minReadings) {
          // 残りの測位を短い待機で待つ（既に良い精度なので長く待たない）
          if (!waitTimer) {
            waitTimer = setTimeout(finish, Math.min(maxWaitAfterFix, 3000));
          }
          return;
        }

        // 閾値を超えている場合、最初の測位を受信したら待機タイマー開始
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
        if (bestPosition && readingCount >= minReadings) {
          doResolve(bestPosition);
        }
        // bestPositionがなければoverallTimerのfinish()でrejectされる
      },
      { enableHighAccuracy: true, timeout: Math.min(timeout, 15000), maximumAge: 0 }
    );
  });
};

})();
