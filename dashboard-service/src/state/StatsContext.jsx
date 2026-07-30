import { createContext, useContext, useEffect, useState } from 'react';
import { fetchStats } from '../api/statsApi';
import { StreamContext } from './StreamContext';

// eslint-disable-next-line react-refresh/only-export-components -- Context + Provider intentionally share a file per this project's state-layer convention; only costs Fast Refresh granularity, not correctness.
export const StatsContext = createContext(undefined);

export function StatsProvider({ children }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const eventSource = useContext(StreamContext);

  useEffect(() => {
    fetchStats()
      .then((data) => setStats(data))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  // Live updates: a statsUpdate event is a single, already-complete
  // aggregate object -- unlike TransactionsContext's growing list,
  // there's nothing to buffer or merge, just replace state directly.
  // Attaches to the shared connection from StreamContext rather than
  // opening its own -- guarded on eventSource being non-null since
  // StreamProvider creates it inside its own effect, one render after
  // this provider's first render.
  useEffect(() => {
    if (!eventSource) return;

    function handleStatsUpdate(event) {
      setStats(JSON.parse(event.data));
      setError(null);
    }

    // Fires on both the initial connect and every successful
    // auto-reconnect (e.g. after a Backend restart) -- re-fetching
    // here means a reconnect shows current truth rather than
    // whatever stale numbers were on screen before the outage.
    function handleOpen() {
      fetchStats()
        .then((data) => {
          setStats(data);
          setError(null);
        })
        .catch((err) => setError(err));
    }

    function handleError(event) {
      console.error('SSE connection error/dropped:', event);
    }

    // addEventListener, not eventSource.onopen/.onerror -- those are
    // single-assignment properties, and TransactionsContext attaches
    // its own open/error handlers to this SAME shared connection.
    // Assigning .onopen here would silently clobber (or be clobbered
    // by) whichever context runs second.
    eventSource.addEventListener('statsUpdate', handleStatsUpdate);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);

    // Removes only the exact function references this effect added --
    // TransactionsContext's own listeners on the same connection are
    // untouched.
    return () => {
      eventSource.removeEventListener('statsUpdate', handleStatsUpdate);
      eventSource.removeEventListener('open', handleOpen);
      eventSource.removeEventListener('error', handleError);
    };
  }, [eventSource]);

  return (
    <StatsContext.Provider value={{ stats, loading, error }}>
      {children}
    </StatsContext.Provider>
  );
}
