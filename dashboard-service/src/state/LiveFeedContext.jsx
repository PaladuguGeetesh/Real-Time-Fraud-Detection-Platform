import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { fetchTransactions } from '../api/transactionsApi';
import { StreamContext } from './StreamContext';

// eslint-disable-next-line react-refresh/only-export-components -- Context + Provider intentionally share a file per this project's state-layer convention; only costs Fast Refresh granularity, not correctness.
export const LiveFeedContext = createContext(undefined);

// Snapshot rows and buffered live rows for the same transactionId are
// identical in practice (same DB row) -- buffer wins on collision only
// because it's the more "live" source, not because they're expected to differ.
function mergeAndDedupe(snapshotRows, bufferedRows, limit) {
  const map = new Map();
  for (const row of snapshotRows) map.set(row.transactionId, row);
  for (const row of bufferedRows) map.set(row.transactionId, row);
  return Array.from(map.values())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

// The live feed: always the most recent 20 transactions, unfiltered,
// always "page 1" -- there is no pagination or filtering here anymore.
// That's entirely SearchContext's job now, on the separate /search route.
export function LiveFeedProvider({ children }) {
  const [transactions, setTransactions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const eventSource = useContext(StreamContext);

  // Most recent fraud alert, entirely separate from the main feed list
  // above -- FraudAlert.jsx reads this directly, it never touches
  // `transactions`. Auto-clears a few seconds after each new alert
  // (see the effect below).
  const [fraudAlert, setFraudAlert] = useState(null);

  // Bumped whenever the SSE connection (re)opens, to force the fetch
  // effect below to re-run -- this is what closes the Backend-restart
  // gap on reconnect.
  const [refreshTick, setRefreshTick] = useState(0);

  // snapshotLoadedRef: whether the feed has ever received its first
  // real snapshot. While false, incoming newTransaction events queue
  // in bufferRef instead of touching displayed state.
  const snapshotLoadedRef = useRef(false);
  const bufferRef = useRef([]);

  // Attaches to the shared connection from StreamContext rather than
  // opening its own. Guarded on eventSource being non-null since
  // StreamProvider creates it inside its own effect, one render after
  // this provider's first render.
  useEffect(() => {
    if (!eventSource) return;

    function handleNewTransaction(event) {
      const txn = JSON.parse(event.data);

      // Independent of the buffer/snapshot machinery below -- fires for
      // every fraud event regardless of whether the initial snapshot
      // has loaded yet, since the alert has nothing to do with the feed
      // list itself.
      if (txn.prediction === 'fraud') {
        setFraudAlert({
          transactionId: txn.transactionId,
          merchant: txn.merchant,
          amount: txn.amount,
          riskScore: txn.riskScore,
        });
      }

      if (!snapshotLoadedRef.current) {
        bufferRef.current.push(txn);
        // Cheap safety net against unbounded growth before the first
        // snapshot ever resolves.
        if (bufferRef.current.length > 200) bufferRef.current.shift();
        return;
      }

      setTransactions((prev) => {
        if (!prev) return prev;
        const withoutDupe = prev.data.filter((t) => t.transactionId !== txn.transactionId);
        const limit = prev.pagination?.limit ?? 20;
        return { ...prev, data: [txn, ...withoutDupe].slice(0, limit) };
      });
    }

    // Fires on both the initial connect and every successful
    // auto-reconnect (e.g. after a Backend restart).
    function handleOpen() {
      setRefreshTick((tick) => tick + 1);
    }

    function handleError(event) {
      console.error('SSE connection error/dropped:', event);
    }

    // addEventListener, not eventSource.onopen/.onerror -- those are
    // single-assignment properties, and StatsContext attaches its own
    // open/error handlers to this SAME shared connection.
    eventSource.addEventListener('newTransaction', handleNewTransaction);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);

    return () => {
      eventSource.removeEventListener('newTransaction', handleNewTransaction);
      eventSource.removeEventListener('open', handleOpen);
      eventSource.removeEventListener('error', handleError);
    };
  }, [eventSource]);

  // The single fetch path: runs once on mount and again on every SSE
  // (re)connect (refreshTick). The very first resolution gets merged
  // with whatever buffered while the snapshot was in flight; every
  // resolution after that just replaces state directly with fresh truth.
  useEffect(() => {
    let cancelled = false;

    fetchTransactions({ page: 1 })
      .then((data) => {
        if (cancelled) return;

        if (!snapshotLoadedRef.current) {
          const merged = mergeAndDedupe(data.data, bufferRef.current, data.pagination?.limit ?? 20);
          setTransactions({ ...data, data: merged });
          bufferRef.current = [];
          snapshotLoadedRef.current = true;
        } else {
          setTransactions(data);
        }
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // Auto-dismiss: each new alert gets its own timer, cancelled and
  // replaced (via this effect's cleanup) if a newer alert arrives
  // before it fires. Chosen over a manual dismiss button as the
  // simpler-to-get-correct option -- no dismissed/undismissed state to
  // track and reset per alert.
  useEffect(() => {
    if (!fraudAlert) return;

    const timer = setTimeout(() => setFraudAlert(null), 6000);
    return () => clearTimeout(timer);
  }, [fraudAlert]);

  return (
    <LiveFeedContext.Provider value={{ transactions, loading, error, fraudAlert }}>
      {children}
    </LiveFeedContext.Provider>
  );
}
