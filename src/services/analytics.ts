/**
 * Product analytics (sheet 23). Features call `track(event, props)`; the sink (PostHog, added in
 * the polish phase) is plugged in with `setAnalyticsSink`. Until then events go nowhere.
 * Props are categories and counts only — never body measurements, weights, meal text or prompts.
 */
export type AnalyticsProps = Record<string, string | number | boolean | null>;
export type AnalyticsSink = (event: string, props: AnalyticsProps) => void;

let sink: AnalyticsSink | null = null;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

export function track(event: string, props: AnalyticsProps = {}): void {
  try {
    sink?.(event, props);
  } catch {
    // analytics must never break a user action
  }
}
