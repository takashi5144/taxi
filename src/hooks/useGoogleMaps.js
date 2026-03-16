(function() {
// useGoogleMaps.js - Google Maps API管理フック
//
// GoogleMap.jsx内のシングルトンローダー (window._gmapLoader) を再利用し、
// 複数コンポーネントからGoogle Maps APIの状態を参照可能にする。

window.useGoogleMaps = () => {
  const { useState, useEffect, useCallback } = React;
  const { apiKey } = useAppContext();
  const [isLoaded, setIsLoaded] = useState(!!(window.google && window.google.maps));
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Google Maps API をロード（window._gmapLoader に委譲）
  const loadApi = useCallback(() => {
    if (!apiKey) {
      setError(null);
      setIsLoaded(false);
      return;
    }

    if (window.google && window.google.maps) {
      setIsLoaded(true);
      setError(null);
      return;
    }

    if (!window._gmapLoader) {
      setError('Google Maps ローダーが見つかりません。');
      AppLogger.error('window._gmapLoader が未定義です');
      return;
    }

    setIsLoading(true);

    window._gmapLoader.load(apiKey).then(() => {
      setIsLoaded(true);
      setIsLoading(false);
      setError(null);
      AppLogger.info('Google Maps API ロード完了 (useGoogleMaps via _gmapLoader)');
    }).catch((err) => {
      setError('Google Maps API の読み込みに失敗しました。APIキーを確認してください。');
      setIsLoading(false);
      AppLogger.error('Google Maps API ロード失敗 (useGoogleMaps via _gmapLoader): ' + (err && err.message));
    });
  }, [apiKey]);

  useEffect(() => {
    loadApi();
  }, [loadApi]);

  return {
    isLoaded,
    isLoading,
    error,
    apiKey,
    reload: loadApi,
  };
};

})();
