// Button.jsx - 汎用ボタン
window.Button = ({ children, variant = 'primary', icon, onClick, disabled, className = '', style }) => {
  return React.createElement('button', {
    className: `btn btn--${variant} ${className}`,
    onClick,
    disabled,
    style,
  },
    icon && React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, icon),
    children
  );
};
