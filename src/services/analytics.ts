/**
 * Analytics seam (sheet 23). Screens call `track(event, props)`; the PostHog adapter is plugged in
 * later with `setAnalyticsSink` (phase 3). Props are categories and counts only: never body
 * measurements, meal text or prompts. Until a sink is set, events are dropped.
 */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;
export type AnalyticsSink = (event: string, props: AnalyticsProps) => void;

let sink: AnalyticsSink | null = null;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

export function track(event: string, props: AnalyticsProps = {}): void {
  try {
    sink?.(event, props);
  } catch {
    // Analytics must never break a user action.
  }
}
