/**
 * Tiny in-process signal: repos call notifyLocalWrite() after every local write; the sync
 * scheduler and the notification/widget rebuild listen (debounced). Keeps src/db free of any
 * network import.
 *
 * Inside `batchLocalWrites` (used by `withTransaction`) the signals are held and sent once per
 * table when the outermost batch commits, so a 24-row "start workout" pings listeners once, not 24
 * times. A rolled-back batch sends nothing (nothing was written).
 */
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
