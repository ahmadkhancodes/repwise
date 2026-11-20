/** Progress home (S29) decisions, pure and unit-tested. */
import type { MonthKey } from './dates';
import type { Wrapped } from './wrapped';

/** Free plan: this month and last month (≈ 30 days, RW-50). Pro: everything. */
export function isMonthLocked(month: MonthKey, current: MonthKey, isPro: boolean): boolean {
  if (isPro) return false;
  return month.year * 12 + month.month < current.year * 12 + current.month - 1;
}

/** One line under the Wrapped teaser tile. */
export function wrappedTeaser(w: Pick<Wrapped, 'workouts' | 'prs' | 'volumeKg'>): string {
  if (w.workouts === 0) return 'Your month builds itself as you train';
  const parts = [`${w.workouts} ${w.workouts === 1 ? 'workout' : 'workouts'}`];
  if (w.prs.length) parts.push(`${w.prs.length} ${w.prs.length === 1 ? 'PR' : 'PRs'}`);
  return parts.join(' · ');
}

/** "3 muscles recovering" / "All fresh" for the recovery tile. */
export function recoveryTeaser(worked: number): string {
  if (worked === 0) return 'All fresh';
  return `${worked} ${worked === 1 ? 'muscle' : 'muscles'} worked`;
}
