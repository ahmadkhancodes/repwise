/**
 * Meals per day → slot labels and default clock times (S05 "meal times"). Pure.
 * Slot order mirrors the engine's `mealSlotsFor`: 2 = lunch + dinner, 3 adds breakfast, 4–6 add snacks.
 */
export const MIN_MEALS = 2;
export const MAX_MEALS = 6;

const LABELS: Record<number, string[]> = {
  2: ['Lunch', 'Dinner'],
  3: ['Breakfast', 'Lunch', 'Dinner'],
  4: ['Breakfast', 'Lunch', 'Snack', 'Dinner'],
  5: ['Breakfast', 'Snack', 'Lunch', 'Snack', 'Dinner'],
  6: ['Breakfast', 'Snack', 'Lunch', 'Snack', 'Dinner', 'Snack'],
};

const TIMES: Record<number, string[]> = {
  2: ['12:30', '19:00'],
  3: ['08:00', '13:00', '19:00'],
  4: ['08:00', '13:00', '16:30', '19:30'],
  5: ['08:00', '10:30', '13:00', '16:30', '19:30'],
  6: ['07:30', '10:30', '13:00', '16:00', '19:00', '21:00'],
};

const clampMeals = (n: number) => Math.min(MAX_MEALS, Math.max(MIN_MEALS, Math.round(n)));

export function mealLabels(n: number): string[] {
  return [...LABELS[clampMeals(n)]!];
}

export function defaultMealTimes(n: number): string[] {
  return [...TIMES[clampMeals(n)]!];
}

export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fromMinutes(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/**
 * Move one meal by `delta` minutes, staying between its neighbours (at least 30 min apart) and
 * inside 05:00–23:30, so meals never swap order.
 */
export function shiftMealTime(times: readonly string[], index: number, delta: number): string[] {
  const out = [...times];
  const cur = out[index];
  if (cur === undefined) return out;
  const prev = index > 0 ? toMinutes(out[index - 1]!) + 30 : 5 * 60;
  const next = index < out.length - 1 ? toMinutes(out[index + 1]!) - 30 : 23 * 60 + 30;
  const v = Math.min(next, Math.max(prev, toMinutes(cur) + delta));
  out[index] = fromMinutes(v);
  return out;
}

/** "13:00" → "1:00 pm" when the locale uses a 12-hour clock. Pure. */
export function formatClock(hhmm: string, twelveHour: boolean): string {
  if (!twelveHour) return hhmm;
  const min = toMinutes(hhmm);
  const h = Math.floor(min / 60);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min % 60).padStart(2, '0')} ${suffix}`;
}
