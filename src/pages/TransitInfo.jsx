// TransitInfo.jsx - 公共交通機関情報ページ
// Gemini AI を使用して電車・バス・飛行機の運行情報と遅延情報を取得
window.TransitInfoPage = () => {
  const { useState, useCallback } = React;
  const { geminiApiKey } = useAppContext();

  // 各カテゴリの状態管理
  const [trainData, setTrainData] = useState({ loading: false, result: null, error: null });
  const [busData, setBusData] = useState({ loading: false, result: null, error: null });
  const [flightData, setFlightData] = useState({ loading: false, result: null, error: null });
  const [troubleData, setTroubleData] = useState({ loading: false, result: null, error: null });

  // 汎用取得関数
  const fetchCategory = useCallback(async (fetchFn, setData) => {
    setData({ loading: true, result: null, error: null });
    const result = await fetchFn(geminiApiKey);
    if (result.success) {
      setData({ loading: false, result: result.text, error: null });
    } else {
      setData({ loading: false, result: null, error: result.error });
    }
  }, [geminiApiKey]);

  // 各カテゴリの取得ハンドラ
  const handleFetchTrain = useCallback(() => fetchCategory(GeminiService.fetchTrainInfo, setTrainData), [fetchCategory]);
  const handleFetchBus = useCallback(() => fetchCategory(GeminiService.fetchBusInfo, setBusData), [fetchCategory]);
  const handleFetchFlight = useCallback(() => fetchCategory(GeminiService.fetchFlightInfo, setFlightData), [fetchCategory]);
  const handleFetchTrouble = useCallback(() => fetchCategory(GeminiService.fetchTroubleInfo, setTroubleData), [fetchCategory]);

  // 結果表示コンポーネント
  const renderResult = (data) => {
    if (data.loading) {
      return React.createElement('div', {
        style: {
          padding: 'var(--space-lg)', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '32px', color: 'var(--color-primary-light)', animation: 'spin 1s linear infinite' },
        }, 'sync'),
        React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' } }, 'Gemini AIが情報を取得中...')
      );
    }

    if (data.error) {
      return React.createElement('div', {
        style: {
          padding: '10px 14px', borderRadius: '8px', marginTop: '12px',
          background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.3)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-danger)' } }, 'error'),
        React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' } }, data.error)
      );
    }

    if (data.result) {
      return React.createElement('div', { style: { marginTop: '12px' } },
        React.createElement('div', {
          style: {
            padding: 'var(--space-md)', borderRadius: '8px',
            background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.15)',
          },
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)',
              lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            },
          }, data.result),
          React.createElement('div', {
            style: { marginTop: '10px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, 'info'),
            '※ AIによる回答のため、最新情報は各交通機関の公式サイトをご確認ください'
          )
        )
      );
    }

    return null;
  };

  // カテゴリカードコンポーネント
  const renderCategoryCard = (icon, title, description, data, onFetch, color) => {
    return React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)' },
    },
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data.result || data.loading || data.error ? '0' : '0' },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1 },
        },
          React.createElement('div', {
            style: {
              width: '40px', height: '40px', borderRadius: '10px',
              background: `rgba(${color}, 0.12)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            },
          },
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '22px', color: `rgb(${color})` },
            }, icon)
          ),
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' } }, title),
            React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' } }, description)
          )
        ),
        React.createElement(Button, {
          variant: 'primary',
          icon: data.loading ? 'sync' : 'download',
          onClick: onFetch,
          disabled: data.loading,
          style: { whiteSpace: 'nowrap', fontSize: '12px', marginLeft: '10px' },
        }, data.loading ? '取得中...' : '情報を取得')
      ),
      renderResult(data)
    );
  };

  // APIキー未設定時
  if (!geminiApiKey) {
    return React.createElement('div', null,
      React.createElement('h1', { className: 'page-title' },
        React.createElement('span', { className: 'material-icons-round' }, 'directions_transit'),
        '公共交通機関情報'
      ),
      React.createElement(Card, null,
        React.createElement('div', {
          style: {
            textAlign: 'center', padding: 'var(--space-lg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '36px', color: 'var(--color-primary-light)', opacity: 0.5 },
          }, 'smart_toy'),
          React.createElement('div', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, '公共交通機関情報'),
          React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 } },
            'Gemini APIキーを設定すると、AI で交通機関の運行情報を取得できます'
          ),
          React.createElement(Button, {
            variant: 'secondary',
            icon: 'settings',
            onClick: () => document.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' })),
            style: { fontSize: '12px' },
          }, '設定ページへ')
        )
      )
    );
  }

  // メインUI
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'directions_transit'),
      '公共交通機関情報'
    ),

    // 日付表示
    React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '6px',
        marginBottom: 'var(--space-md)', padding: '8px 12px',
        borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
        fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)',
      },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'today'),
      today,
      ' の運行情報'
    ),

    // 遅延・トラブル情報（最重要なので最上部）
    renderCategoryCard(
      'warning', '遅延・トラブル情報',
      '鉄道・バス・航空の遅延・運休・トラブル情報',
      troubleData, handleFetchTrouble,
      '229,57,53'
    ),

    // 電車運行情報
    renderCategoryCard(
      'train', '電車 運行情報',
      'JR・私鉄・地下鉄の運行時刻・ダイヤ情報',
      trainData, handleFetchTrain,
      '26,115,232'
    ),

    // バス運行情報
    renderCategoryCard(
      'directions_bus', 'バス 運行情報',
      '都営バス・民営バス・高速バスの運行時刻情報',
      busData, handleFetchBus,
      '46,125,50'
    ),

    // 飛行機運航情報
    renderCategoryCard(
      'flight', '飛行機 運航情報',
      '羽田・成田空港の発着便・フライトスケジュール',
      flightData, handleFetchFlight,
      '156,39,176'
    )
  );
};
