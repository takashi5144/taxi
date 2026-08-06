(function() {
// Settings.jsx - 設定ページ
window.SettingsPage = () => {
  const { useState } = React;
  
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

  // Google スプレッドシート連携
  const sheetsCfgInit = (window.GoogleSheetsService && GoogleSheetsService.getConfig()) || {
    webAppUrl: '', secret: '', autoSync: false, sheetName: '売上記録',
  };
  const [sheetsUrl, setSheetsUrl] = useState(sheetsCfgInit.webAppUrl || '');
  const [sheetsSecret, setSheetsSecret] = useState(sheetsCfgInit.secret || '');
  const [sheetsAuto, setSheetsAuto] = useState(!!sheetsCfgInit.autoSync);
  const [sheetsName, setSheetsName] = useState(sheetsCfgInit.sheetName || '売上記録');
  const [sheetsStatus, setSheetsStatus] = useState(null);
  const [sheetsBusy, setSheetsBusy] = useState(false);
  const [sheetsShowScript, setSheetsShowScript] = useState(false);

  const saveSheetsConfig = () => {
    if (!window.GoogleSheetsService) {
      setSheetsStatus('スプレッドシート機能が読み込まれていません');
      return;
    }
    GoogleSheetsService.saveConfig({
      webAppUrl: sheetsUrl.trim(),
      secret: sheetsSecret.trim(),
      autoSync: sheetsAuto,
      sheetName: sheetsName.trim() || '売上記録',
    });
    setSheetsStatus('スプレッドシート設定を保存しました');
    setTimeout(() => setSheetsStatus(null), 2500);
  };

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'settings'),
      '設定'
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

    // Google スプレッドシート連携
    React.createElement(Card, { title: 'Googleスプレッドシート連携', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', lineHeight: 1.7 },
      }, '売上データを Google スプレッドシートに送信し、表やグラフで分析できます。Google Apps Script（無料）を使います。'),

      // セットアップ手順
      React.createElement('div', {
        style: {
          marginBottom: 'var(--space-md)', padding: '12px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.8,
        },
      },
        React.createElement('div', { style: { fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' } }, 'セットアップ手順'),
        React.createElement('div', null, '1. Googleスプレッドシートで新規作成'),
        React.createElement('div', null, '2. 拡張機能 → Apps Script を開く'),
        React.createElement('div', null, '3. 下の「スクリプトをコピー」→ 貼り付けて保存'),
        React.createElement('div', null, '4. デプロイ → 新しいデプロイ → ウェブアプリ'),
        React.createElement('div', null, '　・実行: 自分　・アクセス: 全員'),
        React.createElement('div', null, '5. 表示された URL を下に貼り付けて保存'),
        React.createElement('div', null, '6. 「接続テスト」→「全件を同期」'),
        React.createElement('div', { style: { marginTop: '6px', color: 'var(--text-muted)' } },
          '※ 任意: Apps Script の「スクリプトプロパティ」に SECRET を設定するとセキュリティ向上'
        )
      ),

      React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' } },
        React.createElement(Button, {
          variant: 'secondary',
          icon: 'content_copy',
          onClick: async () => {
            if (!window.GoogleSheetsService) {
              setSheetsStatus('機能が利用できません');
              return;
            }
            const ok = await GoogleSheetsService.copyScriptToClipboard();
            setSheetsStatus(ok ? 'Apps Script をクリップボードにコピーしました' : 'コピーに失敗しました。下の「スクリプト表示」から手動コピーしてください');
            setTimeout(() => setSheetsStatus(null), 3500);
          },
        }, 'スクリプトをコピー'),
        React.createElement(Button, {
          variant: 'ghost',
          icon: sheetsShowScript ? 'expand_less' : 'code',
          onClick: () => setSheetsShowScript(v => !v),
        }, sheetsShowScript ? 'スクリプトを隠す' : 'スクリプト表示')
      ),

      sheetsShowScript && React.createElement('textarea', {
        readOnly: true,
        value: (window.GoogleSheetsService && GoogleSheetsService.getAppsScriptSource()) || '',
        style: {
          width: '100%', minHeight: '160px', marginBottom: 'var(--space-md)',
          padding: '10px', borderRadius: '8px', boxSizing: 'border-box',
          background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
          border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'monospace', fontSize: '11px',
        },
      }),

      React.createElement('div', { className: 'form-group', style: { marginBottom: 'var(--space-md)' } },
        React.createElement('label', { className: 'form-label' }, 'Webアプリ URL *'),
        React.createElement('input', {
          className: 'form-input',
          type: 'url',
          placeholder: 'https://script.google.com/macros/s/..../exec',
          value: sheetsUrl,
          onChange: (e) => setSheetsUrl(e.target.value),
          style: { fontFamily: 'monospace', fontSize: '12px' },
        })
      ),

      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: 'var(--space-md)' } },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'シークレット（任意）'),
          React.createElement('input', {
            className: 'form-input',
            type: 'password',
            placeholder: 'Apps Script の SECRET と同じ値',
            value: sheetsSecret,
            onChange: (e) => setSheetsSecret(e.target.value),
          })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'シート名'),
          React.createElement('input', {
            className: 'form-input',
            type: 'text',
            placeholder: '売上記録',
            value: sheetsName,
            onChange: (e) => setSheetsName(e.target.value),
          })
        )
      ),

      // 自動同期トグル
      React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', marginBottom: 'var(--space-md)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        },
      },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 500, fontSize: 'var(--font-size-sm)' } }, '新規記録を自動送信'),
          React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' } },
            '売上記録を追加したとき、スプレッドシートに追記します'
          )
        ),
        React.createElement('button', {
          type: 'button',
          onClick: () => setSheetsAuto(v => !v),
          style: {
            width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
            background: sheetsAuto ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          },
        },
          React.createElement('span', {
            style: {
              position: 'absolute', top: '3px',
              left: sheetsAuto ? '24px' : '3px',
              width: '20px', height: '20px', borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            },
          })
        )
      ),

      React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: 'var(--space-sm)' } },
        React.createElement(Button, {
          variant: 'primary',
          icon: 'save',
          onClick: saveSheetsConfig,
        }, '設定を保存'),
        React.createElement(Button, {
          variant: 'secondary',
          icon: sheetsBusy ? 'sync' : 'network_check',
          disabled: sheetsBusy || !sheetsUrl.trim(),
          onClick: async () => {
            if (!window.GoogleSheetsService) return;
            saveSheetsConfig();
            setSheetsBusy(true);
            setSheetsStatus('接続テスト中...');
            const result = await GoogleSheetsService.ping();
            setSheetsBusy(false);
            if (result && result.ok) {
              setSheetsStatus(`接続OK${result.title ? ': ' + result.title : ''}${result.sheet ? ' / シート「' + result.sheet + '」' : ''}`);
            } else {
              setSheetsStatus('接続失敗: ' + ((result && result.error) || '不明なエラー'));
            }
          },
        }, sheetsBusy ? '処理中...' : '接続テスト'),
        React.createElement(Button, {
          variant: 'secondary',
          icon: 'table_view',
          disabled: sheetsBusy || !sheetsUrl.trim(),
          onClick: async () => {
            if (!window.GoogleSheetsService) return;
            saveSheetsConfig();
            setSheetsBusy(true);
            setSheetsStatus('全件同期中...');
            const result = await GoogleSheetsService.syncAll();
            setSheetsBusy(false);
            if (result && result.ok) {
              const n = result.count != null ? result.count : (DataService.getEntries().length);
              setSheetsStatus(`全件同期完了: ${n}件をスプレッドシートに書き込みました`);
            } else {
              setSheetsStatus('全件同期失敗: ' + ((result && result.error) || '不明なエラー'));
            }
          },
        }, '全件を同期')
      ),

      sheetsStatus && React.createElement('div', {
        style: {
          marginTop: '8px', padding: '8px 12px', borderRadius: '8px',
          background: String(sheetsStatus).includes('失敗') || String(sheetsStatus).includes('エラー')
            ? 'rgba(229,57,53,0.1)' : 'rgba(0,200,83,0.1)',
          border: `1px solid ${String(sheetsStatus).includes('失敗') || String(sheetsStatus).includes('エラー')
            ? 'rgba(229,57,53,0.3)' : 'rgba(0,200,83,0.3)'}`,
          fontSize: 'var(--font-size-sm)',
          color: String(sheetsStatus).includes('失敗') || String(sheetsStatus).includes('エラー')
            ? 'var(--color-danger)' : 'var(--color-accent)',
        },
      }, sheetsStatus),

      React.createElement('p', {
        style: { marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 },
      }, '同期後、スプレッドシートで「挿入 → グラフ」やピボットテーブルを使って分析できます。料金は個人利用なら通常無料です。')
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
      }, '基本の始業・終業時間を設定すると、設定時刻に自動で始業・終業します。'),

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
