(function() {
// Dashboard.jsx - ホーム（始業 + 日次売上記録）
window.DashboardPage = () => {
  const { useState, useEffect, useCallback } = React;

  const [refreshKey, setRefreshKey] = useState(0);
  const [shiftInfo, setShiftInfo] = useState({ active: false, startTime: null });
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [editStartTimeValue, setEditStartTimeValue] = useState('');

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === APP_CONSTANTS.STORAGE_KEYS.SHIFTS) setRefreshKey(k => k + 1);
    };
    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('taxi-data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
    };
  }, []);

  useEffect(() => {
    try {
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const activeShift = shifts.find(s => !s.endTime);
      if (activeShift) {
        setShiftInfo({ active: true, startTime: activeShift.startTime });
      } else {
        setShiftInfo({ active: false, startTime: null });
      }
    } catch (e) {
      AppLogger.warn('シフトデータの読み込みに失敗', e.message);
    }
  }, [refreshKey]);

  useEffect(() => {
    const handleAutoShift = (e) => {
      const { type, startTime } = e.detail || {};
      if (type === 'start') {
        setShiftInfo({ active: true, startTime });
      } else if (type === 'end') {
        setShiftInfo({ active: false, startTime: null });
      }
    };
    window.addEventListener('taxi-auto-shift', handleAutoShift);
    return () => window.removeEventListener('taxi-auto-shift', handleAutoShift);
  }, []);

  const handleStartTimeEdit = useCallback(() => {
    if (!shiftInfo.active || !shiftInfo.startTime) return;
    const d = new Date(shiftInfo.startTime);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setEditStartTimeValue(`${hh}:${mm}`);
    setEditingStartTime(true);
  }, [shiftInfo]);

  const handleStartTimeSave = useCallback(() => {
    if (!editStartTimeValue) return;
    try {
      const [h, m] = editStartTimeValue.split(':').map(Number);
      const oldStart = new Date(shiftInfo.startTime);
      const newStart = new Date(oldStart);
      newStart.setHours(h, m, 0, 0);
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const activeShift = shifts.find(s => !s.endTime);
      if (activeShift) {
        activeShift.startTime = newStart.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
        DataService.syncShiftsToCloud();
        setShiftInfo({ active: true, startTime: newStart.toISOString() });
        setRefreshKey(k => k + 1);
        window.dispatchEvent(new CustomEvent('taxi-data-changed'));
        AppLogger.info(`始業時間を変更: ${editStartTimeValue}`);
      }
    } catch (e) {
      AppLogger.error('始業時間の変更に失敗', e.message);
    }
    setEditingStartTime(false);
  }, [editStartTimeValue, shiftInfo]);

  const handleShiftStart = useCallback(() => {
    if (shiftInfo.active) return;
    try {
      const now = new Date();
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const newShift = { id: Date.now().toString(), startTime: now.toISOString(), endTime: null };
      shifts.push(newShift);
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
      DataService.syncShiftsToCloud();
      setShiftInfo({ active: true, startTime: now.toISOString() });
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      AppLogger.info(`始業: ${now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      AppLogger.error('始業処理に失敗', e.message);
    }
  }, [shiftInfo.active]);

  const handleShiftEnd = useCallback(() => {
    if (!shiftInfo.active) return;
    try {
      const now = new Date();
      const shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]');
      const activeShift = shifts.find(s => !s.endTime);
      if (!activeShift) return;
      try {
        const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
        const ab = breaks.find(b => !b.endTime);
        if (ab) {
          ab.endTime = now.toISOString();
          localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
          DataService.syncBreaksToCloud();
        }
      } catch { /* ignore */ }
      activeShift.endTime = now.toISOString();
      localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
      DataService.syncShiftsToCloud();
      if (DataService.syncAllToCloud) DataService.syncAllToCloud();
      setShiftInfo({ active: false, startTime: null });
      setEditingStartTime(false);
      window.dispatchEvent(new CustomEvent('taxi-data-changed'));
      window.dispatchEvent(new CustomEvent('taxi-auto-shift', { detail: { type: 'end' } }));
      AppLogger.info(`終業: ${now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      AppLogger.error('終業処理に失敗', e.message);
    }
  }, [shiftInfo.active]);

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'home'),
      'ホーム'
    ),

    React.createElement(Card, { style: { padding: 'var(--space-md)' } },
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
      },
        React.createElement('button', {
          type: 'button',
          onClick: handleShiftStart,
          disabled: shiftInfo.active,
          style: {
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '18px 12px', borderRadius: '12px',
            fontSize: '18px', fontWeight: '700',
            cursor: shiftInfo.active ? 'default' : 'pointer',
            border: shiftInfo.active ? '2px solid var(--color-accent)' : '2px solid var(--color-warning)',
            background: shiftInfo.active ? 'rgba(0,200,83,0.12)' : 'rgba(255,152,0,0.15)',
            color: shiftInfo.active ? 'var(--color-accent)' : 'var(--color-warning)',
            opacity: shiftInfo.active ? 0.95 : 1,
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px' } },
            shiftInfo.active ? 'work' : 'play_arrow'),
          shiftInfo.active
            ? `始業中 ${new Date(shiftInfo.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
            : '始業'
        ),
        React.createElement('button', {
          type: 'button',
          onClick: handleShiftEnd,
          disabled: !shiftInfo.active,
          style: {
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '18px 12px', borderRadius: '12px',
            fontSize: '18px', fontWeight: '700',
            cursor: shiftInfo.active ? 'pointer' : 'default',
            border: shiftInfo.active ? '2px solid var(--color-danger)' : '2px solid rgba(255,255,255,0.15)',
            background: shiftInfo.active ? 'rgba(229,57,53,0.15)' : 'rgba(255,255,255,0.04)',
            color: shiftInfo.active ? 'var(--color-danger)' : 'var(--text-muted)',
          },
        },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '24px' } }, 'stop_circle'),
          '終業'
        )
      ),

      shiftInfo.active && React.createElement('div', {
        style: {
          marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.15)',
          fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center',
        },
      },
        !editingStartTime
          ? React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' },
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-accent)' } }, 'schedule'),
              '始業時間',
              React.createElement('span', { style: { fontWeight: 700, color: 'var(--color-accent)' } },
                new Date(shiftInfo.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
              ),
              React.createElement('button', {
                type: 'button',
                onClick: handleStartTimeEdit,
                style: {
                  padding: '4px 8px', borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px',
                },
              }, '変更')
            )
          : React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
            },
              React.createElement('input', {
                type: 'time',
                value: editStartTimeValue,
                onChange: (e) => setEditStartTimeValue(e.target.value),
                style: {
                  padding: '6px 8px', borderRadius: '6px',
                  border: '1px solid rgba(0,200,83,0.4)', background: 'rgba(0,200,83,0.08)',
                  color: 'var(--text-primary)', fontSize: '14px',
                },
              }),
              React.createElement('button', {
                type: 'button',
                onClick: handleStartTimeSave,
                style: {
                  padding: '6px 12px', borderRadius: '6px', border: 'none',
                  background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600,
                },
              }, '確定'),
              React.createElement('button', {
                type: 'button',
                onClick: () => setEditingStartTime(false),
                style: {
                  padding: '6px 12px', borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                },
              }, '取消')
            )
      )
    ),

    React.createElement('div', { style: { marginTop: 'var(--space-lg)' } },
      React.createElement(DailySalesPage, { embedded: true })
    )
  );
};
})();
