import { createContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchTransactions } from '../api/transactionsApi';

// eslint-disable-next-line react-refresh/only-export-components -- Context + Provider intentionally share a file per this project's state-layer convention; only costs Fast Refresh granularity, not correctness.
export const SearchContext = createContext(undefined);

// The /search page: filter/page state IS the URL query string (via
// react-router-dom's useSearchParams), not local component state.
// Plain fetch-on-param-change -- no SSE, no EventSource, no live
// updates at all. This view is never live.
export function SearchProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parseInt(searchParams.get('page'), 10) || 1;
  const prediction = searchParams.get('prediction') || '';
  // country is multi-select: comma-separated in the URL, an array for
  // the UI. Empty/missing param -> empty array -> no filter.
  const country = (searchParams.get('country') || '').split(',').filter(Boolean);

  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState(null);

  // Loading is derived rather than an explicit setState-in-effect flag:
  // it's true whenever the request key we last successfully resolved
  // doesn't match the key we currently want (page/prediction/country).
  const requestKey = `${page}|${prediction}|${country.join(',')}`;
  const [loadedKey, setLoadedKey] = useState(null);
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;

    fetchTransactions({ page, prediction, country })
      .then((data) => {
        if (cancelled) return;
        setTransactions(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadedKey(requestKey);
      });

    // Guards against a stale response overwriting a newer one if the
    // URL changes again before this fetch resolves (e.g. rapid
    // Previous/Next clicks).
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- country is a new array reference every render (derived via .split/.filter), so listing it directly would re-run this effect on every render regardless of whether it actually changed. requestKey already encodes country's real value (joined into a stable string), so depending on requestKey alone is correct.
  }, [page, prediction, requestKey]);

  // Changing a filter invalidates the current page (fewer matching rows
  // may mean fewer total pages), so filter changes reset the URL's page
  // param back to 1 (by removing it -- absent means page 1) rather than
  // leaving the user stranded past the new last page.
  function setPrediction(value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set('prediction', value);
      } else {
        next.delete('prediction');
      }
      next.delete('page');
      return next;
    });
  }

  // Toggles a single country in/out of the multi-select set, rebuilding
  // the comma-separated URL param from the current one (read fresh from
  // `prev`, not the outer closure's `country`, so rapid toggles can't
  // race against a stale snapshot).
  function toggleCountry(value) {
    setSearchParams((prev) => {
      const current = (prev.get('country') || '').split(',').filter(Boolean);
      const isSelected = current.includes(value);
      const updated = isSelected ? current.filter((c) => c !== value) : [...current, value];

      const next = new URLSearchParams(prev);
      if (updated.length > 0) {
        next.set('country', updated.join(','));
      } else {
        next.delete('country');
      }
      next.delete('page');
      return next;
    });
  }

  function setPage(nextPage) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPage <= 1) {
        next.delete('page');
      } else {
        next.set('page', String(nextPage));
      }
      return next;
    });
  }

  return (
    <SearchContext.Provider
      value={{
        transactions,
        loading,
        error,
        page,
        setPage,
        prediction,
        setPrediction,
        country,
        toggleCountry,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}
