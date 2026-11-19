/** Approved price ladder (CLAUDE.md / sheet 05). Display only — real prices come from the store. */
export type PlanId = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type Plan = { id: PlanId; title: string; price: string; period: string; trialDays: number };

export const PLANS: readonly Plan[] = [
  { id: 'weekly', title: 'Weekly', price: '$4.99', period: 'week', trialDays: 0 },
  { id: 'monthly', title: 'Monthly', price: '$12.99', period: 'month', trialDays: 0 },
  { id: 'quarterly', title: '3 months', price: '$24.99', period: '3 months', trialDays: 0 },
  { id: 'yearly', title: 'Yearly', price: '$59.99', period: 'year', trialDays: 7 },
];

export const DEFAULT_PLAN: PlanId = 'yearly';

/** Plain-words price line shown under the CTA (paywall non-negotiable). Pure. */
export function priceLine(plan: Plan): string {
  const after = `${plan.price}/${plan.period}`;
  return plan.trialDays > 0
    ? `${plan.trialDays} days free, then ${after}. Cancel anytime.`
    : `${after}. Cancel anytime.`;
}

export function ctaLabel(plan: Plan): string {
  return plan.trialDays > 0 ? 'Start free trial' : 'Continue';
}
