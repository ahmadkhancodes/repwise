import { and, desc, eq } from 'drizzle-orm';

import { createRepo, type NewRow, type Row } from '@/db/repo';
import { cards, plans } from '@/db/schema';

export const plansRepo = createRepo(plans, 'plans');
export const cardsRepo = createRepo(cards, 'cards');
export type Plan = Row<typeof plans>;
export type Card = Row<typeof cards>;

/** Latest plan of a type (newest week_start, then newest version). */
export function latestPlan(type: Plan['type']): Plan | undefined {
  return plansRepo
    .list(eq(plans.type, type))
    .sort(
      (a, b) =>
        (b.weekStart ?? '').localeCompare(a.weekStart ?? '') || (b.version ?? 0) - (a.version ?? 0),
    )[0];
}

export function planForWeek(type: Plan['type'], weekStart: string): Plan | undefined {
  return plansRepo.first(and(eq(plans.type, type), eq(plans.weekStart, weekStart)), desc(plans.version));
}

export function savePlan(values: NewRow<typeof plans>): Plan {
  return plansRepo.insert(values);
}

export function useLatestPlan(type: Plan['type']): Plan | undefined {
  return plansRepo.useLive(eq(plans.type, type), desc(plans.weekStart), [type]).data[0];
}

export function useCards(date: string): Card[] {
  return cardsRepo.useLive(eq(cards.date, date), desc(cards.createdAt), [date]).data;
}
