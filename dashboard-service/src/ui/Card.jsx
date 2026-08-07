// The bordered/padded/rounded wrapper every major section sits in
// (stat cards, charts, tables, the login card) -- the theme-aware
// successor to the old styles.js's flat `cardStyle` object, now a
// real component so callers can extend it (style prop) without
// duplicating the base styles.
function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Card;
