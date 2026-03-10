(function() {
// Header.jsx - ヘッダーナビゲーション
window.Header = () => {
  const { useState } = React;
  const { currentPage, navigate, sidebarOpen, setSidebarOpen } = useAppContext();
  const { standbyStatus, updateStandbyStartTime } = useMapContext();
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [editStartTimeValue, setEditStartTimeValue] = useState('');

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
        overflow: 'hidden',
        maxWidth: '400px',
        flexShrink: 0,
        animation: 'standbyPulse 2s ease-in-out infinite',
      },
    },
      React.createElement('span', {
        className: 'material-icons-round',
        style: { fontSize: '16px', color: '#ffa726', flexShrink: 0 },
      }, 'hourglass_top'),
      // 場所名
      React.createElement('span', {
        style: {
          fontWeight: 600, fontSize: '12px', flexShrink: 0,
          maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        },
      }, standbyStatus.locationName || '待機中'),
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
