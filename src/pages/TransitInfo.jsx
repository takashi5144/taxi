// TransitInfo.jsx - 公共交通機関情報ページ
// Gemini AI を使用して交通機関情報を検索
window.TransitInfoPage = () => {
  const { useState, useCallback } = React;
  const { geminiApiKey } = useAppContext();

  // Gemini検索
  const [geminiQuery, setGeminiQuery] = useState('');
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiResult, setGeminiResult] = useState(null);
  const [geminiError, setGeminiError] = useState(null);

  const handleGeminiSearch = useCallback(async () => {
    if (!geminiQuery.trim()) return;
    setGeminiLoading(true);
    setGeminiError(null);
    setGeminiResult(null);
    const result = await GeminiService.searchTransitInfo(geminiApiKey, geminiQuery.trim());
    setGeminiLoading(false);
    if (result.success) {
      setGeminiResult(result.text);
    } else {
      setGeminiError(result.error);
    }
  }, [geminiApiKey, geminiQuery]);

  const quickQueries = [
    '東京都内の主要路線の現在の運行状況',
    '本日の終電時刻（山手線・中央線・京浜東北線）',
    '現在遅延している路線と代替交通手段',
    '深夜のタクシー需要が高いエリア',
  ];

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'directions_transit'),
      '公共交通機関情報'
    ),

    // Gemini AI検索
    geminiApiKey ? React.createElement(Card, {
      title: 'AI交通情報検索（Gemini）',
      style: { marginBottom: 'var(--space-lg)' },
    },
      React.createElement('div', { style: { marginBottom: 'var(--space-md)' } },
        React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'stretch' } },
          React.createElement('input', {
            className: 'form-input',
            type: 'text',
            placeholder: '例: 山手線の運行状況、終電時刻、遅延情報...',
            value: geminiQuery,
            onChange: (e) => setGeminiQuery(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter' && !geminiLoading) handleGeminiSearch(); },
            style: { flex: 1 },
          }),
          React.createElement(Button, {
            variant: 'primary',
            icon: geminiLoading ? 'sync' : 'search',
            onClick: handleGeminiSearch,
            disabled: geminiLoading || !geminiQuery.trim(),
            style: { whiteSpace: 'nowrap' },
          }, geminiLoading ? '検索中...' : 'AI検索')
        ),
        // クイック検索ボタン
        React.createElement('div', {
          style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' },
        },
          quickQueries.map(q =>
            React.createElement('button', {
              key: q,
              onClick: () => { setGeminiQuery(q); },
              style: {
                padding: '4px 10px', borderRadius: '12px', fontSize: '11px',
                border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
              },
              onMouseEnter: (e) => { e.currentTarget.style.background = 'rgba(26,115,232,0.15)'; e.currentTarget.style.color = 'var(--color-primary-light)'; },
              onMouseLeave: (e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; },
            }, q)
          )
        )
      ),

      // エラー表示
      geminiError && React.createElement('div', {
        style: {
          padding: '10px 14px', borderRadius: '8px', marginBottom: 'var(--space-md)',
          background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.3)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-danger)' } }, 'error'),
        React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' } }, geminiError)
      ),

      // ローディング
      geminiLoading && React.createElement('div', {
        style: {
          padding: 'var(--space-lg)', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '32px', color: 'var(--color-primary-light)', animation: 'spin 1s linear infinite' },
        }, 'sync'),
        React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' } }, 'Gemini AIが検索中...')
      ),

      // 検索結果
      geminiResult && React.createElement('div', {
        style: {
          padding: 'var(--space-md)', borderRadius: '8px',
          background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.15)',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-primary-light)' } }, 'smart_toy'),
          React.createElement('span', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-light)' } }, 'Gemini AI回答')
        ),
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)',
            lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          },
        }, geminiResult),
        React.createElement('div', {
          style: { marginTop: '10px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, 'info'),
          '※ AIによる回答のため、最新の運行情報は各鉄道会社の公式情報をご確認ください'
        )
      )
    ) : React.createElement(Card, { style: { marginBottom: 'var(--space-lg)' } },
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
        React.createElement('div', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, 'AI交通情報検索'),
        React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 } },
          'Gemini APIキーを設定すると、AIで交通情報を検索できます'
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
};
