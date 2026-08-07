import { NavLink } from 'react-router-dom';
import { Shield, Activity, Search, FileSearch, ShieldCheck, LogOut } from 'lucide-react';

const sidebarStyle = {
  display: 'flex',
  flexDirection: 'column',
  width: '260px',
  flexShrink: 0,
  background: 'var(--color-surface)',
  borderRight: '1px solid var(--color-border)',
  height: '100%',
};

const brandStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '20px 20px',
};

// Light accent-tinted badge, same treatment as the login page's shield
// icon (ui/LoginForm.jsx's iconWrapStyle) -- kept consistent rather
// than the heavier solid-fill badge used elsewhere.
const brandIconStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-accent-bg)',
  color: 'var(--color-accent)',
  flexShrink: 0,
};

const navListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '8px 12px',
  flex: 1,
};

const bottomListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '12px',
  borderTop: '1px solid var(--color-border)',
};

const navItemBaseStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '9px 12px',
  borderRadius: 'var(--radius-md)',
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  textDecoration: 'none',
  border: '1px solid transparent',
  cursor: 'pointer',
  background: 'none',
  width: '100%',
  textAlign: 'left',
};

const navItemActiveStyle = {
  background: 'var(--color-accent-bg)',
  color: 'var(--color-accent-text)',
  fontWeight: 600,
  borderColor: 'var(--color-accent-bg)',
};

// System Audit / Security Settings appear in the reference design but
// have no backing route or functionality in this app (no audit UI, no
// settings screen) -- rendered full-weight, matching the reference
// exactly (it shows no visual "disabled" treatment on these), but
// deliberately non-navigating rather than a dead link or fabricated
// page. The gap is disclosed alongside this change, not in the UI
// itself -- the reference gives no visual cue that these differ from
// the two real nav items, so adding one here wouldn't actually match it.
function DisabledNavItem({ icon, label }) {
  return (
    <div style={{ ...navItemBaseStyle, cursor: 'default' }}>
      {icon}
      {label}
    </div>
  );
}

function Sidebar({ onLogout }) {
  return (
    <nav style={sidebarStyle}>
      <div style={brandStyle}>
        <div style={brandIconStyle}>
          <Shield size={18} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text)' }}>Fraud Operations</span>
      </div>

      <div style={navListStyle}>
        <NavLink
          to="/"
          end
          style={({ isActive }) => ({ ...navItemBaseStyle, ...(isActive ? navItemActiveStyle : {}) })}
        >
          <Activity size={18} />
          Live Monitoring
        </NavLink>
        <NavLink
          to="/search"
          style={({ isActive }) => ({ ...navItemBaseStyle, ...(isActive ? navItemActiveStyle : {}) })}
        >
          <Search size={18} />
          Transaction Search
        </NavLink>
        <DisabledNavItem icon={<FileSearch size={18} />} label="System Audit" />
      </div>

      <div style={bottomListStyle}>
        <DisabledNavItem icon={<ShieldCheck size={18} />} label="Security Settings" />
        <button type="button" style={navItemBaseStyle} onClick={onLogout}>
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </nav>
  );
}

export default Sidebar;
