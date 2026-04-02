(function() {
// Settings.jsx - 設定ページ
window.SettingsPage = () => {
  const { useState } = React;
  const { apiKey, setApiKey, apiKeyEnabled, setApiKeyEnabled, geminiApiKey, setGeminiApiKey } = useAppContext();
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
  const [refreshKey, setRefreshKey] = useState(0);

  const [dailyGoal, setDailyGoal] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}');
      return s.dailyGoal || '';
    } catch { return ''; }
  });
  const [goalSaved, setGoalSaved] = useState(false);

  // 勤務モード（日勤/夜勤）
  const [shiftMode, setShiftMode] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}');
      return s.shiftMode || 'day';
    } catch { return 'day'; }
  });
  const handleShiftModeChange = (mode) => {
    setShiftMode(mode);
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}'); } catch {}
    settings.shiftMode = mode;
    localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('taxi-shift-mode-changed'));
  };

  // 基本始業・終業時間
  const [defaultShiftStart, setDefaultShiftStart] = useState(() => localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_START) || '');
  const [defaultShiftEnd, setDefaultShiftEnd] = useState(() => localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_END) || '');
  const [shiftTimeSaved, setShiftTimeSaved] = useState(false);


  // GPS設定state - MapContextから取得（独自watchPositionは不要）
  const { useEffect, useCallback } = React;
  const { currentPosition, isTracking, accuracy } = useMapContext();
  const [gpsPermission, setGpsPermission] = useState('unknown');
  const [gpsRecordCount, setGpsRecordCount] = useState(0);
  const [gpsBgEnabled, setGpsBgEnabled] = useState(() => localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.GPS_BG_ENABLED) === 'true');

  // GPS権限チェック
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setGpsPermission(result.state);
        result.onchange = () => setGpsPermission(result.state);
      }).catch(() => {});
    }
  }, []);

  // GPS記録数をロード
  useEffect(() => {
    if (window.GpsLogService) {
      GpsLogService.getLogDates().then(dates => {
        setGpsRecordCount(dates.length);
      }).catch(() => {});
    }
  }, []);

  const handleGpsBgToggle = useCallback(() => {
    const next = !gpsBgEnabled;
    setGpsBgEnabled(next);
    localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.GPS_BG_ENABLED, next ? 'true' : 'false');
    // MapContextにリアルタイム通知
    window.dispatchEvent(new CustomEvent('taxi-gps-toggle', { detail: next }));
  }, [gpsBgEnabled]);

  const handleSave = () => {
    setApiKey(inputKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setApiKey('');
    setInputKey('');
    window._gmapLoader.reset();
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
          type: 'password',
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
        apiKeyEnabled && React.createElement('span', { className: 'badge badge--success' }, 'API有効'),
        !apiKeyEnabled && React.createElement('span', { className: 'badge badge--warning' }, 'APIオフ')
      ),

      // APIキー使用のオン/オフトグル
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' },
      },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, 'Google Maps APIを使用'),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, 'オフの場合、地図表示なし・住所はNominatim(無料)で取得')
        ),
        React.createElement('button', {
          onClick: () => setApiKeyEnabled(!apiKeyEnabled),
          style: {
            width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
            background: apiKeyEnabled ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          },
        },
          React.createElement('span', {
            style: {
              position: 'absolute', top: '3px',
              left: apiKeyEnabled ? '24px' : '3px',
              width: '20px', height: '20px', borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            },
          })
        )
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
      }, 'Vercel Blob Storageを使用してデータをクラウドに保存・同期します。記録追加時に自動的にクラウドへ保存されます。'),

      React.createElement('div', { className: 'form-group', style: { marginBottom: 'var(--space-md)' } },
        React.createElement('label', { className: 'form-label' }, '同期シークレット'),
        React.createElement('input', {
          className: 'form-input',
          type: 'password',
          placeholder: 'Vercel環境変数のSYNC_SECRETと同じ値',
          value: syncSecret,
          onChange: (e) => setSyncSecret(e.target.value),
          style: { fontFamily: 'monospace' },
        }),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' } },
          React.createElement(Button, {
            variant: 'primary',
            icon: 'save',
            onClick: () => {
              localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET, syncSecret.trim());
              setSyncStatus('シークレットを保存しました');
              setTimeout(() => setSyncStatus(null), 2000);
            },
          }, '保存'),
          React.createElement('span', {
            style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' },
          }, '※ Vercelダッシュボードの環境変数SYNC_SECRETと同じ値を設定')
        )
      ),

      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' } },
        React.createElement(Button, {
          variant: 'secondary',
          icon: syncTesting ? 'sync' : 'network_check',
          onClick: async () => {
            setSyncTesting(true);
            setSyncTestResult(null);
            try {
              const res = await fetch('/api/data?type=revenue');
              if (res.ok) {
                setSyncTestResult('success');
              } else {
                let detail = '';
                try { const j = await res.json(); detail = j.detail || j.error || ''; } catch {}
                setSyncTestResult(`エラー: ${res.status}${detail ? ' - ' + detail : ''}`);
              }
            } catch (e) {
              setSyncTestResult('接続エラー: ' + e.message);
            }
            setSyncTesting(false);
          },
          disabled: syncTesting,
        }, syncTesting ? 'テスト中...' : '接続テスト')
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

      // 自動同期ステータス
      React.createElement('div', {
        style: {
          padding: '8px 12px', borderRadius: '8px', marginBottom: 'var(--space-md)',
          background: syncSecret ? 'rgba(0, 200, 83, 0.1)' : 'rgba(255, 152, 0, 0.1)',
          border: `1px solid ${syncSecret ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: 'var(--font-size-sm)',
          color: syncSecret ? 'var(--color-accent)' : 'var(--color-warning)',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, syncSecret ? 'sync' : 'sync_disabled'),
        syncSecret ? '自動同期: 有効（起動時・タブ復帰時・5分間隔）' : '自動同期: SYNC_SECRET未設定のため無効'
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
              const gatheringEntries = DataService.getGatheringMemos();
              const secret = (localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SYNC_SECRET) || '').trim();
              const headers = { 'Content-Type': 'application/json', ...(secret ? { 'Authorization': `Bearer ${secret}` } : {}) };
              const mkBody = (entries) => JSON.stringify({ version: APP_CONSTANTS.VERSION, syncedAt: new Date().toISOString(), count: entries.length, entries });
              const [r1, r2, r3] = await Promise.all([
                fetch('/api/data?type=revenue', { method: 'POST', headers, body: mkBody(revenueEntries) }),
                fetch('/api/data?type=rival', { method: 'POST', headers, body: mkBody(rivalEntries) }),
                fetch('/api/data?type=gathering', { method: 'POST', headers, body: mkBody(gatheringEntries) }),
              ]);
              if (r1.ok && r2.ok && r3.ok) {
                setSyncStatus(`送信完了: 売上${revenueEntries.length}件, 他社${rivalEntries.length}件, 集客${gatheringEntries.length}件`);
              } else {
                let d1 = '', d2 = '', d3 = '';
                try { const j = await r1.json(); d1 = j.detail || j.error || ''; } catch {}
                try { const j = await r2.json(); d2 = j.detail || j.error || ''; } catch {}
                try { const j = await r3.json(); d3 = j.detail || j.error || ''; } catch {}
                setSyncStatus(`送信エラー: revenue=${r1.status}${d1 ? '(' + d1 + ')' : ''}, rival=${r2.status}${d2 ? '(' + d2 + ')' : ''}, gathering=${r3.status}${d3 ? '(' + d3 + ')' : ''}`);
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
              const [r1, r2, r3] = await Promise.all([
                DataService.syncFromCloud('revenue'),
                DataService.syncFromCloud('rival'),
                DataService.syncFromCloud('gathering'),
              ]);
              setSyncStatus(`取得完了: 売上+${r1.merged}件, 他社+${r2.merged}件, 集客+${r3.merged}件`);
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

    // プッシュ通知設定
    React.createElement(Card, { title: 'プッシュ通知', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' },
      }, '交通機関の遅延・トラブル情報をブラウザ通知でお知らせします。'),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, '通知'),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } },
            !NotificationService.isSupported() ? 'このブラウザは通知に対応していません'
              : NotificationService.getPermission() === 'denied' ? 'ブラウザの通知が拒否されています。ブラウザ設定から許可してください'
              : '遅延・運休・事故などの交通情報を自動通知'
          )
        ),
        React.createElement('button', {
          onClick: async () => {
            if (!NotificationService.isSupported()) return;
            if (NotificationService.isEnabled()) {
              NotificationService.setEnabled(false);
              setRefreshKey(k => k + 1);
            } else {
              const perm = await NotificationService.requestPermission();
              if (perm === 'granted') {
                NotificationService.setEnabled(true);
                NotificationService.send('通知テスト', { body: '通知が有効になりました' });
              }
              setRefreshKey(k => k + 1);
            }
          },
          disabled: !NotificationService.isSupported() || NotificationService.getPermission() === 'denied',
          style: {
            padding: '8px 20px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)',
            background: NotificationService.isEnabled() ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)',
            color: NotificationService.isEnabled() ? '#fff' : 'var(--text-secondary)',
            opacity: (!NotificationService.isSupported() || NotificationService.getPermission() === 'denied') ? 0.5 : 1,
            transition: 'all 0.2s ease',
          },
        }, NotificationService.isEnabled() ? 'ON' : 'OFF')
      )
    ),

    // 勤務モード切り替え
    React.createElement(Card, { title: '勤務モード', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' },
      }, 'ダッシュボードの表示内容を勤務帯に合わせて切り替えます。'),
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        ...[
          { mode: 'day', label: '日勤', icon: 'wb_sunny', color: '#ffa726', bg: 'rgba(255,167,38,0.15)' },
          { mode: 'night', label: '夜勤', icon: 'nightlight', color: '#7c4dff', bg: 'rgba(124,77,255,0.15)' },
        ].map(opt => React.createElement('button', {
          key: opt.mode,
          onClick: () => handleShiftModeChange(opt.mode),
          style: {
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '14px 12px', borderRadius: '10px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            border: shiftMode === opt.mode ? `2px solid ${opt.color}` : '2px solid rgba(255,255,255,0.15)',
            background: shiftMode === opt.mode ? opt.bg : 'rgba(255,255,255,0.05)',
            color: shiftMode === opt.mode ? opt.color : 'var(--text-secondary)',
            transition: 'all 0.2s',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px' } }, opt.icon),
          opt.label
        ))
      )
    ),

    // 日額目標金額設定
    React.createElement(Card, { title: '日額目標金額', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' },
      }, '1日の売上目標金額を設定します。月間目標は日額×稼働日数で自動計算されます。'),
      React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        React.createElement('span', { style: { color: 'var(--text-secondary)', fontWeight: 500 } }, '¥'),
        React.createElement('input', {
          type: 'number',
          value: dailyGoal,
          onChange: (e) => setDailyGoal(e.target.value),
          placeholder: '例: 50000',
          style: {
            flex: 1, padding: '10px 12px', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-md)',
            fontFamily: 'var(--font-family)',
          },
        }),
        React.createElement(Button, {
          variant: 'primary',
          onClick: () => {
            let settings = {};
            try { settings = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}'); } catch {}
            settings.dailyGoal = Number(dailyGoal) || 0;
            localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
            setGoalSaved(true);
            setTimeout(() => setGoalSaved(false), 2000);
          },
        }, goalSaved ? '保存済み' : '保存')
      )
    ),

    // 基本勤務時間設定
    React.createElement(Card, { title: '基本勤務時間', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' },
      }, '基本の始業・終業時間を設定すると、設定時刻に自動で始業しGPS取得を開始します。'),

      React.createElement('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 'var(--space-md)' } },
        React.createElement('div', { style: { flex: 1, minWidth: '120px' } },
          React.createElement('label', { style: { display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '4px' } }, '始業時間'),
          React.createElement('input', {
            type: 'time',
            value: defaultShiftStart,
            onChange: (e) => setDefaultShiftStart(e.target.value),
            style: {
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              fontFamily: 'var(--font-family)',
            },
          })
        ),
        React.createElement('div', { style: { flex: 1, minWidth: '120px' } },
          React.createElement('label', { style: { display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: '4px' } }, '終業時間'),
          React.createElement('input', {
            type: 'time',
            value: defaultShiftEnd,
            onChange: (e) => setDefaultShiftEnd(e.target.value),
            style: {
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              fontFamily: 'var(--font-family)',
            },
          })
        )
      ),

      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
        React.createElement(Button, {
          variant: 'primary',
          icon: 'save',
          onClick: () => {
            localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_START, defaultShiftStart);
            localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_END, defaultShiftEnd);
            window.dispatchEvent(new CustomEvent('taxi-shift-schedule-changed'));
            setShiftTimeSaved(true);
            setTimeout(() => setShiftTimeSaved(false), 2000);
          },
        }, '保存'),
        (defaultShiftStart || defaultShiftEnd) && React.createElement(Button, {
          variant: 'secondary',
          icon: 'delete',
          onClick: () => {
            setDefaultShiftStart('');
            setDefaultShiftEnd('');
            localStorage.removeItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_START);
            localStorage.removeItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_END);
            window.dispatchEvent(new CustomEvent('taxi-shift-schedule-changed'));
            setShiftTimeSaved(true);
            setTimeout(() => setShiftTimeSaved(false), 2000);
          },
        }, 'クリア'),
        shiftTimeSaved && React.createElement('span', {
          style: { color: 'var(--color-accent)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: '4px' },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'check_circle'),
          '保存しました'
        )
      ),

      defaultShiftStart && React.createElement('div', {
        style: {
          marginTop: 'var(--space-md)', padding: '8px 12px', borderRadius: '8px',
          background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.2)',
          fontSize: 'var(--font-size-sm)', color: 'var(--color-accent)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'schedule'),
        `毎日 ${defaultShiftStart} に自動始業${defaultShiftEnd ? '・' + defaultShiftEnd + ' に自動終業' : ''}`
      )
    ),

    // GPS設定
    React.createElement(Card, { title: 'GPS設定', style: { marginBottom: 'var(--space-lg)' } },
      // --- 権限ステータス グループ ---
      React.createElement('div', { style: { marginBottom: '12px' } },
        React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' } }, '権限ステータス'),
        // 位置情報権限
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' } },
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, '位置情報権限'),
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, 'ブラウザの位置情報アクセス許可')
          ),
          React.createElement('span', {
            className: 'badge badge--' + (gpsPermission === 'granted' ? 'success' : gpsPermission === 'denied' ? 'danger' : 'warning'),
          }, gpsPermission === 'granted' ? '許可済み' : gpsPermission === 'denied' ? '拒否' : gpsPermission === 'prompt' ? '未許可' : '確認中')
        ),

        // 高精度モード
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' } },
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, '高精度モード'),
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, 'GPSの精度を最大にする（バッテリー消費が増えます）')
          ),
          React.createElement('span', { className: 'badge badge--success' }, '常時有効')
        )
      ),

      // --- 追跡設定 グループ ---
      React.createElement('div', { style: { marginBottom: '12px', paddingTop: '8px', borderTop: '2px solid rgba(255,255,255,0.08)' } },
        React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' } }, '追跡設定'),

      // バックグラウンド追跡（トグル付き）
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, 'バックグラウンド追跡'),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } },
            'アプリを開いている間、位置を常時追跡',
            isTracking ? ' (稼働中)' : ''
          )
        ),
        React.createElement('button', {
          onClick: handleGpsBgToggle,
          style: {
            width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
            background: gpsBgEnabled ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          },
        },
          React.createElement('span', {
            style: {
              position: 'absolute', top: '3px',
              left: gpsBgEnabled ? '24px' : '3px',
              width: '20px', height: '20px', borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            },
          })
        )
      ),

      // 記録間隔
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, '記録間隔'),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, 'GPS軌跡の記録頻度（始業中・スマホのみ）')
        ),
        React.createElement('span', { className: 'badge badge--info' }, '1秒')
      )
      ), // 追跡設定グループ閉じ

      // --- 詳細設定 グループ ---
      React.createElement('div', { style: { marginBottom: '12px', paddingTop: '8px', borderTop: '2px solid rgba(255,255,255,0.08)' } },
        React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' } }, '詳細設定'),

      // 保存期間
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, '保存期間'),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } }, 'IndexedDBに保存（自動削除なし）')
        ),
        React.createElement('span', { className: 'badge badge--info' }, '無期限')
      )
      ), // 詳細設定グループ閉じ

      // 現在の状態サマリ
      React.createElement('div', {
        style: {
          marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.04)',
          fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.8,
        },
      },
        React.createElement('div', { style: { fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' } }, '現在の状態'),
        React.createElement('div', null, '追跡: ', React.createElement('span', { style: { color: isTracking ? '#4caf50' : '#ff9800' } }, isTracking ? '稼働中' : '停止中')),
        currentPosition && React.createElement('div', null,
          '最終位置: ', currentPosition.lat.toFixed(5), ', ', currentPosition.lng.toFixed(5),
          ' (精度: ', Math.round(accuracy || 0), 'm)'
        ),
        React.createElement('div', null, '記録日数: ', gpsRecordCount, '日分'),
        React.createElement('div', null, '記録条件: スマホ + 始業中 + 休憩外')
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
            alert('手動インストール方法:\n\n【Android Chrome】\nメニュー（⋮）→「ホーム画面に追加」\n\n【iPhone Safari】\n共有ボタン（□↑）→「ホーム画面に追加」');
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

})();
