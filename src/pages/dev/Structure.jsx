// Structure.jsx - サイト構造ビューアページ
window.StructurePage = () => {
  const { useState } = React;

  const iconMap = {
    folder: { icon: 'folder', class: 'file-tree__icon--folder' },
    react: { icon: 'description', class: 'file-tree__icon--react' },
    js: { icon: 'javascript', class: 'file-tree__icon--js' },
    css: { icon: 'style', class: 'file-tree__icon--css' },
    html: { icon: 'html', class: 'file-tree__icon--html' },
    md: { icon: 'article', class: 'file-tree__icon--md' },
    file: { icon: 'insert_drive_file', class: 'file-tree__icon--file' },
  };

  const TreeNode = ({ node, depth = 0 }) => {
    const [expanded, setExpanded] = useState(depth < 2);
    const isFolder = node.type === 'folder';
    const iconInfo = iconMap[node.type] || iconMap.file;

    return React.createElement('div', { style: { marginLeft: `${depth * 16}px` } },
      React.createElement('div', {
        className: 'file-tree__item',
        onClick: isFolder ? () => setExpanded(!expanded) : undefined,
        style: { cursor: isFolder ? 'pointer' : 'default' },
      },
        isFolder && React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '14px', color: 'var(--text-muted)', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0)' },
        }, 'chevron_right'),

        React.createElement('span', {
          className: `material-icons-round file-tree__icon ${iconInfo.class}`,
        }, iconInfo.icon),

        React.createElement('span', {
          style: { color: isFolder ? 'var(--color-secondary)' : 'var(--text-primary)' },
        }, node.name),

        node.desc && React.createElement('span', {
          style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginLeft: '8px' },
        }, `— ${node.desc}`)
      ),

      isFolder && expanded && node.children && node.children.map((child, i) =>
        React.createElement(TreeNode, { key: i, node: child, depth: depth + 1 })
      )
    );
  };

  // ルート構造
  const routes = [
    { path: '/', page: 'dashboard', desc: 'ダッシュボード（ホーム画面）' },
    { path: '/map', page: 'map', desc: 'Google Maps + GPS地図表示' },
    { path: '/revenue', page: 'revenue', desc: '売上記録・管理' },
    { path: '/analytics', page: 'analytics', desc: '売上分析・統計' },
    { path: '/settings', page: 'settings', desc: '設定（APIキー設定含む）' },
    { path: '/dev', page: 'dev', desc: '開発者ツールハブ' },
    { path: '/dev/structure', page: 'dev-structure', desc: 'サイト構造ビューア（このページ）' },
    { path: '/dev/logs', page: 'dev-logs', desc: 'アプリケーションログ' },
    { path: '/dev/api-status', page: 'dev-api', desc: 'API接続ステータス' },
  ];

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'account_tree'),
      'サイト構造'
    ),

    // ルーティング一覧
    React.createElement(Card, {
      title: 'ページルーティング',
      subtitle: 'アプリ内のすべてのページとそのパス',
      style: { marginBottom: 'var(--space-lg)' },
    },
      React.createElement('div', { style: { display: 'grid', gap: '4px' } },
        routes.map((route, i) =>
          React.createElement('div', {
            key: i,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.02)',
              fontSize: 'var(--font-size-sm)',
            },
          },
            React.createElement('code', {
              style: { color: 'var(--color-primary-light)', fontFamily: 'monospace', minWidth: '160px' },
            }, route.path),
            React.createElement('span', {
              style: { color: 'var(--text-muted)', fontSize: '14px' },
            }, '→'),
            React.createElement('span', { style: { color: 'var(--text-secondary)' } }, route.desc)
          )
        )
      )
    ),

    // ファイルツリー
    React.createElement(Card, {
      title: 'ファイル構造',
      subtitle: 'プロジェクトのディレクトリ構造（クリックで展開/折りたたみ）',
    },
      React.createElement('div', { className: 'file-tree', style: { padding: '8px 0' } },
        React.createElement(TreeNode, { node: APP_CONSTANTS.SITE_STRUCTURE })
      )
    ),

    // コンポーネント依存関係
    React.createElement(Card, {
      title: 'コンポーネント階層',
      subtitle: 'Reactコンポーネントのツリー構造',
      style: { marginTop: 'var(--space-lg)' },
    },
      React.createElement('pre', {
        style: {
          fontFamily: 'monospace',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.8,
          overflowX: 'auto',
        },
      },
`App
├── AppProvider (グローバル状態)
│   ├── MapProvider (地図状態)
│   │   └── LogProvider (ログ状態)
│   │       └── Layout
│   │           ├── Header (ヘッダー)
│   │           ├── Sidebar (PC用サイドバー)
│   │           ├── BottomNav (モバイル用ナビ)
│   │           └── [CurrentPage]
│   │               ├── DashboardPage
│   │               ├── MapViewPage
│   │               │   ├── GoogleMapView
│   │               │   └── GpsTracker
│   │               ├── RevenuePage
│   │               ├── AnalyticsPage
│   │               ├── SettingsPage
│   │               └── DevToolsPage
│   │                   ├── StructurePage
│   │                   ├── LogsPage
│   │                   └── ApiStatusPage
`)
    )
  );
};
