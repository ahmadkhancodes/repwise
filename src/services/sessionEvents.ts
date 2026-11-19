/**
 * Account session lifecycle events. Other services (billing entitlement cache, analytics, sync)
 * subscribe here instead of importing auth, so sign-out/expiry/deletion clean up everywhere.
 */
export type SessionEvent =
  | { type: 'signedIn'; userId: string; anonymous: boolean }
  /** The user signed out, or the server rejected the refresh token (session expired/revoked). */
  | { type: 'signedOut'; reason: 'user' | 'expired' | 'deleted' };

type Listener = (e: SessionEvent) => void;
const listeners = new Set<Listener>();

export function onSessionEvent(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function emitSessionEvent(e: SessionEvent): void {
  for (const l of [...listeners]) {
    try {
      l(e);
    } catch {
      // one failing listener must not stop the others
    }
  }
}
