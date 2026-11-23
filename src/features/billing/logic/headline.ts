import { GATES, isGateFeature } from './gates';

/**
 * The one paywall title (UI audit N7), chosen by where the user came from so it always fits:
 * "Your plan is ready" only right after onboarding; gates name what they unlock. Pure.
 */
export type PaywallSource =
  | 'onboarding'
  | 'eat_week'
  | 'grocery'
  | 'history'
  | 'progress'
  | 'body'
  | 'photos'
  | 'records'
  | 'checkin'
  | 'gate:routines'
  | 'notifications'
  | 'settings';

const HEADLINES: Record<PaywallSource, string> = {
  onboarding: 'Your plan is ready.',
  eat_week: 'Plan the whole week.',
  grocery: 'Your grocery list, done.',
  history: 'Every workout, all-time.',
  progress: 'See every month add up.',
  body: 'Track every measurement.',
  photos: 'See the change, side by side.',
  records: 'Every record, every lift.',
  checkin: 'A plan that adapts every week.',
  'gate:routines': 'Build every routine you want.',
  notifications: 'Your day, planned and on time.',
  settings: 'Train and eat to plan.',
};

export const DEFAULT_PAYWALL_HEADLINE = 'Train and eat to plan.';

export function paywallHeadline(source: string | undefined, name?: string): string {
  if (source === 'onboarding') return name ? `Your plan is ready, ${name}.` : HEADLINES.onboarding;
  const gate = source?.startsWith('gate:') ? source.slice(5) : null;
  if (isGateFeature(gate)) return `${GATES[gate].title}.`;
  return (source && HEADLINES[source as PaywallSource]) || DEFAULT_PAYWALL_HEADLINE;
}
