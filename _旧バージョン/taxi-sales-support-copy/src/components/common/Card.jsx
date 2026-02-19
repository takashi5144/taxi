// Card.jsx - 汎用カード
window.Card = ({ title, subtitle, children, className = '', onClick, style }) => {
  return React.createElement('div', {
    className: `card ${className}`,
    onClick,
    style: { ...style, cursor: onClick ? 'pointer' : 'default' },
  },
    title && React.createElement('div', { className: 'card__title' }, title),
    subtitle && React.createElement('div', { className: 'card__subtitle' }, subtitle),
    children
  );
};
