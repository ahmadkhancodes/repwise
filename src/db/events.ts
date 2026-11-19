/**
 * Tiny in-process signal: repos call notifyLocalWrite() after every local write; the sync
 * scheduler listens and pushes (debounced). Keeps src/db free of any network import.
 */
type Listener = (table: string) => void;
const listeners = new Set<Listener>();

export function onLocalWrite(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function notifyLocalWrite(table: string): void {
  for (const l of [...listeners]) {
    try {
      l(table);
    } catch {
      // a listener must never break a local write
    }
  }
}
