(function() {
// Settings.jsx - 設定ページ
window.SettingsPage = () => {
  const { useState } = React;
  
  // クラウド同期
  const [syncTesting, setSyncTesting] = useState(false);
  const [syncTestResult, setSyncTestResult] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  const [dailyGoal, setDailyGoal] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SETTINGS) || '{}');
      return s.dailyGoal || '';
    } catch { return ''; }
  });
  const [goalSaved, setGoalSaved] = useState(false);

  // 基本始業・終業時間
  const [defaultShiftStart, setDefaultShiftStart] = useState(() => localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_START) || '');
  const [defaultShiftEnd, setDefaultShiftEnd] = useState(() => localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_END) || '');
  const [shiftTimeSaved, setShiftTimeSaved] = useState(false);

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'settings'),
      '設定'
    ),

    // クラウド同期
    React.createElement(Card, { title: 'クラウド同期', style: { marginBottom: 'var(--space-lg)' } },
      React.createElement('p', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' },
      }, 'Vercel Blob Storageを使用してデータをクラウドに保存・同期します。シークレットは不要です。起動時・タブ復帰時に自動同期します。'),

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
          background: 'rgba(0, 200, 83, 0.1)',
          border: '1px solid rgba(0, 200, 83, 0.3)',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-accent)',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'sync'),
        '自動同期: 有効（起動時・タブ復帰時）'
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
              const dailySales = DataService.getDailySales ? DataService.getDailySales() : [];
              const headers = { 'Content-Type': 'application/json' };
              const mkBody = (entries) => JSON.stringify({ version: APP_CONSTANTS.VERSION, syncedAt: new Date().toISOString(), count: entries.length, entries });
              const r1 = await fetch('/api/data?type=revenue', { method: 'POST', headers, body: mkBody(revenueEntries) });
              const r2 = await fetch('/api/data?type=dailysales', { method: 'POST', headers, body: mkBody(dailySales) });
              if (r1.ok && r2.ok) {
                setSyncStatus(`送信完了: 個別売上${revenueEntries.length}件 / 日次売上${dailySales.length}件`);
              } else {
                let d1 = '';
                try { const j = await (!r1.ok ? r1 : r2).json(); d1 = j.detail || j.error || ''; } catch {}
                setSyncStatus(`送信エラー: revenue=${r1.status} dailysales=${r2.status}${d1 ? '(' + d1 + ')' : ''}`);
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
              const r1 = await DataService.syncFromCloud('revenue');
              const r2 = DataService.syncDailySalesBidirectional
                ? await DataService.syncDailySalesBidirectional()
                : { merged: 0 };
              setSyncStatus(`取得完了: 個別売上+${r1.merged}件 / 日次売上${r2.total || 0}件`);
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
      ),
      React.createElement('div', {
        style: {
          marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        },
      },
        React.createElement('div', {
          style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.6 },
        }, '売上記録から、削除済み項目（天候・性別・用途・配車・地点・メモ等）のデータを取り除きます。金額・日付・時間・支払・割引・人数は残します。'),
        React.createElement(Button, {
          variant: 'secondary',
          icon: 'cleaning_services',
          onClick: () => {
            if (!window.DataService || !DataService.cleanRemovedRevenueFields) {
              alert('この機能は利用できません');
              return;
            }
            if (!confirm('削除済み項目のデータを整理しますか？\n（金額・日付など現行項目はそのまま残ります）')) return;
            try {
              const r = DataService.cleanRemovedRevenueFields({ force: true });
              if (r.alreadyDone && r.cleaned === 0) {
                alert('すでに整理済みか、削除対象がありませんでした。');
              } else {
                alert(`整理完了: ${r.cleaned}件の記録から、不要フィールド ${r.fieldsRemoved} 個を削除しました。`);
              }
            } catch (e) {
              alert('整理に失敗しました: ' + (e.message || e));
            }
          },
        }, '売上記録の不要データを整理')
      )
    )
  );
};

})();
