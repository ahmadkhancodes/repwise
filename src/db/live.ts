/**
 * Live local reads for screens (perf audit r2 N3/N4). Every hook here:
 *  - computes synchronously in the first render, so a screen paints from SQLite with no empty
 *    flash (sheet 11) and no one-frame wrong value (e.g. kg before lb, N13);
 *  - re-runs through `subscribeTables` (src/db/events.ts): at most once per frame, however many row
 *    events a transaction or a sync page produced;
 *  - can be paused with `active: false`. Paused, a change only marks the value stale, and it
 *    re-runs once when it becomes active again. `useLiveRows` (and so every `repo.useLive`) is paused
 *    by default while its screen is not focused, so a tab in the background never re-reads its
 *    tables on every set tick.
 */
import * as ExpoRouter from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { subscribeTables } from './events';

export type LiveValue<T> = { data: T | undefined; error?: Error; loaded: boolean };

const routerFocus = (ExpoRouter as { useIsFocused?: () => boolean }).useIsFocused;

/**
 * True while the screen around this component is focused. Outside a navigator (tests, the root
 * layout) there is no focus context: count as focused. The hook is always called, so the hook order
 * never changes; only its "no navigator" error is caught.
 */
export function useScreenFocused(): boolean {
  if (typeof routerFocus !== 'function') return true;
  try {
    return routerFocus();
  } catch {
    return true;
  }
}

function run<T>(compute: () => T): LiveValue<T> {
  try {
    return { data: compute(), loaded: true };
  } catch (e) {
    return { data: undefined, loaded: true, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * A synchronous local query that re-runs when any of `tables` changes. Use for multi-table reads.
 * `deps` are the values the query closes over (ids, dates): a change re-runs it.
 */
export function useLiveValue<T>(
  compute: () => T,
  tables: readonly string[],
  deps: readonly unknown[],
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
    const refresh = () => {
      if (!alive) return;
      if (!activeRef.current) {
        stale.current = true;
        return;
      }
      setValue(run(computeRef.current));
    };
    if (first.current) first.current = false;
    else refresh();
    const off = subscribeTables(key.split(','), refresh);
    return () => {
      alive = false;
      off();
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

/** A query builder with drizzle's synchronous `.all()` (expo-sqlite driver). */
type RowsQuery<R> = { all: () => R[] };

const NO_ROWS: never[] = [];

/**
 * Rows of one drizzle query, live. The drop-in for drizzle's `useLiveQuery`, which re-runs on every
 * row event of its table, focused or not, and returns `[]` on the first render. Paused while the
 * screen is blurred unless `active` says otherwise.
 */
export function useLiveRows<R>(
  query: () => RowsQuery<R>,
  tables: readonly string[],
  deps: readonly unknown[],
  opts: { active?: boolean } = {},
): { data: R[]; error?: Error; loaded: boolean } {
  const focused = useScreenFocused();
  const v = useLiveValue(() => query().all(), tables, deps, { active: opts.active ?? focused });
  return { data: v.data ?? NO_ROWS, error: v.error, loaded: v.loaded };
}
