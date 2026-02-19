// useGoogleMaps.js - Google Maps API管理フック
//
// GoogleMap.jsx内のローダーロジックをフックとして公開し、
// 複数コンポーネントからGoogle Maps APIの状態を参照可能にする。

window.useGoogleMaps = () => {
  const { useState, useEffect, useCallback } = React;
  const { apiKey } = useAppContext();
  const [isLoaded, setIsLoaded] = useState(!!(window.google && window.google.maps));
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Google Maps API をロード
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

    setIsLoading(true);

    // 既存のスクリプトがあるかチェック
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // ロード完了を待つ
      const check = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(check);
          setIsLoaded(true);
          setIsLoading(false);
          setError(null);
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&language=ja&region=JP`;
    script.async = true;
    script.onload = () => {
      setIsLoaded(true);
      setIsLoading(false);
      setError(null);
      AppLogger.info('Google Maps API ロード完了 (useGoogleMaps)');
    };
    script.onerror = () => {
      setError('Google Maps API の読み込みに失敗しました。APIキーを確認してください。');
      setIsLoading(false);
      AppLogger.error('Google Maps API ロード失敗 (useGoogleMaps)');
    };
    document.head.appendChild(script);
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
