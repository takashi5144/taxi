(function() {
// Header.jsx - ヘッダーナビゲーション
window.Header = () => {
  const { useState, useRef, useEffect, useMemo } = React;
  const { currentPage, navigate, sidebarOpen, setSidebarOpen } = useAppContext();
  const { standbyStatus, updateStandbyStartTime, updateStandbyLocationName, currentLocationName, isTracking } = useMapContext();
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [editStartTimeValue, setEditStartTimeValue] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const dropdownRef = useRef(null);

  // GPS非追跡時の待機時間（最後の売上記録からの経過 or 手動設定）
  const [idleElapsed, setIdleElapsed] = useState(null);
  const [manualIdleStart, setManualIdleStart] = useState(null); // 手動設定の開始時刻 'HH:MM'
  const [editingIdleTime, setEditingIdleTime] = useState(false);
  const [editIdleTimeValue, setEditIdleTimeValue] = useState('');
  const idleEditRef = useRef(null);

  useEffect(() => {
    if (standbyStatus) { setIdleElapsed(null); return; }
    const calcIdle = () => {
      try {
        let baseTime = null;

        // 手動設定がある場合はそれを優先
        if (manualIdleStart) {
          const [h, m] = manualIdleStart.split(':').map(Number);
          baseTime = new Date(); baseTime.setHours(h, m, 0, 0);
        } else {
          // 自動: 最終降車時刻から
          const entries = DataService.getEntries();
          if (entries.length === 0) { setIdleElapsed(null); return; }
          const today = new Date().toISOString().split('T')[0];
          const todayEntries = entries.filter(e => e.date === today);
          if (todayEntries.length === 0) { setIdleElapsed(null); return; }
          todayEntries.forEach(e => {
            if (e.dropoffTime) {
              const [h, m] = e.dropoffTime.split(':').map(Number);
              const t = new Date(); t.setHours(h, m, 0, 0);
              if (!baseTime || t > baseTime) baseTime = t;
            }
          });
        }
        if (!baseTime) { setIdleElapsed(null); return; }
        const now = new Date();
        const diffMs = now - baseTime;
        if (diffMs < 0) { setIdleElapsed(null); return; }
        const min = Math.floor(diffMs / 60000);
        const sec = Math.floor((diffMs % 60000) / 1000);
        const hhmm = String(baseTime.getHours()).padStart(2, '0') + ':' + String(baseTime.getMinutes()).padStart(2, '0');
        setIdleElapsed({ min, sec, since: hhmm, isManual: !!manualIdleStart });
      } catch { setIdleElapsed(null); }
    };
    calcIdle();
    const timer = setInterval(calcIdle, 1000);
    return () => clearInterval(timer);
  }, [standbyStatus, manualIdleStart]);

  // 手動タイマー開始（記録がなくても表示）
  const [showIdleManualStart, setShowIdleManualStart] = useState(false);

  // 待機場所の選択肢を3カテゴリに分類
  const locationCategories = useMemo(() => {
    const locs = APP_CONSTANTS.KNOWN_LOCATIONS && APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
    const spots = locs && locs.waitingSpots ? locs.waitingSpots : [];
    const hospitalIds = ['asahikawa_medical', 'red_cross', 'kosei', 'shiritsu'];
    const hotelIds = ['omo7', 'cabin', 'art_hotel', 'crescent', '9c_hotel', 'wing'];
    const stationIds = ['station', 'aeon', 'lawson_8jo', 'asahiyama_zoo'];
    return {
      station: spots.filter(s => stationIds.includes(s.id)).map(s => s.name),
      hospital: spots.filter(s => hospitalIds.includes(s.id)).map(s => s.name),
      hotel: spots.filter(s => hotelIds.includes(s.id)).map(s => s.name),
    };
  }, []);
  const [expandedCategory, setExpandedCategory] = useState(null);

  // 外クリックで編集モードを閉じる（idle編集 + 待機場所ドロップダウンを統合）
  useEffect(() => {
    if (!editingIdleTime && !editingLocation) return;
    const handler = (e) => {
      if (editingIdleTime && idleEditRef.current && !idleEditRef.current.contains(e.target)) {
        setEditingIdleTime(false);
      }
      if (editingLocation && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setEditingLocation(false);
        setExpandedCategory(null);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [editingIdleTime, editingLocation]);

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

    // 待機時間（GPS非追跡時 — 最終降車からの経過 or 手動設定）
    !standbyStatus && idleElapsed && React.createElement('div', {
      ref: idleEditRef,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '20px',
        background: idleElapsed.isManual ? 'rgba(129,199,132,0.12)' : 'rgba(158,158,158,0.12)',
        border: idleElapsed.isManual ? '1px solid rgba(129,199,132,0.3)' : '1px solid rgba(158,158,158,0.25)',
        fontSize: '12px',
        color: idleElapsed.isManual ? '#81c784' : '#bdbdbd',
        fontWeight: 500,
        flexShrink: 0,
        position: 'relative',
      },
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '14px', flexShrink: 0 },
      }, 'hourglass_empty'),
      // 開始時刻（タップで編集）
      editingIdleTime
        ? React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 },
            onClick: (e) => e.stopPropagation(),
          },
            React.createElement('input', {
              type: 'time',
              value: editIdleTimeValue,
              onChange: (e) => setEditIdleTimeValue(e.target.value),
              onBlur: () => {
                if (editIdleTimeValue) {
                  setManualIdleStart(editIdleTimeValue);
                }
                setEditingIdleTime(false);
              },
              onKeyDown: (e) => {
                if (e.key === 'Enter') {
                  if (editIdleTimeValue) {
                    setManualIdleStart(editIdleTimeValue);
                  }
                  setEditingIdleTime(false);
                } else if (e.key === 'Escape') {
                  setEditingIdleTime(false);
                }
              },
              autoFocus: true,
              style: {
                width: '70px', padding: '2px 4px', borderRadius: '4px',
                border: '1px solid rgba(129,199,132,0.5)', background: 'rgba(0,0,0,0.3)',
                color: '#81c784', fontSize: '11px', colorScheme: 'dark',
                outline: 'none',
              },
            }),
            React.createElement('span', { style: { fontSize: '11px' } }, '〜')
          )
        : React.createElement('span', {
            style: {
              fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0,
              cursor: 'pointer', borderBottom: '1px dashed rgba(158,158,158,0.5)',
              whiteSpace: 'nowrap',
            },
            onClick: (e) => {
              e.stopPropagation();
              setEditIdleTimeValue(idleElapsed.since);
              setEditingIdleTime(true);
            },
            title: 'タップして開始時刻を変更',
          }, idleElapsed.since + '〜'),
      React.createElement('span', {
        style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '12px', flexShrink: 0 },
      }, idleElapsed.min + ':' + String(idleElapsed.sec).padStart(2, '0')),
      // 手動設定時はリセットボタン表示
      idleElapsed.isManual && React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '14px', cursor: 'pointer', opacity: 0.7, flexShrink: 0, marginLeft: '2px' },
        onClick: (e) => { e.stopPropagation(); setManualIdleStart(null); },
        title: '自動に戻す',
      }, 'close')
    ),
    // 手動タイマー開始ボタン（タイマー未表示時）
    !standbyStatus && !idleElapsed && React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '20px',
        background: 'rgba(158,158,158,0.08)',
        border: '1px solid rgba(158,158,158,0.2)',
        fontSize: '11px',
        color: '#9e9e9e',
        cursor: 'pointer',
        flexShrink: 0,
      },
      onClick: () => {
        const now = new Date();
        const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        setManualIdleStart(hhmm);
      },
      title: '手動で待機タイマーを開始',
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '14px' },
      }, 'timer'),
      React.createElement('span', null, '待機開始')
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
          // 駅・その他（直接表示）
          ...locationCategories.station.map(name =>
            React.createElement('div', {
              key: name,
              style: {
                padding: '8px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s',
                color: (standbyStatus.locationName === name) ? '#ffa726' : 'var(--text-primary)',
                background: (standbyStatus.locationName === name) ? 'rgba(255,167,38,0.15)' : 'transparent',
                borderLeft: (standbyStatus.locationName === name) ? '3px solid #ffa726' : '3px solid transparent',
              },
              onMouseEnter: (e) => { e.currentTarget.style.background = 'rgba(255,167,38,0.1)'; },
              onMouseLeave: (e) => { e.currentTarget.style.background = (standbyStatus.locationName === name) ? 'rgba(255,167,38,0.15)' : 'transparent'; },
              onClick: () => { updateStandbyLocationName(name); setEditingLocation(false); },
            }, name)
          ),
          // 病院関係カテゴリ
          React.createElement('div', {
            key: 'cat-hospital',
            style: {
              padding: '8px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
              color: locationCategories.hospital.includes(standbyStatus.locationName) ? '#ffa726' : '#64b5f6',
              background: expandedCategory === 'hospital' ? 'rgba(100,181,246,0.1)' : 'transparent',
              borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '2px', paddingTop: '10px',
            },
            onClick: () => setExpandedCategory(expandedCategory === 'hospital' ? null : 'hospital'),
          },
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'local_hospital'),
              '病院関係'
            ),
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', transition: 'transform 0.2s', transform: expandedCategory === 'hospital' ? 'rotate(180deg)' : 'none' } }, 'expand_more')
          ),
          // 病院サブリスト
          ...(expandedCategory === 'hospital' ? locationCategories.hospital.map(name =>
            React.createElement('div', {
              key: name,
              style: {
                padding: '7px 12px 7px 36px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s',
                color: (standbyStatus.locationName === name) ? '#ffa726' : 'var(--text-primary)',
                background: (standbyStatus.locationName === name) ? 'rgba(255,167,38,0.15)' : 'transparent',
                borderLeft: (standbyStatus.locationName === name) ? '3px solid #ffa726' : '3px solid transparent',
              },
              onMouseEnter: (e) => { e.currentTarget.style.background = 'rgba(255,167,38,0.1)'; },
              onMouseLeave: (e) => { e.currentTarget.style.background = (standbyStatus.locationName === name) ? 'rgba(255,167,38,0.15)' : 'transparent'; },
              onClick: () => { updateStandbyLocationName(name); setEditingLocation(false); },
            }, name)
          ) : []),
          // ホテル関係カテゴリ
          React.createElement('div', {
            key: 'cat-hotel',
            style: {
              padding: '8px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
              color: locationCategories.hotel.includes(standbyStatus.locationName) ? '#ffa726' : '#ce93d8',
              background: expandedCategory === 'hotel' ? 'rgba(206,147,216,0.1)' : 'transparent',
              borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '2px', paddingTop: '10px',
            },
            onClick: () => setExpandedCategory(expandedCategory === 'hotel' ? null : 'hotel'),
          },
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'hotel'),
              'ホテル関係'
            ),
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', transition: 'transform 0.2s', transform: expandedCategory === 'hotel' ? 'rotate(180deg)' : 'none' } }, 'expand_more')
          ),
          // ホテルサブリスト
          ...(expandedCategory === 'hotel' ? locationCategories.hotel.map(name =>
            React.createElement('div', {
              key: name,
              style: {
                padding: '7px 12px 7px 36px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s',
                color: (standbyStatus.locationName === name) ? '#ffa726' : 'var(--text-primary)',
                background: (standbyStatus.locationName === name) ? 'rgba(255,167,38,0.15)' : 'transparent',
                borderLeft: (standbyStatus.locationName === name) ? '3px solid #ffa726' : '3px solid transparent',
              },
              onMouseEnter: (e) => { e.currentTarget.style.background = 'rgba(255,167,38,0.1)'; },
              onMouseLeave: (e) => { e.currentTarget.style.background = (standbyStatus.locationName === name) ? 'rgba(255,167,38,0.15)' : 'transparent'; },
              onClick: () => { updateStandbyLocationName(name); setEditingLocation(false); },
            }, name)
          ) : [])
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
