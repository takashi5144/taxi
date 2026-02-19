// ErrorBoundary.jsx - エラーバウンダリ（白画面クラッシュ防止）
// React Error Boundary はクラスコンポーネントが必要
window.ErrorBoundary = class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // ログに記録
    if (window.AppLogger) {
      AppLogger.error(`ErrorBoundary: ${error.message}`);
    }
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset() {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return React.createElement('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', padding: '24px', textAlign: 'center',
        },
      },
        React.createElement('span', {
          className: 'material-icons-round',
          style: { fontSize: '64px', color: 'var(--color-danger)', marginBottom: '16px' },
        }, 'error_outline'),

        React.createElement('h2', {
          style: { color: 'var(--text-primary)', marginBottom: '8px', fontSize: 'var(--font-size-xl)' },
        }, 'エラーが発生しました'),

        React.createElement('p', {
          style: { color: 'var(--text-secondary)', marginBottom: '24px', maxWidth: '400px', fontSize: 'var(--font-size-sm)' },
        }, 'アプリケーションで予期しないエラーが発生しました。再試行するか、ページを再読み込みしてください。'),

        // エラー詳細（開発時のみ表示を想定）
        this.state.error && React.createElement('details', {
          style: {
            marginBottom: '24px', textAlign: 'left', maxWidth: '500px', width: '100%',
            background: 'rgba(229,57,53,0.08)', borderRadius: '8px', padding: '12px',
            fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)',
          },
        },
          React.createElement('summary', {
            style: { cursor: 'pointer', color: 'var(--text-secondary)', marginBottom: '8px' },
          }, 'エラー詳細を表示'),
          React.createElement('pre', {
            style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 },
          }, String(this.state.error)),
          this.state.errorInfo && React.createElement('pre', {
            style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '8px 0 0', fontSize: '11px' },
          }, this.state.errorInfo.componentStack)
        ),

        // アクションボタン
        React.createElement('div', { style: { display: 'flex', gap: '12px' } },
          React.createElement('button', {
            onClick: () => this.handleReset(),
            style: {
              padding: '10px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: 'var(--color-primary)', color: '#fff', fontWeight: 500,
              fontSize: 'var(--font-size-sm)',
            },
          }, '再試行'),
          React.createElement('button', {
            onClick: () => this.handleReload(),
            style: {
              padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)',
              fontWeight: 500, fontSize: 'var(--font-size-sm)',
            },
          }, 'ページ再読み込み')
        )
      );
    }

    return this.props.children;
  }
};
