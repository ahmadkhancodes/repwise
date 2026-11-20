import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type LiveValue<T> = { data: T | undefined; error?: Error; loaded: boolean };

function run<T>(compute: () => T): LiveValue<T> {
  try {
    return { data: compute(), loaded: true };
  } catch (e) {
    return { data: undefined, loaded: true, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * A synchronous local query that re-runs when any of `tables` changes (expo-sqlite change
 * listener, coalesced per tick). Runs during the first render, so screens paint from SQLite with
 * no empty flash (sheet 11: no spinner after first launch). Use for multi-table reads that
 * drizzle's single-table `useLiveQuery` cannot follow.
 *
 * `active: false` (a screen in the background, e.g. Train under the player) stops re-querying on
 * every write; the screen refreshes once when it becomes active again, only if something changed.
 */
export function useLiveValue<T>(
  compute: () => T,
  tables: string[],
  deps: unknown[],
  opts: { active?: boolean } = {},
): LiveValue<T> {
  const active = opts.active ?? true;
  const [value, setValue] = useState<LiveValue<T>>(() => run(compute));
  const computeRef = useRef(compute);
  useLayoutEffect(() => {
    computeRef.current = compute;
  });
  const first = useRef(true);
  const stale = useRef(false);
  const activeRef = useRef(active);
  const key = tables.join(',');

  useEffect(() => {
    let alive = true;
    let queued = false;
    const refresh = () => {
      if (alive) setValue(run(computeRef.current));
    };
    if (first.current) first.current = false;
    else refresh();
    const watched = new Set(key.split(','));
    const sub = addDatabaseChangeListener(({ tableName }) => {
      if (!watched.has(tableName)) return;
      if (!activeRef.current) {
        stale.current = true;
        return;
      }
      if (queued) return;
      queued = true;
      void Promise.resolve().then(() => {
        queued = false;
        refresh();
      });
    });
    return () => {
      alive = false;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  useEffect(() => {
    activeRef.current = active;
    if (active && stale.current) {
      stale.current = false;
      setValue(run(computeRef.current));
    }
  }, [active]);

  return value;
}
