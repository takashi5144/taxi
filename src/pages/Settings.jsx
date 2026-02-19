// Settings.jsx - 設定ページ
window.SettingsPage = () => {
  const { useState } = React;
  const { apiKey, setApiKey, geminiApiKey, setGeminiApiKey } = useAppContext();
  const [inputKey, setInputKey] = useState(apiKey);
  const [saved, setSaved] = useState(false);
  const [geminiInputKey, setGeminiInputKey] = useState(geminiApiKey);
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState(null);

  // クラウド同期
  const [syncSecret, setSyncSecret] = useState(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET) || '');
  const [syncSaved, setSyncSaved] = useState(false);
  const [syncTesting, setSyncTesting] = useState(false);
  const [syncTestResult, setSyncTestResult] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

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

    // Gemini API キー
    React.createElement(Card, { title: 'Gemini API キー（AI検索）', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' },
      }, 'Google Gemini を使用して公共交通機関情報やイベント情報をAI検索できます。'),

      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Gemini APIキー'),
        React.createElement('input', {
          className: 'form-input',
          type: 'password',
          placeholder: 'AIzaSy...',
          value: geminiInputKey,
          onChange: (e) => setGeminiInputKey(e.target.value),
          style: { fontFamily: 'monospace' },
        })
      ),

      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
        React.createElement(Button, {
          variant: 'primary',
          icon: 'save',
          onClick: () => {
            setGeminiApiKey(geminiInputKey.trim());
            setGeminiSaved(true);
            setGeminiTestResult(null);
            setTimeout(() => setGeminiSaved(false), 2000);
          },
        }, '保存'),
        geminiInputKey && React.createElement(Button, {
          variant: 'secondary',
          icon: 'delete',
          onClick: () => {
            setGeminiApiKey('');
            setGeminiInputKey('');
            setGeminiTestResult(null);
            setGeminiSaved(true);
            setTimeout(() => setGeminiSaved(false), 2000);
          },
        }, 'クリア'),
        geminiInputKey && React.createElement(Button, {
          variant: 'secondary',
          icon: geminiTesting ? 'sync' : 'network_check',
          onClick: async () => {
            setGeminiTesting(true);
            setGeminiTestResult(null);
            const result = await GeminiService.testConnection(geminiInputKey.trim());
            setGeminiTesting(false);
            setGeminiTestResult(result.success ? 'success' : result.error);
          },
          disabled: geminiTesting,
        }, geminiTesting ? 'テスト中...' : '接続テスト'),
        geminiSaved && React.createElement('span', {
          style: { color: 'var(--color-accent)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: '4px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'check_circle'),
          '保存しました'
        ),
        geminiApiKey && React.createElement('span', { className: 'badge badge--success' }, 'APIキー設定済み'),
        !geminiApiKey && React.createElement('span', { className: 'badge badge--warning' }, '未設定')
      ),

      // 接続テスト結果
      geminiTestResult && React.createElement('div', {
        style: {
          marginTop: 'var(--space-md)', padding: '8px 12px', borderRadius: '8px',
          background: geminiTestResult === 'success' ? 'rgba(0,200,83,0.1)' : 'rgba(229,57,53,0.1)',
          border: `1px solid ${geminiTestResult === 'success' ? 'rgba(0,200,83,0.3)' : 'rgba(229,57,53,0.3)'}`,
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '18px', color: geminiTestResult === 'success' ? 'var(--color-accent)' : 'var(--color-danger)' },
        }, geminiTestResult === 'success' ? 'check_circle' : 'error'),
        React.createElement('span', {
          style: { fontSize: 'var(--font-size-sm)', color: geminiTestResult === 'success' ? 'var(--color-accent)' : 'var(--color-danger)' },
        }, geminiTestResult === 'success' ? 'Gemini APIに正常に接続できました' : geminiTestResult)
      ),

      // 取得手順
      React.createElement('details', {
        style: { marginTop: 'var(--space-md)', cursor: 'pointer' },
      },
        React.createElement('summary', {
          style: { color: 'var(--color-primary-light)', fontSize: 'var(--font-size-sm)' },
        }, 'Gemini APIキーの取得方法'),
        React.createElement('div', {
          style: { padding: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8 },
        },
          React.createElement('p', null, '1. Google AI Studio（https://aistudio.google.com）にアクセス'),
          React.createElement('p', null, '2. Googleアカウントでログイン'),
          React.createElement('p', null, '3. 「Get API Key」→「Create API key」をクリック'),
          React.createElement('p', null, '4. 生成されたAPIキーをコピー'),
          React.createElement('p', null, '5. 上のフォームに貼り付けて保存'),
          React.createElement('p', {
            style: { marginTop: '8px', padding: '8px 12px', background: 'rgba(0,200,83,0.08)', borderRadius: '6px', color: 'var(--color-accent)' },
          }, '※ 無料枠: 15リクエスト/分、1,500リクエスト/日（Gemini 2.0 Flash）')
        )
      )
    ),

    // クラウド同期
    React.createElement(Card, { title: 'クラウド同期', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' },
      }, 'Vercel Blob Storageを使用してデータをクラウドに保存します。Vercelダッシュボードで設定した SYNC_SECRET と同じ値を入力してください。'),

      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, '同期シークレット'),
        React.createElement('input', {
          className: 'form-input',
          type: 'password',
          placeholder: '同期シークレットを入力...',
          value: syncSecret,
          onChange: (e) => setSyncSecret(e.target.value),
          style: { fontFamily: 'monospace' },
        })
      ),

      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' } },
        React.createElement(Button, {
          variant: 'primary',
          icon: 'save',
          onClick: () => {
            localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET, syncSecret.trim());
            setSyncSaved(true);
            setSyncTestResult(null);
            setTimeout(() => setSyncSaved(false), 2000);
          },
        }, '保存'),
        syncSecret && React.createElement(Button, {
          variant: 'secondary',
          icon: 'delete',
          onClick: () => {
            localStorage.removeItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET);
            setSyncSecret('');
            setSyncTestResult(null);
            setSyncSaved(true);
            setTimeout(() => setSyncSaved(false), 2000);
          },
        }, 'クリア'),
        syncSecret && React.createElement(Button, {
          variant: 'secondary',
          icon: syncTesting ? 'sync' : 'network_check',
          onClick: async () => {
            setSyncTesting(true);
            setSyncTestResult(null);
            try {
              const res = await fetch('/api/data?type=revenue', {
                headers: { 'Authorization': `Bearer ${syncSecret.trim()}` },
              });
              setSyncTestResult(res.ok ? 'success' : `エラー: ${res.status}`);
            } catch (e) {
              setSyncTestResult('接続エラー: ' + e.message);
            }
            setSyncTesting(false);
          },
          disabled: syncTesting,
        }, syncTesting ? 'テスト中...' : '接続テスト'),
        syncSaved && React.createElement('span', {
          style: { color: 'var(--color-accent)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: '4px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'check_circle'),
          '保存しました'
        ),
        localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET)
          ? React.createElement('span', { className: 'badge badge--success' }, '設定済み')
          : React.createElement('span', { className: 'badge badge--warning' }, '未設定')
      ),

      // 接続テスト結果
      syncTestResult && React.createElement('div', {
        style: {
          marginBottom: 'var(--space-md)', padding: '8px 12px', borderRadius: '8px',
          background: syncTestResult === 'success' ? 'rgba(0,200,83,0.1)' : 'rgba(229,57,53,0.1)',
          border: `1px solid ${syncTestResult === 'success' ? 'rgba(0,200,83,0.3)' : 'rgba(229,57,53,0.3)'}`,
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '18px', color: syncTestResult === 'success' ? 'var(--color-accent)' : 'var(--color-danger)' },
        }, syncTestResult === 'success' ? 'check_circle' : 'error'),
        React.createElement('span', {
          style: { fontSize: 'var(--font-size-sm)', color: syncTestResult === 'success' ? 'var(--color-accent)' : 'var(--color-danger)' },
        }, syncTestResult === 'success' ? 'クラウドに正常に接続できました' : syncTestResult)
      ),

      // 手動同期ボタン
      React.createElement('div', {
        style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' },
      },
        React.createElement(Button, {
          variant: 'primary',
          icon: 'cloud_upload',
          onClick: async () => {
            setSyncStatus('送信中...');
            try {
              const revenueEntries = DataService.getEntries();
              const rivalEntries = DataService.getRivalEntries();
              const secret = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET);
              if (!secret) { setSyncStatus('シークレットが未設定です'); return; }
              const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` };
              const [r1, r2] = await Promise.all([
                fetch('/api/data?type=revenue', { method: 'POST', headers, body: JSON.stringify({ version: APP_CONSTANTS.VERSION, syncedAt: new Date().toISOString(), count: revenueEntries.length, entries: revenueEntries }) }),
                fetch('/api/data?type=rival', { method: 'POST', headers, body: JSON.stringify({ version: APP_CONSTANTS.VERSION, syncedAt: new Date().toISOString(), count: rivalEntries.length, entries: rivalEntries }) }),
              ]);
              if (r1.ok && r2.ok) {
                setSyncStatus(`送信完了: 売上${revenueEntries.length}件, 他社${rivalEntries.length}件`);
              } else {
                setSyncStatus(`送信エラー: revenue=${r1.status}, rival=${r2.status}`);
              }
            } catch (e) {
              setSyncStatus('送信エラー: ' + e.message);
            }
          },
        }, 'クラウドに送信'),
        React.createElement(Button, {
          variant: 'secondary',
          icon: 'cloud_download',
          onClick: async () => {
            setSyncStatus('取得中...');
            try {
              const [r1, r2] = await Promise.all([
                DataService.syncFromCloud('revenue'),
                DataService.syncFromCloud('rival'),
              ]);
              setSyncStatus(`取得完了: 売上+${r1.merged}件, 他社+${r2.merged}件`);
            } catch (e) {
              setSyncStatus('取得エラー: ' + e.message);
            }
          },
        }, 'クラウドから取得')
      ),

      // 同期状態表示
      syncStatus && React.createElement('div', {
        style: {
          padding: '8px 12px', borderRadius: '8px',
          background: 'rgba(66, 165, 245, 0.1)', border: '1px solid rgba(66, 165, 245, 0.3)',
          fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-light)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'cloud_sync'),
        syncStatus
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

    // アプリをインストール（PWA）
    React.createElement(Card, { title: 'アプリをインストール', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '12px' } },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '36px', color: 'var(--color-primary-light)' },
        }, 'install_mobile'),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'ホーム画面に追加'),
          React.createElement('div', {
            style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px' },
          }, 'このアプリをスマートフォンのホーム画面に追加すると、ネイティブアプリのように使えます。オフラインでも基本機能が利用可能です。')
        )
      ),
      React.createElement(Button, {
        variant: 'primary',
        icon: 'download',
        onClick: async () => {
          const result = await window.triggerPwaInstall();
          if (!result.success && result.reason === 'prompt_not_available') {
            alert('手動インストール方法:\\n\\n【Android Chrome】\\nメニュー（⋮）→「ホーム画面に追加」\\n\\n【iPhone Safari】\\n共有ボタン（□↑）→「ホーム画面に追加」');
          }
        },
      }, 'インストール'),
      React.createElement('details', {
        style: { marginTop: 'var(--space-md)', cursor: 'pointer' },
      },
        React.createElement('summary', {
          style: { color: 'var(--color-primary-light)', fontSize: 'var(--font-size-sm)' },
        }, '手動インストール方法'),
        React.createElement('div', {
          style: { padding: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8 },
        },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'Android（Chrome）:'),
          React.createElement('p', null, '1. Chrome でこのページを開く'),
          React.createElement('p', null, '2. 右上の メニュー（⋮）をタップ'),
          React.createElement('p', null, '3.「ホーム画面に追加」または「アプリをインストール」をタップ'),
          React.createElement('div', { style: { fontWeight: 600, marginTop: '12px', marginBottom: '4px' } }, 'iPhone（Safari）:'),
          React.createElement('p', null, '1. Safari でこのページを開く'),
          React.createElement('p', null, '2. 下部の 共有ボタン（□↑）をタップ'),
          React.createElement('p', null, '3.「ホーム画面に追加」をタップ')
        )
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
