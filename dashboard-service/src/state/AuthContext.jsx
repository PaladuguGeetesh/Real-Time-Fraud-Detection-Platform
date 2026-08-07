import { createContext, useEffect, useState } from 'react';
import { login as apiLogin, logout as apiLogout, fetchMe } from '../api/authApi';

// eslint-disable-next-line react-refresh/only-export-components -- Context + Provider intentionally share a file per this project's state-layer convention; only costs Fast Refresh granularity, not correctness.
export const AuthContext = createContext(undefined);

// isAuthenticated is three-valued, not a boolean: `null` means "still
// checking" (the /api/auth/me probe on mount hasn't resolved yet) --
// ProtectedRoute needs to tell that apart from a confirmed `false`, or
// every page load would flash the login screen before redirecting back.
export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  // /api/auth/me already returns { username } (authController.js's
  // `me` handler) -- this was previously discarded after the mount
  // check; now kept so the header can show the real logged-in
  // analyst's name instead of a placeholder.
  const [username, setUsername] = useState(null);

  useEffect(() => {
    fetchMe()
      .then((data) => {
        setUsername(data.username);
        setIsAuthenticated(true);
      })
      .catch(() => {
        setUsername(null);
        setIsAuthenticated(false);
      });
  }, []);

  async function login(username, password) {
    await apiLogin(username, password);
    setUsername(username);
    setIsAuthenticated(true);
  }

  async function logout() {
    await apiLogout();
    setUsername(null);
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
