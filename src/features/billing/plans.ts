import type { PlanId } from '@/services/billingApi';

export type { PlanId };

/** Approved price ladder (CLAUDE.md / sheet 05). Fallback display only — real prices come from the store. */
export type Plan = {
  id: PlanId;
  title: string;
  /** USD fallback shown until the store's localised price arrives. */
  price: string;
  amount: number;
  period: string;
  /** Number of weeks the plan covers, for the per-week line. */
  weeks: number;
  trialDays: number;
  badge?: 'best_value' | 'popular';
};

/** Paywall order (sheet 16): Yearly (pre-selected), 3 Months, Monthly, Weekly last (sheet 05). */
export const PLANS: readonly Plan[] = [
  {
    id: 'yearly',
    title: 'Yearly',
    price: '$59.99',
    amount: 59.99,
    period: 'year',
    weeks: 52,
    trialDays: 7,
    badge: 'best_value',
  },
  {
    id: 'quarterly',
    title: '3 Months',
    price: '$24.99',
    amount: 24.99,
    period: '3 months',
    weeks: 13,
    trialDays: 0,
    badge: 'popular',
  },
  {
    id: 'monthly',
    title: 'Monthly',
    price: '$12.99',
    amount: 12.99,
    period: 'month',
    weeks: 52 / 12,
    trialDays: 0,
  },
  {
    id: 'weekly',
    title: 'Weekly',
    price: '$4.99',
    amount: 4.99,
    period: 'week',
    weeks: 1,
    trialDays: 0,
  },
];

export const DEFAULT_PLAN: PlanId = 'yearly';

export function planById(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id)!;
}

/** "$1.15" for $59.99/year. Pure. Falls back to "USD 1.15" if Intl cannot format the currency. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Per-week equivalent of a plan price, e.g. "$1.15". Null without a numeric price. */
export function perWeek(
  plan: PlanId,
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount == null || !currency || !(amount > 0)) return null;
  return formatMoney(Math.round((amount / planById(plan).weeks) * 100) / 100, currency);
}

export type PriceInput = {
  plan: PlanId;
  price: string;
  trialDays: number;
  perWeek?: string | null;
};

/**
 * Plain-words price line under the CTA (paywall non-negotiable, sheet 05 wording):
 * "7 days free, then $59.99/year ($1.15/week). Cancel anytime." Pure.
 */
export function priceLine({ plan, price, trialDays, perWeek: weekly }: PriceInput): string {
  const p = planById(plan);
  const after = `${price}/${p.period}${weekly && plan !== 'weekly' ? ` (${weekly}/week)` : ''}`;
  return trialDays > 0
    ? `${trialDays} days free, then ${after}. Cancel anytime.`
    : `${after}, renews automatically. Cancel anytime.`;
}

export function ctaLabel(trialDays: number): string {
  return trialDays > 0 ? 'Start free trial' : 'Continue';
}
