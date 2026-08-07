import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import AppHeader from '../ui/AppHeader';
import Sidebar from '../ui/Sidebar';
import AppFooter from '../ui/AppFooter';

const shellStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100svh',
};

const bodyStyle = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
};

// A column of its own (not just <main>) so the footer sits pinned
// below the scrollable content but still to the right of the
// sidebar -- matching the reference, where the footer bar starts at
// the same left edge as the page content, not under the sidebar too.
const contentColumnStyle = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};

const mainStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '32px',
};

// The one container in this app that doesn't correspond to a single
// old component being split -- it's new structure (Step 4's header +
// sidebar) wrapping the two existing protected pages. Still follows
// the same rule as every other container: calls the hooks
// (useAuth/useTheme), passes plain data/callbacks into ui/ components.
function AppLayoutContainer({ children }) {
  const { username, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div style={shellStyle}>
      <AppHeader username={username} theme={theme} onToggleTheme={toggleTheme} />
      <div style={bodyStyle}>
        <Sidebar onLogout={handleLogout} />
        <div style={contentColumnStyle}>
          <main style={mainStyle}>{children}</main>
          <AppFooter />
        </div>
      </div>
    </div>
  );
}

export default AppLayoutContainer;
