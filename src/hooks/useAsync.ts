import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { reportError, toAppError, type AppError } from '@/core/errors';

export interface AsyncState<T> {
  data: T | undefined;
  error: AppError | undefined;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  request: object | null;
  data?: T;
  error?: AppError;
}

/**
 * Minimal data hook for the shell. Can be replaced by TanStack Query later
 * without changing service contracts.
 *
 * Each (deps, reload) combination creates a new request token; `loading` is
 * derived by comparing it with the token of the last settled result, so no
 * state is set synchronously inside the effect. Previous data is kept while
 * reloading so screens don't flash.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ request: null });

  // New request token whenever caller deps or the reload nonce change. Adjusting
  // state during render is React's sanctioned pattern for derived resets.
  const [tracked, setTracked] = useState({ deps, nonce, request: {} as object });
  if (tracked.nonce !== nonce || !sameDeps(tracked.deps, deps)) {
    setTracked({ deps, nonce, request: {} });
  }
  const request = tracked.request;

  useEffect(() => {
    let cancelled = false;
    fn().then(
      (data) => {
        if (!cancelled) setSettled({ request, data });
      },
      (e: unknown) => {
        if (cancelled) return;
        const error = toAppError(e);
        reportError(error, { source: 'useAsync' });
        setSettled((prev) => ({ request, data: prev.data, error }));
      },
    );
    return () => {
      cancelled = true;
    };
    // `fn` is intentionally excluded: it is re-created every render, and the
    // request token already captures when the caller wants a new fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = settled.request !== request;
  return { data: settled.data, error: loading ? undefined : settled.error, loading, reload };
}

function sameDeps(a: DependencyList, b: DependencyList): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}
