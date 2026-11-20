/**
 * Two signals live here.
 *
 * 1. Screen refreshes (`subscribeTables`, perf audit r2 N3). expo-sqlite's change listener fires once
 *    per changed ROW, each delivered as its own JS task, so a per-hook microtask never merged
 *    anything: "start workout" (about 24 inserts) re-ran the player's queries about 24 times, and a
 *    sync settle re-ran every watching screen once per row. One shared hub now collects the changed
 *    tables and calls each subscriber once if any of its tables changed:
 *    - our own writes (the repos' local write signal, sent once per table when a transaction
 *      commits) flush on the next microtask, so a screen that computes its next write from live
 *      data never reads a stale value;
 *    - native row events flush once per frame (requestAnimationFrame, with a timer fallback when no
 *      frame comes). Most are only the echo of a write already flushed: SQLite's `total_changes()`
 *      tells, and when nothing was written since the last flush the echo is dropped. So "start
 *      workout" refreshes the player exactly once;
 *    - while a hold is active (`holdLiveRefresh`, the sync pull) nothing flushes; the release
 *      flushes once.
 *
 * 2. Local write signals, below: repos call notifyLocalWrite() after every local write; the sync
 * scheduler and the notification/widget rebuild listen (debounced). Keeps src/db free of any
 * network import.
 *
 * Inside `batchLocalWrites` (used by `withTransaction`) the signals are held and sent once per
 * table when the outermost batch commits, so a 24-row "start workout" pings listeners once, not 24
 * times. A rolled-back batch sends nothing (nothing was written).
 */
import { addDatabaseChangeListener } from 'expo-sqlite';

import { getRawDb } from './client';

/* ----------------------------- screen refreshes ----------------------------- */

type TableSub = { tables: ReadonlySet<string>; cb: () => void };
type Scheduler = (flush: () => void) => void;

const tableSubs = new Set<TableSub>();
let nativeSub: { remove: () => void } | null = null;
let changed = new Set<string>();
/** A local write signal is among `changed` (flush on a microtask, never drop as an echo). */
let localChange = false;
let microArmed = false;
let frameArmed = false;
let holds = 0;
/** `total_changes()` (and its connection) at the last flush: unchanged → native events are echoes. */
let lastFlush: { db: unknown; n: number } | null = null;

/** Upper bound on the wait when no frame comes (app in the background, a test environment). */
export const LIVE_FLUSH_FALLBACK_MS = 100;

const frameScheduler: Scheduler = (flush) => {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    flush();
  };
  const timer = setTimeout(once, LIVE_FLUSH_FALLBACK_MS);
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown })
    .requestAnimationFrame;
  if (typeof raf === 'function') raf(once);
};

let scheduler: Scheduler = frameScheduler;

function watched(table: string): boolean {
  for (const s of tableSubs) if (s.tables.has(table)) return true;
  return false;
}

function arm(): void {
  if (holds > 0 || changed.size === 0) return;
  if (localChange) {
    if (microArmed) return;
    microArmed = true;
    queueMicrotask(() => {
      microArmed = false;
      flushTableChanges();
    });
    return;
  }
  if (frameArmed) return;
  frameArmed = true;
  scheduler(() => {
    frameArmed = false;
    flushTableChanges();
  });
}

/** A table changed (native row event, or `local`: our own write signal): refresh its watchers. */
function markTableChanged(table: string, local: boolean): void {
  if (!watched(table)) return;
  changed.add(table);
  if (local) localChange = true;
  arm();
}

/** Rows written on the app's connection so far, or null when it cannot be read. */
function writeCounter(): { db: unknown; n: number } | null {
  try {
    const db = getRawDb();
    const row = db.getFirstSync('SELECT total_changes() AS n') as { n: number } | null;
    return row ? { db, n: Number(row.n) } : null;
  } catch {
    return null;
  }
}

function flushTableChanges(): void {
  if (holds > 0 || changed.size === 0) return;
  const counter = writeCounter();
  if (
    !localChange &&
    counter &&
    lastFlush &&
    lastFlush.db === counter.db &&
    lastFlush.n === counter.n
  ) {
    // Only echoes of writes the last flush already covered.
    changed = new Set();
    return;
  }
  const tables = changed;
  changed = new Set();
  localChange = false;
  lastFlush = counter;
  for (const s of [...tableSubs]) {
    if (!tableSubs.has(s)) continue;
    for (const t of tables) {
      if (!s.tables.has(t)) continue;
      try {
        s.cb();
      } catch {
        // one screen's refresh must never stop the others
      }
      break;
    }
  }
}

/**
 * Call `cb` (once per burst) after any of `tables` changed. Every live hook goes through
 * this, so a burst of row events, from one transaction or a sync page, refreshes each screen once.
 */
export function subscribeTables(tables: Iterable<string>, cb: () => void): () => void {
  const sub: TableSub = { tables: new Set(tables), cb };
  tableSubs.add(sub);
  nativeSub ??= addDatabaseChangeListener(({ tableName }) => markTableChanged(tableName, false));
  return () => {
    tableSubs.delete(sub);
    if (tableSubs.size === 0 && nativeSub) {
      nativeSub.remove();
      nativeSub = null;
      changed.clear();
      localChange = false;
    }
  };
}

/**
 * Hold screen refreshes (a sync pull merging pages of rows). Changes are collected, and the last
 * release flushes them once, so a restore of n rows costs one re-read, not n. The returned release
 * is idempotent; always call it (try/finally).
 */
export function holdLiveRefresh(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    arm();
  };
}

/** Tests: run flushes with a custom scheduler (null restores the frame scheduler). */
export function setLiveRefreshSchedulerForTests(s: Scheduler | null): void {
  scheduler = s ?? frameScheduler;
}

/** Tests: drop subscribers, pending changes and holds. */
export function resetLiveRefreshForTests(): void {
  tableSubs.clear();
  nativeSub?.remove();
  nativeSub = null;
  changed = new Set();
  localChange = false;
  microArmed = false;
  frameArmed = false;
  lastFlush = null;
  holds = 0;
  scheduler = frameScheduler;
}

/* ----------------------------- local write signals ----------------------------- */

type Listener = (table: string) => void;
const listeners = new Set<Listener>();

let depth = 0;
let pending = new Set<string>();

export function onLocalWrite(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function emit(table: string): void {
  // Our own writes refresh screens on the next microtask (their native echoes are then dropped).
  markTableChanged(table, true);
  for (const l of [...listeners]) {
    try {
      l(table);
    } catch {
      // a listener must never break a local write
    }
  }
}

export function notifyLocalWrite(table: string): void {
  if (depth > 0) {
    pending.add(table);
    return;
  }
  emit(table);
}

/** True while inside a batch (e.g. a `withTransaction` body). */
export function isBatchingLocalWrites(): boolean {
  return depth > 0;
}

/**
 * Hold write signals while `fn` runs; send each touched table once at the end of the outermost
 * batch, or drop them all if `fn` throws there. Synchronous only.
 */
export function batchLocalWrites<T>(fn: () => T): T {
  depth += 1;
  let ok = false;
  try {
    const out = fn();
    ok = true;
    return out;
  } finally {
    depth -= 1;
    if (depth === 0) {
      const tables = pending;
      pending = new Set();
      if (ok) for (const t of tables) emit(t);
    }
  }
}
