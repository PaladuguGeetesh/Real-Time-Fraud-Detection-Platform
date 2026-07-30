// Shared visual constants -- consolidated during the Step 10 polish
// pass. Several components previously duplicated identical style
// objects on purpose, when consistency wasn't yet a stated goal;
// centralizing them here is what "consistency" now calls for.

export const COLORS = {
  fraudRed: '#d32f2f',
  fraudBg: '#fdecea',
  safeGreen: '#2e7d32',
};

// A bordered, padded section wrapper -- used for every major block on
// the page (stat cards, the live feed, the search results table, both
// charts) so they read as one consistent set of "cards" rather than a
// mix of boxed and bare elements. Uses the theme's --border variable
// (already defined in index.css, already driving dark mode elsewhere)
// instead of a hardcoded color, so these stay consistent with the rest
// of the page in both light and dark mode.
export const cardStyle = {
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '16px',
};

export const sectionHeadingStyle = {
  margin: '0 0 12px',
};

export const tableStyle = {
  borderCollapse: 'collapse',
  width: '100%',
};

export const cellStyle = {
  border: '1px solid var(--border)',
  padding: '6px 10px',
  textAlign: 'left',
};

export const fraudRowStyle = {
  backgroundColor: COLORS.fraudBg,
  borderLeft: `4px solid ${COLORS.fraudRed}`,
};
