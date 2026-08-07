import { createContext, useEffect, useState } from 'react';

// eslint-disable-next-line react-refresh/only-export-components -- Context + Provider intentionally share a file per this project's state-layer convention; only costs Fast Refresh granularity, not correctness.
export const ThemeContext = createContext(undefined);

const STORAGE_KEY = 'sentinel-theme';

// Same key index.html's blocking inline script reads on first paint
// (see that file) -- keeping them in sync is what avoids a flash of
// the wrong theme before this Provider ever mounts.
function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// No API/SSE dependency here, unlike every other Context in this
// project -- following the same Provider pattern anyway (createContext
// + a Provider component + a matching hooks/useTheme.js wrapper) for
// consistency with the established state-layer architecture, not
// because this one specifically needs it.
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
