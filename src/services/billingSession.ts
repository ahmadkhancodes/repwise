/**
 * Keeps billing in step with the account session (no billing import in auth, so no cycle):
 * - sign-out / deletion / expiry → drop the cached entitlement (MMKV + in-memory store);
 *   the unverified-purchase queue is kept so no purchase is ever lost;
 * - sign-in → re-read the entitlement (the merged account may already be Pro).
 */
import { billing, useBillingStore } from './billing';
import { ENTITLEMENT_CACHE_KEYS } from './auth';
import { onSessionEvent } from './sessionEvents';
import { kv } from './storage';

let off: (() => void) | null = null;

export function linkBillingToSession(): () => void {
  off ??= onSessionEvent((e) => {
    if (e.type === 'signedOut') {
      for (const k of ENTITLEMENT_CACHE_KEYS) kv.remove(k);
      useBillingStore.setState({ entitlement: null });
    } else if (!e.anonymous) {
      void billing().refreshEntitlement();
    }
  });
  return () => {
    off?.();
    off = null;
  };
}
