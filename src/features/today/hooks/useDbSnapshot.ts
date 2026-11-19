import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Synchronous local snapshot that re-reads when any of `tables` changes. Unlike useLiveQuery
 * the first render already has data (no empty flash), so Today renders straight from cache.
 */
export function useDbSnapshot<T>(
  tables: readonly string[],
  load: () => T,
  deps: unknown[],
): { data: T | null; error: Error | null; reload: () => void } {
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const key = tables.join(',');

  useEffect(() => {
    const watched = new Set(key.split(','));
    const sub = addDatabaseChangeListener(({ tableName }) => {
      if (watched.has(tableName)) reload();
    });
    return () => sub.remove();
  }, [key, reload]);

  const depsKey = JSON.stringify(deps);
  return useMemo(
    () => {
      try {
        return { data: load(), error: null, reload };
      } catch (e) {
        return { data: null, error: e instanceof Error ? e : new Error(String(e)), reload };
      }
    },
    // `load` is a fresh closure each render; it is re-run when the data version or `deps` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, reload, depsKey],
  );
}

/** Wall clock that ticks every `ms` (default one minute) so phase and date roll over. */
export function useNow(ms = 60_000, override?: number): number {
  const [now, setNow] = useState(() => override ?? Date.now());
  useEffect(() => {
    if (override != null) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, override]);
  return override ?? now;
}
