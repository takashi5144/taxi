// Revenue.jsx - 売上記録ページ（DataService統合・バリデーション・CSVエクスポート）
// v0.3.2: DataServiceのCRUDメソッドに一元化。ローカルstate独自管理を廃止し、
//         DataServiceを唯一のデータソースとして使用する。
window.RevenuePage = () => {
  const { useState, useEffect, useCallback } = React;

  // DataServiceから最新データを取得するためのrefreshKey
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ amount: '', pickup: '', dropoff: '', memo: '' });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);

  // データは常にDataServiceから取得（単一のデータソース）
  const entries = DataService.getEntries();

  // localStorageの変更を監視して自動更新
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA) {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleVisibility = () => {
      if (!document.hidden) setRefreshKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors([]);

    // DataServiceのaddEntryに完全委譲（バリデーション含む）
    const result = DataService.addEntry(form);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    setForm({ amount: '', pickup: '', dropoff: '', memo: '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  };

  const handleDelete = useCallback((id) => {
    DataService.deleteEntry(id);
    setRefreshKey(k => k + 1);
  }, []);

  const handleExportCSV = () => {
    DataService.downloadCSV();
  };

  const handleClearAll = () => {
    if (entries.length === 0) return;
    DataService.clearAllEntries();
    setRefreshKey(k => k + 1);
  };

  // 本日の日付文字列
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = entries.filter(e => e.timestamp.startsWith(today));
  const todayTotal = todayEntries.reduce((sum, e) => sum + e.amount, 0);
  const allTotal = entries.reduce((sum, e) => sum + e.amount, 0);

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'receipt_long'),
      '売上記録'
    ),

    // 本日の合計
    React.createElement(Card, { style: { marginBottom: 'var(--space-lg)', textAlign: 'center' } },
      React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, '本日の売上合計'),
      React.createElement('div', {
        style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-secondary)', margin: '8px 0' },
      }, `¥${todayTotal.toLocaleString()}`),
      React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' } },
        `本日 ${todayEntries.length} 件 / 全 ${entries.length} 件（累計 ¥${allTotal.toLocaleString()}）`
      )
    ),

    // 入力フォーム
    React.createElement(Card, { title: '新規売上を記録', style: { marginBottom: 'var(--space-lg)' } },
      // バリデーションエラー表示
      errors.length > 0 && React.createElement('div', {
        style: {
          background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.3)',
          borderRadius: '8px', padding: '8px 12px', marginBottom: 'var(--space-md)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '18px', color: 'var(--color-danger)' },
        }, 'error'),
        React.createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' } },
          errors.join('、')
        )
      ),

      // 保存成功メッセージ
      saved && React.createElement('div', {
        style: {
          background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.3)',
          borderRadius: '8px', padding: '8px 12px', marginBottom: 'var(--space-md)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '18px', color: 'var(--color-accent)' },
        }, 'check_circle'),
        React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-accent)' } },
          '記録を追加しました'
        )
      ),

      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'grid grid--2' },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '金額 (円) *'),
            React.createElement('input', {
              className: 'form-input',
              type: 'number',
              min: '1',
              max: '1000000',
              placeholder: '3500',
              value: form.amount,
              onChange: (e) => { setForm({ ...form, amount: e.target.value }); setErrors([]); },
              required: true,
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '乗車地'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '東京駅',
              value: form.pickup,
              onChange: (e) => setForm({ ...form, pickup: e.target.value }),
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '降車地'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '渋谷駅',
              value: form.dropoff,
              onChange: (e) => setForm({ ...form, dropoff: e.target.value }),
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'メモ'),
            React.createElement('input', {
              className: 'form-input',
              type: 'text',
              placeholder: '任意のメモ',
              value: form.memo,
              onChange: (e) => setForm({ ...form, memo: e.target.value }),
            })
          )
        ),
        React.createElement(Button, {
          variant: 'primary',
          icon: 'add',
          style: { marginTop: 'var(--space-sm)' },
        }, '記録を追加')
      )
    ),

    // ツールバー（エクスポート・全削除）
    entries.length > 0 && React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' },
    },
      React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' } },
        `全 ${entries.length} 件の記録`
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        React.createElement(Button, {
          variant: 'secondary',
          icon: 'download',
          onClick: handleExportCSV,
          style: { padding: '4px 12px', fontSize: '12px' },
        }, 'CSVエクスポート'),
        React.createElement(Button, {
          variant: 'danger',
          icon: 'delete_forever',
          onClick: () => { if (confirm('全ての売上記録を削除しますか？この操作は取り消せません。')) handleClearAll(); },
          style: { padding: '4px 12px', fontSize: '12px' },
        }, '全削除')
      )
    ),

    // 記録一覧
    entries.length > 0 && React.createElement(Card, { title: `記録一覧（${entries.length}件）` },
      entries.map(entry =>
        React.createElement('div', {
          key: entry.id,
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          },
        },
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { fontWeight: 500 } },
              `${entry.pickup || '---'} → ${entry.dropoff || '---'}`
            ),
            React.createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } },
              new Date(entry.timestamp).toLocaleString('ja-JP'),
              entry.memo && ` | ${entry.memo}`
            )
          ),
          React.createElement('div', {
            style: { fontWeight: 700, color: 'var(--color-secondary)', fontSize: 'var(--font-size-lg)', marginRight: '12px' },
          }, `¥${entry.amount.toLocaleString()}`),
          React.createElement('button', {
            onClick: () => handleDelete(entry.id),
            style: {
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px',
              borderRadius: '4px', transition: 'color 0.2s',
            },
            title: '削除',
          },
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '18px' },
            }, 'delete_outline')
          )
        )
      )
    )
  );
};
