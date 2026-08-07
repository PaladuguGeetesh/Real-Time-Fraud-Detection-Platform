import ThemeToggle from './ThemeToggle';

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '64px',
  padding: '0 24px',
  background: 'var(--color-surface)',
  borderBottom: '1px solid var(--color-border)',
};

const wordmarkStyle = {
  fontSize: '20px',
  fontWeight: 700,
  color: 'var(--color-accent)',
  letterSpacing: '-0.02px',
};

const avatarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  background: 'var(--color-accent)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '14px',
};

// username: real value from the authenticated session (AuthContext,
// via GET /api/auth/me) -- rendered as an initial in a plain colored
// circle rather than a photo avatar, since there's no real profile
// picture behind this single hardcoded analyst account.
function AppHeader({ username, theme, onToggleTheme }) {
  return (
    <header style={headerStyle}>
      <span style={wordmarkStyle}>Sentinel Fraud Systems</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <div style={avatarStyle} title={username} aria-label={username}>
          {username ? username[0].toUpperCase() : '?'}
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
