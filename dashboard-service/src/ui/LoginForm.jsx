import { useState } from 'react';
import { Shield, User, Lock } from 'lucide-react';
import Card from './Card';

const pageStyle = {
  minHeight: '100svh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, var(--color-accent-bg) 0%, var(--color-bg) 60%)',
};

const cardStyle = { width: '420px', padding: '40px' };
const iconWrapStyle = {
  width: '56px',
  height: '56px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-accent-bg)',
  color: 'var(--color-accent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 16px',
};
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text)' };
const inputWrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  background: 'var(--color-surface)',
};
const inputStyle = { border: 'none', outline: 'none', background: 'transparent', width: '100%', color: 'var(--color-text)' };
const buttonStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-accent)',
  color: '#fff',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
};

// Pure presentational: username/password are local input state (not
// app data -- nothing to fetch, nothing from a Context), submission
// itself goes through the onSubmit callback prop. "Remember terminal"
// and "Reset Key?" match the reference design but aren't wired to
// anything real -- there's no persistent-session or password-reset
// functionality behind them; see the accompanying summary.
function LoginForm({ onSubmit, submitting, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberTerminal, setRememberTerminal] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(username, password);
  }

  return (
    <div style={pageStyle}>
      <Card style={cardStyle}>
        <div style={iconWrapStyle}>
          <Shield size={28} />
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, textAlign: 'center', marginBottom: '4px' }}>
          Sentinel Fraud Systems
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginBottom: '28px' }}>
          Secure Institutional Access
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle} htmlFor="login-username">
              Operator ID / Email
            </label>
            <div style={inputWrapStyle}>
              <User size={16} color="var(--color-text-tertiary)" />
              <input
                id="login-username"
                style={inputStyle}
                type="text"
                placeholder="Enter your credentials"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle} htmlFor="login-password">
              Authorization Key
            </label>
            <div style={inputWrapStyle}>
              <Lock size={16} color="var(--color-text-tertiary)" />
              <input
                id="login-password"
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={rememberTerminal} onChange={(e) => setRememberTerminal(e.target.checked)} />
              Remember terminal
            </label>
            <span style={{ fontSize: '13px', color: 'var(--color-accent-text)' }}>Reset Key?</span>
          </div>

          <button type="submit" style={buttonStyle} disabled={submitting}>
            {submitting ? 'Authenticating…' : 'Authenticate Session'}
          </button>

          {error && (
            <p style={{ color: 'var(--color-danger)', fontWeight: 500, marginTop: '12px', textAlign: 'center' }}>{error}</p>
          )}
        </form>

        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '28px', paddingTop: '16px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>Terminal ID: 8842-X</p>
          <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            v2.4.1.99 | Secure Node
          </p>
        </div>
      </Card>
    </div>
  );
}

export default LoginForm;
