/**
 * UI actions shared by Today and Eat, so the same tap gives the same feedback everywhere: one
 * haptic (the Tick / button owns it), one silent undo toast with the same copy, and the review
 * prompt at the "all of today's meals eaten" success moment.
 */
import { GLASS_ML } from '@/features/nutrition/logic/water';
import { haptics } from '@/services/haptics';
import { maybeAskForReview, REVIEW_DELAY_MS } from '@/services/review';
import { showToast, showUndoToast } from '@/ui';

import { addWater, markMealEaten, setMealOpen, tickMealIfOpen, undoLog, type TickFromLinkResult } from './service';

type ToggleMeal = { id: string; title: string; status: string };

/** True when ticking `mealId` makes every meal of the day eaten (skipped meals don't block). Pure. */
export function completesDay(mealId: string, day: readonly { id: string; status: string }[]): boolean {
  const open = day.filter((m) => m.id !== mealId && m.status !== 'eaten' && m.status !== 'skipped');
  return day.some((m) => m.id === mealId) && open.length === 0;
}

/**
 * Tick (or untick) a meal with a 5 s undo. `day` is that day's meals, used to spot the moment the
 * day is complete. Returns false when the meal no longer exists.
 */
export function toggleMeal(meal: ToggleMeal, day: readonly { id: string; status: string }[] = []): boolean {
  if (meal.status === 'eaten') {
    if (!setMealOpen(meal.id, 'planned')) return false;
    showUndoToast(`${meal.title} unticked`, () => {
      markMealEaten(meal.id);
    });
    return true;
  }
  if (!markMealEaten(meal.id)) return false;
  showUndoToast(`${meal.title} logged`, () => {
    setMealOpen(meal.id, 'planned');
  });
  if (completesDay(meal.id, day)) {
    setTimeout(() => void maybeAskForReview('meals_day_complete'), REVIEW_DELAY_MS);
  }
  return true;
}

/** One glass of water with undo (Today card and Eat tile share the copy). */
export function quickAddWater(date: string, ml: number = GLASS_ML): void {
  const row = addWater(date, ml);
  showUndoToast(`${ml} ml water added`, () => {
    undoLog(row.id);
  });
}

/**
 * Widget "Ate it" deep link (`/eat?mealId=…&tick=1`): tick the meal through the meals service with
 * the core-action success haptic and a silent undo toast. Idempotent: an already-eaten meal only
 * says so (no write, no buzz); a missing meal says it is gone.
 */
export function tickMealFromLink(mealId: string, now: number = Date.now()): TickFromLinkResult {
  const res = tickMealIfOpen(mealId, now);
  if (res.status === 'ticked') {
    haptics.success();
    const previous = res.previous;
    showUndoToast(`${res.name} logged`, () => {
      setMealOpen(mealId, previous);
    });
  } else if (res.status === 'already') {
    showToast({ message: `${res.name} is already logged` });
  } else {
    showToast({ message: 'That meal is no longer in your plan' });
  }
  return res;
}
