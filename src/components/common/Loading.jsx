// Loading.jsx - ローディング表示
window.Loading = ({ message = '読み込み中...' }) => {
  return React.createElement('div', { className: 'loading' },
    React.createElement('div', { className: 'loading__spinner' }),
    React.createElement('span', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, message)
  );
};
