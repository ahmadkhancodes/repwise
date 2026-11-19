/** Meal slot labels and default clock times (profile meal_times override them). */
import { SLOT_ORDER } from '../repo';

export type Slot = (typeof SLOT_ORDER)[number];

export const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

export function slotLabel(slot: string): string {
  return SLOT_LABEL[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1);
}

const DEFAULT_TIMES: Record<string, string> = {
  breakfast: '08:00',
  lunch: '13:00',
  snack: '16:30',
  dinner: '19:30',
};

/**
 * Clock time for a slot. `mealTimes` from onboarding is either ["breakfast=08:00", …] or a plain
 * list in slot order ["08:00", "13:00", "19:30"]. Invalid values fall back to the defaults.
 */
export function slotTime(slot: string, mealTimes: readonly string[] = []): string | undefined {
  const valid = (s: string | undefined) => (s && /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : undefined);
  const keyed = mealTimes.find((m) => m.startsWith(`${slot}=`));
  if (keyed) return valid(keyed.split('=')[1]) ?? DEFAULT_TIMES[slot];
  const plain = mealTimes.filter((m) => !m.includes('='));
  const mains = ['breakfast', 'lunch', 'dinner'];
  const i = mains.indexOf(slot);
  if (plain.length >= 3 && i >= 0) return valid(plain[i]) ?? DEFAULT_TIMES[slot];
  return DEFAULT_TIMES[slot];
}

/** Next slot to eat: first planned meal whose time hasn't passed, else the first planned one. */
export function nextSlotIndex(
  meals: readonly { slot: string; status: string }[],
  nowHHMM: string,
  mealTimes: readonly string[] = [],
): number {
  const open = meals.map((m, i) => ({ m, i })).filter(({ m }) => m.status === 'planned');
  if (open.length === 0) return -1;
  const upcoming = open.find(({ m }) => (slotTime(m.slot, mealTimes) ?? '23:59') >= nowHHMM);
  return (upcoming ?? open[0]!).i;
}
