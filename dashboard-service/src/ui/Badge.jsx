// Small pill used across the transaction tables -- GEO country-code
// chips (light bg + colored text) and, with variant="solid", the
// Fraud/Safe prediction pills in the Live Feed table (solid fill +
// white text, matching the reference design's filled pill treatment).
const TONES = {
  neutral: { bg: 'var(--color-accent-bg)', color: 'var(--color-accent-text)', solidBg: 'var(--color-accent)' },
  danger: { bg: 'var(--color-danger-bg)', color: 'var(--color-danger)', solidBg: 'var(--color-danger)' },
  safe: { bg: 'var(--color-safe-bg)', color: 'var(--color-safe)', solidBg: 'var(--color-safe)' },
};

function Badge({ children, tone = 'neutral', variant = 'soft' }) {
  const { bg, color, solidBg } = TONES[tone] ?? TONES.neutral;
  const isSolid = variant === 'solid';

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: isSolid ? 'var(--font-sans)' : 'var(--font-mono)',
        background: isSolid ? solidBg : bg,
        color: isSolid ? '#fff' : color,
      }}
    >
      {children}
    </span>
  );
}

export default Badge;
