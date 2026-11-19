/**
 * Analytics seam (sheet 23). Screens call `track(event, props)`; the PostHog SDK plugs in later
 * with `setAnalyticsSink`. Props are categories and counts only: never body measurements, meal
 * text or AI prompts (sheet 23). Values that are not short strings, numbers or booleans are dropped.
 */
export type AnalyticsProps = Record<string, string | number | boolean>;
export type AnalyticsSink = (event: string, props: AnalyticsProps) => void;

let sink: AnalyticsSink | null = null;
const MAX_STRING = 64;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

/** Keep only primitive, short values. Pure; exported for tests. */
export function cleanProps(props: Record<string, unknown> = {}): AnalyticsProps {
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
    else if (typeof v === 'string' && v.length <= MAX_STRING) out[k] = v;
  }
  return out;
}

/** Fire-and-forget; analytics never breaks a screen. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!sink) return;
  try {
    sink(event, cleanProps(props));
  } catch {
    // ignore sink failures
  }
}
