(function() {
// Header.jsx - ヘッダーナビゲーション
window.Header = () => {
  const { useState, useRef, useEffect } = React;
  const { currentPage, navigate, sidebarOpen, setSidebarOpen } = useAppContext();
  const { standbyStatus, updateStandbyStartTime, updateStandbyLocationName, currentLocationName, isTracking } = useMapContext();
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [editStartTimeValue, setEditStartTimeValue] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const dropdownRef = useRef(null);

  // GPS非追跡時の待機時間（最後の売上記録からの経過）
  const [idleElapsed, setIdleElapsed] = useState(null);
  useEffect(() => {
    if (standbyStatus) { setIdleElapsed(null); return; }
    const calcIdle = () => {
      try {
        const entries = DataService.getEntries();
        if (entries.length === 0) { setIdleElapsed(null); return; }
        const today = new Date().toISOString().split('T')[0];
        const todayEntries = entries.filter(e => e.date === today);
        if (todayEntries.length === 0) { setIdleElapsed(null); return; }
        // 最新の降車時刻を取得
        let latestTime = null;
        todayEntries.forEach(e => {
          if (e.dropoffTime) {
            const [h, m] = e.dropoffTime.split(':').map(Number);
            const t = new Date(); t.setHours(h, m, 0, 0);
            if (!latestTime || t > latestTime) latestTime = t;
          }
        });
        if (!latestTime) { setIdleElapsed(null); return; }
        const now = new Date();
        const diffMs = now - latestTime;
        if (diffMs < 0) { setIdleElapsed(null); return; }
        const min = Math.floor(diffMs / 60000);
        const sec = Math.floor((diffMs % 60000) / 1000);
        const hhmm = String(latestTime.getHours()).padStart(2, '0') + ':' + String(latestTime.getMinutes()).padStart(2, '0');
        setIdleElapsed({ min, sec, since: hhmm });
      } catch { setIdleElapsed(null); }
    };
    calcIdle();
    const timer = setInterval(calcIdle, 1000);
    return () => clearInterval(timer);
  }, [standbyStatus]);

  // 待機場所の選択肢を取得
  const locationOptions = (() => {
    const spots = [];
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    if (locs && locs.waitingSpots) {
      locs.waitingSpots.forEach(s => spots.push(s.name));
    }
    if (APP_CONSTANTS.KNOWN_PLACES) {
      APP_CONSTANTS.KNOWN_PLACES.forEach(p => {
        if (!spots.includes(p.name)) spots.push(p.name);
      });
    }
    return spots;
  })();

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    if (!editingLocation) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setEditingLocation(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [editingLocation]);

  return React.createElement('header', { className: 'header' },
    // メニュートグル（モバイル）
    React.createElement('button', {
      className: 'header__menu-toggle',
      onClick: () => setSidebarOpen(!sidebarOpen),
    },
      React.createElement('span', { className: 'material-icons-round' }, sidebarOpen ? 'close' : 'menu')
    ),

    // ロゴ
    React.createElement('div', {
      className: 'header__logo',
      onClick: () => navigate('dashboard'),
    },
      React.createElement('span', { className: 'material-icons-round' }, 'local_taxi')
    ),

    // 現在地表示（GPS追跡中は常時表示）
    isTracking && !standbyStatus && currentLocationName && React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '20px',
        background: 'rgba(100, 181, 246, 0.12)',
        border: '1px solid rgba(100, 181, 246, 0.25)',
        fontSize: '12px',
        color: '#64b5f6',
        fontWeight: 500,
        maxWidth: '280px',
        flexShrink: 1,
        overflow: 'hidden',
      },
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '14px', flexShrink: 0 },
      }, 'location_on'),
      React.createElement('span', {
        style: {
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: '11px',
        },
      }, currentLocationName)
    ),

    // 待機時間（GPS非追跡時 — 最終降車からの経過）
    !standbyStatus && idleElapsed && React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '20px',
        background: 'rgba(158,158,158,0.12)',
        border: '1px solid rgba(158,158,158,0.25)',
        fontSize: '12px',
        color: '#bdbdbd',
        fontWeight: 500,
        flexShrink: 0,
      },
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '14px', flexShrink: 0 },
      }, 'hourglass_empty'),
      React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, idleElapsed.since + '〜'),
      React.createElement('span', {
        style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '12px', flexShrink: 0 },
      }, idleElapsed.min + ':' + String(idleElapsed.sec).padStart(2, '0'))
    ),

    // 待機中インジケーター（GPS待機検出時に表示）
    standbyStatus && React.createElement('div', {
      className: 'header__standby-indicator',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '20px',
        background: 'rgba(255, 167, 38, 0.15)',
        border: '1px solid rgba(255, 167, 38, 0.3)',
        fontSize: '12px',
        color: '#ffa726',
        fontWeight: 500,
        overflow: 'visible',
        maxWidth: '400px',
        flexShrink: 0,
        animation: 'standbyPulse 2s ease-in-out infinite',
        position: 'relative',
      },
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '16px', color: '#ffa726', flexShrink: 0 },
      }, 'hourglass_top'),
      // 場所名（クリックでプルダウン表示）
      React.createElement('div', {
        ref: dropdownRef,
        style: { position: 'relative', flexShrink: 0 },
      },
        React.createElement('span', {
          style: {
            fontWeight: 600, fontSize: '12px',
            maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: 'pointer', borderBottom: '1px dashed rgba(255,167,38,0.5)',
            display: 'inline-block',
          },
          onClick: (e) => {
            e.stopPropagation();
            setEditingLocation(!editingLocation);
          },
          title: 'タップして待機場所を変更',
        }, standbyStatus.locationName || '待機中'),
        // プルダウンメニュー
        editingLocation && React.createElement('div', {
          style: {
            position: 'absolute',
            top: '100%',
            left: '0',
            marginTop: '4px',
            background: '#1e1e2e',
            border: '1px solid rgba(255,167,38,0.4)',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            zIndex: 9999,
            minWidth: '180px',
            maxHeight: '250px',
            overflowY: 'auto',
            padding: '4px 0',
          },
          onClick: (e) => e.stopPropagation(),
        },
          ...locationOptions.map(name =>
            React.createElement('div', {
              key: name,
              style: {
                padding: '8px 12px',
                fontSize: '13px',
                color: (standbyStatus.locationName === name) ? '#ffa726' : 'var(--text-primary)',
                cursor: 'pointer',
                background: (standbyStatus.locationName === name) ? 'rgba(255,167,38,0.15)' : 'transparent',
                borderLeft: (standbyStatus.locationName === name) ? '3px solid #ffa726' : '3px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s',
              },
              onMouseEnter: (e) => { e.currentTarget.style.background = 'rgba(255,167,38,0.1)'; },
              onMouseLeave: (e) => { e.currentTarget.style.background = (standbyStatus.locationName === name) ? 'rgba(255,167,38,0.15)' : 'transparent'; },
              onClick: () => {
                updateStandbyLocationName(name);
                setEditingLocation(false);
              },
            }, name)
          )
        )
      ),
      // 時刻表示（開始時刻タップで編集可能）
      editingStartTime
        ? React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 },
            onClick: (e) => e.stopPropagation(),
          },
            React.createElement('input', {
              type: 'time',
              value: editStartTimeValue,
              onChange: (e) => setEditStartTimeValue(e.target.value),
              onBlur: () => {
                if (editStartTimeValue) {
                  updateStandbyStartTime(editStartTimeValue);
                }
                setEditingStartTime(false);
              },
              onKeyDown: (e) => {
                if (e.key === 'Enter') {
                  if (editStartTimeValue) {
                    updateStandbyStartTime(editStartTimeValue);
                  }
                  setEditingStartTime(false);
                } else if (e.key === 'Escape') {
                  setEditingStartTime(false);
                }
              },
              autoFocus: true,
              style: {
                width: '70px', padding: '2px 4px', borderRadius: '4px',
                border: '1px solid rgba(255,167,38,0.5)', background: 'rgba(0,0,0,0.3)',
                color: '#ffa726', fontSize: '11px', colorScheme: 'dark',
                outline: 'none',
              },
            }),
            React.createElement('span', { style: { fontSize: '11px' } }, '〜')
          )
        : React.createElement('span', {
            style: {
              fontVariantNumeric: 'tabular-nums', fontSize: '11px', flexShrink: 0,
              cursor: 'pointer', borderBottom: '1px dashed rgba(255,167,38,0.5)',
              whiteSpace: 'nowrap',
            },
            onClick: (e) => {
              e.stopPropagation();
              setEditStartTimeValue(standbyStatus.startTimeHHMM || '');
              setEditingStartTime(true);
            },
            title: 'タップして開始時刻を変更',
          }, (standbyStatus.startTimeHHMM || '') + '〜'),
      // 経過時間
      React.createElement('span', {
        style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '12px', flexShrink: 0 },
      }, standbyStatus.durationMin + ':' + String(standbyStatus.durationSec).padStart(2, '0'))
    ),

    // ナビゲーション（PC用）
    React.createElement('nav', { className: 'header__nav' },
      APP_CONSTANTS.NAV_ITEMS.map(item =>
        React.createElement('button', {
          key: item.id,
          className: `header__nav-btn ${currentPage === item.id ? 'active' : ''}`,
          onClick: () => navigate(item.id),
        },
          React.createElement('span', { className: 'material-icons-round' }, item.icon),
          React.createElement('span', null, item.label)
        )
      ),
      // 情報セクション セパレーター + 項目
      React.createElement('span', {
        style: { display: 'inline-block', width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px', verticalAlign: 'middle' },
      }),
      APP_CONSTANTS.INFO_NAV_ITEMS.map(item =>
        React.createElement('button', {
          key: item.id,
          className: `header__nav-btn ${currentPage === item.id ? 'active' : ''}`,
          onClick: () => navigate(item.id),
        },
          React.createElement('span', { className: 'material-icons-round' }, item.icon),
          React.createElement('span', null, item.label)
        )
      ),
      // 開発者ツールボタン
      React.createElement('button', {
        className: `header__nav-btn ${currentPage.startsWith('dev') ? 'active' : ''}`,
        onClick: () => navigate('dev'),
        style: { marginLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px' },
      },
        React.createElement('span', { className: 'material-icons-round' }, 'code'),
        React.createElement('span', null, '開発者')
      )
    )
  );
};

})();
