/**
 * Two signals live here.
 *
 * 1. Screen refreshes (`subscribeTables`, perf audit r2 N3). expo-sqlite's change listener fires once
 *    per changed ROW, each delivered as its own JS task, so a per-hook microtask never merged
 *    anything: "start workout" (about 24 inserts) re-ran the player's queries about 24 times, and a
 *    sync settle re-ran every watching screen once per row. One shared listener now collects the
 *    changed tables and flushes once per frame (requestAnimationFrame, with a timer fallback for
 *    when no frame comes), calling each subscriber once if any of its tables changed. While a hold is
 *    active (`holdLiveRefresh`, used by the sync pull) nothing flushes; the release flushes once.
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

/* ----------------------------- screen refreshes ----------------------------- */

type TableSub = { tables: ReadonlySet<string>; cb: () => void };
type Scheduler = (flush: () => void) => void;

const tableSubs = new Set<TableSub>();
let nativeSub: { remove: () => void } | null = null;
let changed = new Set<string>();
let flushArmed = false;
let holds = 0;

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
  if (flushArmed || holds > 0 || changed.size === 0) return;
  flushArmed = true;
  scheduler(flushTableChanges);
}

/** A table changed (native change event or a local write signal): refresh its watchers once. */
function markTableChanged(table: string): void {
  if (!watched(table)) return;
  changed.add(table);
  arm();
}

function flushTableChanges(): void {
  flushArmed = false;
  if (holds > 0) return;
  const tables = changed;
  changed = new Set();
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
 * Call `cb` (at most once per frame) after any of `tables` changed. Every live hook goes through
 * this, so a burst of row events, from one transaction or a sync page, refreshes each screen once.
 */
export function subscribeTables(tables: Iterable<string>, cb: () => void): () => void {
  const sub: TableSub = { tables: new Set(tables), cb };
  tableSubs.add(sub);
  nativeSub ??= addDatabaseChangeListener(({ tableName }) => markTableChanged(tableName));
  return () => {
    tableSubs.delete(sub);
    if (tableSubs.size === 0 && nativeSub) {
      nativeSub.remove();
      nativeSub = null;
      changed.clear();
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
  flushArmed = false;
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
  // Our own writes also refresh screens (merged with the native row events into one flush).
  markTableChanged(table);
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
