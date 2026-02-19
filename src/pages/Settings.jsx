// Settings.jsx - 設定ページ
window.SettingsPage = () => {
  const { useState } = React;
  const { apiKey, setApiKey } = useAppContext();
  const [inputKey, setInputKey] = useState(apiKey);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setApiKey(inputKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setApiKey('');
    setInputKey('');
    _gmapLoader.reset();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'settings'),
      '設定'
    ),

    // Google Maps API キー
    React.createElement(Card, { title: 'Google Maps API キー', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' },
      }, 'Google Maps を表示するにはAPIキーが必要です。'),

      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'APIキー'),
        React.createElement('input', {
          className: 'form-input',
          type: 'text',
          placeholder: 'AIzaSy...',
          value: inputKey,
          onChange: (e) => setInputKey(e.target.value),
          style: { fontFamily: 'monospace' },
        })
      ),

      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
        React.createElement(Button, {
          variant: 'primary',
          icon: 'save',
          onClick: handleSave,
        }, '保存'),
        inputKey && React.createElement(Button, {
          variant: 'secondary',
          icon: 'delete',
          onClick: handleClear,
        }, 'クリア'),
        saved && React.createElement('span', {
          style: { color: 'var(--color-accent)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: '4px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'check_circle'),
          '保存しました'
        ),
        apiKey && React.createElement('span', { className: 'badge badge--success' }, 'APIキー設定済み'),
        !apiKey && React.createElement('span', { className: 'badge badge--warning' }, 'デモモード')
      ),

      // トラブルシューティング
      apiKey && React.createElement('div', {
        style: {
          marginTop: 'var(--space-md)', padding: 'var(--space-md)',
          background: 'rgba(249, 168, 37, 0.08)', borderRadius: '8px', border: '1px solid rgba(249, 168, 37, 0.2)',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-secondary)' } }, 'info'),
          React.createElement('strong', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-secondary)' } }, '地図が正しく表示されない場合')
        ),
        React.createElement('div', {
          style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.8 },
        },
          React.createElement('p', { style: { margin: '4px 0' } }, '「For development purposes only」と表示される場合：'),
          React.createElement('p', { style: { margin: '2px 0', paddingLeft: '12px' } }, '① Google Cloud Console で請求先アカウント（Billing）を有効にしてください'),
          React.createElement('p', { style: { margin: '2px 0', paddingLeft: '12px' } }, '② 「Maps JavaScript API」が有効になっていることを確認してください'),
          React.createElement('p', { style: { margin: '4px 0', marginTop: '8px' } }, '地図が全く表示されない場合：'),
          React.createElement('p', { style: { margin: '2px 0', paddingLeft: '12px' } }, '③ APIキーの「アプリケーションの制限」で HTTP リファラーを「なし」に設定してください'),
          React.createElement('p', { style: { margin: '2px 0', paddingLeft: '12px' } }, '④ ローカルファイルから開く場合、リファラー制限があると動作しません')
        )
      ),

      // 取得手順
      React.createElement('details', {
        style: { marginTop: 'var(--space-md)', cursor: 'pointer' },
      },
        React.createElement('summary', {
          style: { color: 'var(--color-primary-light)', fontSize: 'var(--font-size-sm)' },
        }, 'APIキーの取得方法（初めての方）'),
        React.createElement('div', {
          style: { padding: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8 },
        },
          React.createElement('p', null, '1. Google Cloud Console（https://console.cloud.google.com）にアクセス'),
          React.createElement('p', null, '2. プロジェクトを作成または選択'),
          React.createElement('p', { style: { color: 'var(--color-warning)' } }, '3. 「お支払い」から請求先アカウントを設定（月$200分の無料枠あり）'),
          React.createElement('p', null, '4. 「APIとサービス」→「ライブラリ」から「Maps JavaScript API」を有効化'),
          React.createElement('p', null, '5. 「認証情報」→「認証情報を作成」→「APIキー」を選択'),
          React.createElement('p', { style: { color: 'var(--color-warning)' } }, '6. APIキーの「アプリケーションの制限」は「なし」に設定'),
          React.createElement('p', null, '7. 上のフォームにAPIキーを貼り付けて保存'),
          React.createElement('p', {
            style: { marginTop: '8px', padding: '8px 12px', background: 'rgba(0,200,83,0.08)', borderRadius: '6px', color: 'var(--color-accent)' },
          }, '※ 月$200の無料クレジットがあるため、個人利用では通常料金はかかりません。')
        )
      )
    ),

    // GPS設定
    React.createElement(Card, { title: 'GPS設定', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, '高精度モード'),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, 'GPSの精度を最大にする（バッテリー消費が増えます）')
        ),
        React.createElement('span', { className: 'badge badge--success' }, '有効')
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, 'バックグラウンド追跡'),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, 'アプリがバックグラウンドでも位置を追跡')
        ),
        React.createElement('span', { className: 'badge badge--warning' }, 'PWA必要')
      )
    ),

    // アプリ情報
    React.createElement(Card, { title: 'アプリ情報' },
      React.createElement('div', { style: { display: 'grid', gap: '8px', fontSize: 'var(--font-size-sm)' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
          React.createElement('span', { style: { color: 'var(--text-secondary)' } }, 'バージョン'),
          React.createElement('span', null, APP_CONSTANTS.VERSION)
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
          React.createElement('span', { style: { color: 'var(--text-secondary)' } }, 'ビルド'),
          React.createElement('span', null, 'CDN (開発版)')
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
          React.createElement('span', { style: { color: 'var(--text-secondary)' } }, 'React'),
          React.createElement('span', null, React.version)
        )
      )
    )
  );
};
