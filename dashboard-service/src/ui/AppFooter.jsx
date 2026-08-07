const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 32px',
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: '12px',
  color: 'var(--color-text-tertiary)',
};

const linksStyle = { display: 'flex', gap: '16px' };

// Matches the reference design's footer bar, but none of the four
// right-hand links go anywhere -- there's no privacy policy, audit
// log UI, API documentation, or support page anywhere in this app.
// Rendered as plain (non-navigating) text rather than dead links, per
// the same principle applied to the sidebar's System Audit/Security
// Settings items.
function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer style={footerStyle}>
      <span>© {year} Sentinel Fraud Systems. Institutional Grade Security.</span>
      <div style={linksStyle}>
        <span>Privacy Policy</span>
        <span>Audit Logs</span>
        <span>API Documentation</span>
        <span>Support</span>
      </div>
    </footer>
  );
}

export default AppFooter;
