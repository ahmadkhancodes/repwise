/**
 * Analytics facade (sheet 23). `track(event, props)` is safe to call anywhere: it never throws and
 * never blocks. Until PostHog lands (phase 3), events go to an in-memory sink (dev log + tests).
 * Rule: never send body measurements, meal text or AI prompts — only categories and counts.
 */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;
export type AnalyticsSink = (event: string, props: AnalyticsProps) => void;

let sink: AnalyticsSink | null = null;
const recent: { event: string; props: AnalyticsProps }[] = [];
const MAX_RECENT = 200;

/** Plug in the real client (PostHog) at startup. */
export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

export function track(event: string, props: AnalyticsProps = {}): void {
  try {
    recent.push({ event, props });
    if (recent.length > MAX_RECENT) recent.shift();
    sink?.(event, props);
  } catch {
    // analytics must never break the app
  }
}

/** Events tracked in this process (tests and the dev gallery). */
export function trackedEvents(): readonly { event: string; props: AnalyticsProps }[] {
  return recent;
}

export function resetAnalyticsForTests(): void {
  recent.length = 0;
  sink = null;
}
