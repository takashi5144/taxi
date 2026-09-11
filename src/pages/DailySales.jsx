(function() {
// DailySales.jsx - 勤務日の1日合計売上を記録（カレンダー反映）
window.DailySalesPage = ({ embedded, manage }) => {
  const { useState, useEffect, useMemo } = React;

  const todayDefault = getLocalDateString();
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ date: todayDefault, amount: '' });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const onChange = () => setRefreshKey(k => k + 1);
    window.addEventListener('taxi-data-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('taxi-data-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const list = useMemo(() => DataService.getDailySales(), [refreshKey]);

  const existingForDate = useMemo(() => {
    return DataService.getDailySaleByDate(form.date);
  }, [form.date, refreshKey]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors([]);
    const result = DataService.upsertDailySale(form);
    if (!result.success) {
      setErrors(result.errors || ['保存に失敗しました']);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setEditingId(null);
    setForm({ date: getLocalDateString(), amount: '' });
    setRefreshKey(k => k + 1);
  };

  const startEdit = (entry) => {
    setForm({ date: entry.date, amount: String(entry.amount || '') });
    setEditingId(entry.id);
    setErrors([]);
  };

  const handleDelete = (entry) => {
    if (!confirm(`${entry.date} の日次売上 ¥${Number(entry.amount).toLocaleString()} を削除しますか？`)) return;
    DataService.deleteDailySale(entry.id);
    if (editingId === entry.id) {
      setEditingId(null);
      setForm({ date: getLocalDateString(), amount: '' });
    }
    setRefreshKey(k => k + 1);
  };

  const showForm = !manage || editingId;
  const showList = !embedded;
  const visibleList = manage
    ? list
    : list.slice(0, 60);

  return React.createElement('div', null,
    !embedded && !manage && React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'payments'),
      '売上'
    ),

    !manage && React.createElement('p', {
      style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', lineHeight: 1.6 },
    }, '勤務日の1日合計金額だけを入力して保存します。カレンダーの各日に反映されます。'),

    showForm && React.createElement(Card, { title: editingId ? '日次売上を編集' : '日次売上を記録', style: { marginBottom: 'var(--space-lg)' } },
      errors.length > 0 && React.createElement('div', {
        style: {
          background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.3)',
          borderRadius: '8px', padding: '8px 12px', marginBottom: 'var(--space-md)',
          color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)',
        },
      }, errors.join('、')),

      saved && React.createElement('div', {
        style: {
          background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.3)',
          borderRadius: '8px', padding: '8px 12px', marginBottom: 'var(--space-md)',
          color: 'var(--color-accent)', fontSize: 'var(--font-size-sm)',
          display: 'flex', alignItems: 'center', gap: '8px',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'check_circle'),
        '保存しました（カレンダーに反映されます）'
      ),

      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'grid grid--2' },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '勤務日 *'),
            React.createElement('input', {
              className: 'form-input',
              type: 'date',
              value: form.date,
              onChange: (e) => setForm({ ...form, date: e.target.value }),
              required: true,
              style: { colorScheme: 'dark' },
            }),
            form.date && (() => {
              const info = JapaneseHolidays.getDateInfo(form.date);
              const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-secondary)';
              return React.createElement('div', {
                style: { marginTop: '6px', fontSize: '12px', fontWeight: 600, color: dayColor },
              }, `${info.dayOfWeek}曜日${info.holiday ? '・' + info.holiday : ''}`);
            })(),
            existingForDate && !editingId && React.createElement('div', {
              style: { marginTop: '6px', fontSize: '11px', color: 'var(--color-warning)' },
            }, `この日は既に ¥${Number(existingForDate.amount).toLocaleString()} が登録済みです（保存で上書き）`)
          ),

          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, '1日合計金額（税込・円）*'),
            React.createElement('input', {
              className: 'form-input',
              type: 'number',
              min: '1',
              max: '10000000',
              placeholder: '例: 45000',
              value: form.amount,
              onChange: (e) => setForm({ ...form, amount: e.target.value }),
              required: true,
              style: { fontSize: '18px', fontWeight: 700 },
            }),
            form.amount && parseInt(form.amount, 10) > 0 && (() => {
              const taxIncluded = parseInt(form.amount, 10);
              const taxExcluded = Math.floor(taxIncluded / 1.1);
              return React.createElement('div', {
                style: { marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px' },
              },
                React.createElement('span', null, `税抜: ¥${taxExcluded.toLocaleString()}`),
                React.createElement('span', { style: { color: 'var(--color-warning)' } }, `税: ¥${(taxIncluded - taxExcluded).toLocaleString()}`)
              );
            })()
          )
        ),

        React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: 'var(--space-md)' } },
          React.createElement(Button, {
            variant: 'primary',
            icon: 'save',
            type: 'submit',
            style: { flex: 1, padding: '14px', fontSize: '15px', fontWeight: 700 },
          }, editingId ? '更新して保存' : '保存'),
          editingId && React.createElement(Button, {
            variant: 'secondary',
            type: 'button',
            onClick: () => {
              setEditingId(null);
              setForm({ date: getLocalDateString(), amount: '' });
              setErrors([]);
            },
          }, '取消')
        )
      )
    ),

    showList && React.createElement(Card, { title: `日次売上（${list.length}件）` },
      visibleList.length === 0
        ? React.createElement('p', { style: { color: 'var(--text-muted)', fontSize: '13px' } }, 'まだ日次売上がありません')
        : visibleList.map(entry => {
            const info = JapaneseHolidays.getDateInfo(entry.date);
            const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-muted)';
            return React.createElement('div', {
              key: entry.id,
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: '8px',
              },
            },
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('div', { style: { fontWeight: 600, fontSize: '14px' } },
                  entry.date,
                  React.createElement('span', { style: { marginLeft: '8px', fontSize: '12px', color: dayColor } },
                    `(${info.dayOfWeek})`
                  ),
                  info.holiday && React.createElement('span', {
                    style: { marginLeft: '6px', fontSize: '11px', color: '#ef4444' },
                  }, info.holiday)
                )
              ),
              React.createElement('div', {
                style: { fontWeight: 800, fontSize: '16px', color: 'var(--color-secondary)', minWidth: '90px', textAlign: 'right' },
              }, `¥${Number(entry.amount || 0).toLocaleString()}`),
              React.createElement('button', {
                type: 'button',
                onClick: () => startEdit(entry),
                style: {
                  border: 'none', background: 'rgba(26,115,232,0.15)', color: 'var(--color-primary-light)',
                  borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px',
                },
              }, '編集'),
              React.createElement('button', {
                type: 'button',
                onClick: () => handleDelete(entry),
                style: {
                  border: 'none', background: 'rgba(229,57,53,0.12)', color: 'var(--color-danger)',
                  borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px',
                },
              }, '削除')
            );
          })
    )
  );
};
})();
