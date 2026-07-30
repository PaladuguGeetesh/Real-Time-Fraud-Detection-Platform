import { createContext, useEffect, useState } from 'react';
import { createTransactionStream } from '../api/streamClient';

// eslint-disable-next-line react-refresh/only-export-components -- Context + Provider intentionally share a file per this project's state-layer convention; only costs Fast Refresh granularity, not correctness.
export const StreamContext = createContext(undefined);

// Holds exactly one EventSource, shared by every context that needs
// live updates (StatsContext, TransactionsContext), so a browser tab
// opens one SSE connection total instead of one per consuming context.
export function StreamProvider({ children }) {
  const [eventSource, setEventSource] = useState(null);

  useEffect(() => {
    const source = createTransactionStream();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- EventSource is a side-effecting resource (a real connection) that must be created in an effect, not lazily during render; its value doesn't exist until this line runs, so there's nothing to derive it from. Empty deps means this fires exactly once, with none of the cascading-render risk the rule targets.
    setEventSource(source);

    return () => {
      source.close();
    };
  }, []);

  return <StreamContext.Provider value={eventSource}>{children}</StreamContext.Provider>;
}
