import * as ExpoRouter from 'expo-router';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Focus of the current screen. Tests (and any render outside a navigator) have no focus hook, so
 * the screen counts as focused there.
 */
const useFocused: () => boolean =
  typeof (ExpoRouter as { useIsFocused?: unknown }).useIsFocused === 'function'
    ? (ExpoRouter as unknown as { useIsFocused: () => boolean }).useIsFocused
    : () => true;

/**
 * Synchronous local snapshot that re-reads when any of `tables` changes. Unlike useLiveQuery
 * the first render already has data (no empty flash), so Today renders straight from cache.
 *
 * Cheap on purpose (perf audit A2/A6/A13):
 *  - a burst of writes (a multi-row insert, a tick that writes a log and a status) reloads ONCE
 *    (coalesced to a microtask);
 *  - while the screen is blurred (the player is pushed on top) changes only mark it dirty, and it
 *    reloads once when it is focused again;
 *  - `deps` (dates, ids) are keyed with a plain join, not JSON.stringify per render.
 */
export function useDbSnapshot<T>(
  tables: readonly string[],
  load: () => T,
  deps: readonly unknown[],
): { data: T | null; error: Error | null; reload: () => void } {
  const focused = useFocused();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const key = tables.join(',');
  const focusedRef = useRef(focused);
  const dirty = useRef(false);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  useEffect(() => {
    const watched = new Set(key.split(','));
    let queued = false;
    let live = true;
    const sub = addDatabaseChangeListener(({ tableName }) => {
      if (!watched.has(tableName)) return;
      if (!focusedRef.current) {
        dirty.current = true;
        return;
      }
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (live) reload();
      });
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [key, reload]);

  useEffect(() => {
    if (focused && dirty.current) {
      dirty.current = false;
      reload();
    }
  }, [focused, reload]);

  const depsKey = deps.map(String).join('\u0001');
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
