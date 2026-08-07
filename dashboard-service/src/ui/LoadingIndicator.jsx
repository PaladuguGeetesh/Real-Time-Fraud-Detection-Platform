// Already fully pure in its previous location (no hooks, no props) --
// moved here unchanged in shape, restyled to the new theme tokens.
function LoadingIndicator() {
  return <p style={{ padding: '16px', color: 'var(--color-text-tertiary)' }}>Loading…</p>;
}

export default LoadingIndicator;
