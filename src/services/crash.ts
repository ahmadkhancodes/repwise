/**
 * Crash reporting (Sentry, sheet 12). Off unless `EXPO_PUBLIC_SENTRY_DSN` is set.
 * - No PII: sendDefaultPii off, no user, no IP, no screenshots or view hierarchy.
 * - Breadcrumbs are scrubbed: console and text-input crumbs dropped, URLs lose their query
 *   string, crumb data goes through the analytics privacy guard.
 * - Respects Settings → Privacy → "Share anonymous usage data" (events dropped when off).
 */
import type { ComponentType } from 'react';

import { sanitizeProps } from './analyticsGuard';
import { isUsageSharingOn } from './privacy';

/** Minimal shapes we touch (structurally compatible with Sentry's Event / Breadcrumb). */
export type CrashBreadcrumb = {
  category?: string;
  type?: string;
  message?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
};
export type CrashEvent = {
  user?: unknown;
  request?: { url?: string; cookies?: unknown; headers?: unknown; data?: unknown; query_string?: unknown; [k: string]: unknown };
  server_name?: string;
  breadcrumbs?: CrashBreadcrumb[];
  extra?: Record<string, unknown>;
  [k: string]: unknown;
};

type SentryLike = {
  init: (options: Record<string, unknown>) => void;
  wrap: <P extends Record<string, unknown>>(c: ComponentType<P>) => ComponentType<P>;
};

const DROPPED_CATEGORIES = new Set(['console', 'ui.input', 'ui.click', 'touch']);

export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Returns a scrubbed breadcrumb, or null to drop it. Pure. */
export function scrubBreadcrumb(crumb: CrashBreadcrumb): CrashBreadcrumb | null {
  if (crumb.category && DROPPED_CATEGORIES.has(crumb.category)) return null;
  const out: CrashBreadcrumb = { ...crumb };
  if (out.data) {
    const data: Record<string, unknown> = { ...out.data };
    if (typeof data.url === 'string') data.url = stripQuery(data.url);
    // Navigation crumbs carry route params; keep only the route names.
    for (const k of ['from', 'to']) if (typeof data[k] === 'string') data[k] = stripQuery(data[k] as string);
    delete data.params;
    delete data.body;
    delete data.request_body;
    delete data.response_body;
    const url = data.url;
    out.data = { ...sanitizeProps(data), ...(typeof url === 'string' ? { url } : {}) };
  }
  if (typeof out.message === 'string' && (crumb.category === 'http' || crumb.category === 'fetch' || crumb.category === 'xhr'))
    out.message = stripQuery(out.message);
  return out;
}

/** Returns a scrubbed event, or null to drop it (user opted out). Pure apart from the opt-out read. */
export function scrubEvent<E extends CrashEvent>(event: E, sharingOn: boolean = isUsageSharingOn()): E | null {
  if (!sharingOn) return null;
  const out: E = { ...event };
  delete out.user;
  delete out.server_name;
  if (out.request) {
    const { url } = out.request;
    out.request = typeof url === 'string' ? { url: stripQuery(url) } : {};
  }
  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is CrashBreadcrumb => b !== null);
  }
  if (out.extra) out.extra = sanitizeProps(out.extra);
  return out;
}

let sdk: SentryLike | null = null;

export type CrashConfig = {
  dsn?: string;
  /** Test seam; defaults to `@sentry/react-native`. */
  sdk?: SentryLike;
};

/** Starts Sentry when a DSN is configured; otherwise a no-op. Returns whether it started. Never throws. */
export function initCrashReporting(config: CrashConfig = {}): boolean {
  const dsn = config.dsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return false;
  // Opted out at launch: don't start at all (no session pings). Opting out later drops events in beforeSend.
  if (!isUsageSharingOn()) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const s = config.sdk ?? (require('@sentry/react-native') as SentryLike);
    s.init({
      dsn,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableAutoSessionTracking: true, // crash-free sessions KPI (sheet 23)
      tracesSampleRate: 0, // free tier: errors + sessions only
      environment: __DEV__ ? 'development' : 'production',
      maxBreadcrumbs: 50,
      beforeBreadcrumb: (b: CrashBreadcrumb) => scrubBreadcrumb(b),
      beforeSend: (e: CrashEvent) => scrubEvent(e),
    });
    sdk = s;
    return true;
  } catch {
    sdk = null;
    return false;
  }
}

/** Wraps the root component with Sentry's error boundary/profiler when Sentry is running. */
export function withCrashReporting<P extends Record<string, unknown>>(Root: ComponentType<P>): ComponentType<P> {
  if (!sdk) return Root;
  try {
    return sdk.wrap(Root);
  } catch {
    return Root;
  }
}

export function resetCrashForTests(): void {
  sdk = null;
}
