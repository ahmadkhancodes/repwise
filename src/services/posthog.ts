/**
 * PostHog sink for the analytics facade (sheet 12/23). Off unless `EXPO_PUBLIC_POSTHOG_KEY` is set.
 * - Anonymous only: we never call identify(), no person profiles, no GeoIP, no advertising IDs
 *   (the Android AD_ID permission is blocked in app.config.ts).
 * - Every event's props pass through `sanitizeProps` (no health values, no free text).
 * - Respects Settings → Privacy → "Share anonymous usage data" (`usePrivacyStore`).
 */
import type { AnalyticsSink } from './analytics';
import { sanitizeProps, type CleanProps } from './analyticsGuard';
import { isUsageSharingOn, usePrivacyStore } from './privacy';
import { kv } from './storage';

/** The slice of the PostHog client we use (lets tests inject a fake). */
export type PostHogLike = {
  capture: (event: string, properties?: CleanProps) => void;
  optIn: () => unknown;
  optOut: () => unknown;
  reset?: () => unknown;
};

export type PostHogConfig = {
  key?: string;
  host?: string;
  /** Test seam; defaults to `new PostHog(key, options)` from posthog-react-native. */
  createClient?: (key: string, host: string) => PostHogLike;
};

const DEFAULT_HOST = 'https://us.i.posthog.com';

function createRealClient(key: string, host: string): PostHogLike {
  // Loaded lazily so a missing key never touches the native SDK.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog } = require('posthog-react-native') as typeof import('posthog-react-native');
  return new PostHog(key, {
    host,
    personProfiles: 'never',
    disableGeoip: true,
    captureAppLifecycleEvents: false, // we send our own app_open (sheet 23)
    enableSessionReplay: false,
    // MMKV (already in the app) instead of AsyncStorage for the anonymous id + queue.
    customStorage: {
      getItem: (k: string) => kv.getString(`posthog.${k}`) ?? null,
      setItem: (k: string, v: string) => kv.set(`posthog.${k}`, v),
    },
  });
}

let client: PostHogLike | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Returns the PostHog sink, or `null` (no-op) when no key is configured or the SDK fails to start.
 * Never throws.
 */
export function createPostHogSink(config: PostHogConfig = {}): AnalyticsSink | null {
  const key = config.key ?? process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  const host = config.host ?? process.env.EXPO_PUBLIC_POSTHOG_HOST ?? DEFAULT_HOST;
  try {
    client = (config.createClient ?? createRealClient)(key, host);
  } catch {
    client = null;
    return null;
  }
  const c = client;
  if (!isUsageSharingOn()) void c.optOut();
  unsubscribe?.();
  unsubscribe = usePrivacyStore.subscribe((s, prev) => {
    if (s.shareUsageData === prev.shareUsageData) return;
    try {
      if (s.shareUsageData) void c.optIn();
      else {
        void c.optOut();
        void c.reset?.(); // forget the anonymous id once the user opts out
      }
    } catch {
      // analytics must never break the app
    }
  });
  return (event, props) => {
    if (!isUsageSharingOn()) return;
    c.capture(event, sanitizeProps(props));
  };
}

export function resetPostHogForTests(): void {
  unsubscribe?.();
  unsubscribe = null;
  client = null;
}
