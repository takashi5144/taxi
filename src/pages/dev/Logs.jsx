// Logs.jsx - ログビューアページ
window.LogsPage = () => {
  const { useState, useMemo } = React;
  const { logs, clearLogs } = useLogContext();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filteredLogs = useMemo(() => {
    let result = [...logs].reverse();
    if (filter !== 'all') {
      result = result.filter(log => log.level === filter);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(log => log.message.toLowerCase().includes(s));
    }
    return result;
  }, [logs, filter, search]);

  const counts = useMemo(() => ({
    all: logs.length,
    info: logs.filter(l => l.level === 'info').length,
    warn: logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length,
    debug: logs.filter(l => l.level === 'debug').length,
  }), [logs]);

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'terminal'),
      'ログビューア'
    ),

    // フィルター
    React.createElement('div', {
      style: { display: 'flex', gap: '8px', marginBottom: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'center' },
    },
      ['all', 'info', 'warn', 'error', 'debug'].map(level =>
        React.createElement('button', {
          key: level,
          className: `tab ${filter === level ? 'active' : ''}`,
          onClick: () => setFilter(level),
          style: { border: 'none', background: filter === level ? 'rgba(26,115,232,0.15)' : 'rgba(255,255,255,0.04)', borderRadius: '20px', padding: '4px 12px' },
        },
          `${level === 'all' ? '全て' : level.toUpperCase()} (${counts[level]})`
        )
      ),

      React.createElement('input', {
        className: 'form-input',
        type: 'text',
        placeholder: '検索...',
        value: search,
        onChange: (e) => setSearch(e.target.value),
        style: { maxWidth: '200px', padding: '4px 12px', marginLeft: 'auto' },
      }),

      React.createElement(Button, {
        variant: 'danger',
        icon: 'delete',
        onClick: clearLogs,
        style: { padding: '4px 12px', fontSize: '12px' },
      }, 'クリア')
    ),

    // ログ一覧
    React.createElement(Card, { style: { padding: 0, maxHeight: '600px', overflowY: 'auto' } },
      filteredLogs.length === 0
        ? React.createElement('div', {
            style: { padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' },
          }, 'ログはありません')
        : filteredLogs.map(log =>
            React.createElement('div', { key: log.id, className: 'dev-log-entry' },
              React.createElement('span', { className: 'dev-log-entry__time' }, formatTime(log.timestamp)),
              React.createElement('span', { className: `dev-log-entry__level dev-log-entry__level--${log.level}` },
                log.level.toUpperCase()
              ),
              React.createElement('span', { className: 'dev-log-entry__message' }, log.message)
            )
          )
    )
  );
};
