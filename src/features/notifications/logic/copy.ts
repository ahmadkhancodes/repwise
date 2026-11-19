/**
 * Notification copy, word for word from sheet 17 where it gives copy. Short, calm, no advice.
 */
type WorkoutLike = { title: string; exercises: number; minutes: number | null } | null;
type MealLike = { slot: string; name: string; kcal: number; protein?: number };

const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

export function slotLabel(slot: string): string {
  return SLOT_LABEL[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1);
}

/** N-2 "Lunch time 🍽". */
export function mealTitle(slot: string): string {
  return `${slotLabel(slot)} time 🍽`;
}

const kcal = (n: number) => `${Math.round(n)} kcal`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function workoutLine(w: NonNullable<WorkoutLike>): string {
  const parts = [plural(w.exercises, 'exercise')];
  if (w.minutes) parts.push(`${w.minutes} min`);
  return parts.join(' · ');
}

export const copy = {
  /** N-1 "Push day · 52 min" / "Rest day". */
  briefTitle(w: WorkoutLike): string {
    if (!w) return 'Rest day';
    return w.minutes ? `${w.title} · ${w.minutes} min` : w.title;
  },
  /** N-1 "Lunch: chicken karahi bowl · 610 kcal". */
  briefBody(w: WorkoutLike, meal: MealLike | null): string {
    if (meal) return `${slotLabel(meal.slot)}: ${meal.name} · ${kcal(meal.kcal)}`;
    if (w) return workoutLine(w);
    return 'Your plan for today is ready';
  },
  /** N-2 "{dish} · {kcal} kcal · {protein} g protein". */
  mealBody(m: MealLike): string {
    const parts = [m.name, kcal(m.kcal)];
    if (m.protein != null) parts.push(`${Math.round(m.protein)} g protein`);
    return parts.join(' · ');
  },
  /** N-3 "Leg day in 30 min". */
  workoutTitle(title: string, leadMin: number): string {
    return leadMin > 0 ? `${title} in ${leadMin} min` : `${title} starts now`;
  },
  /** N-3 "{n} exercises · {min} min". */
  workoutBody(w: NonNullable<WorkoutLike>): string {
    return workoutLine(w);
  },
  fuelTitle: 'Fuel up',
  /** N-4 "{snack} 60 min before training". */
  fuelBody(snack: string): string {
    return `${snack} 60 min before training`;
  },
  eveningTitle(w: WorkoutLike): string {
    return w ? `Tomorrow: ${w.title}` : 'Tomorrow: rest day';
  },
  eveningBody(w: WorkoutLike, mealLine: string | null): string {
    const parts: string[] = [];
    if (w) parts.push(workoutLine(w));
    if (mealLine) parts.push(mealLine);
    return parts.length ? parts.join(' · ') : 'Your plan is ready';
  },
  /** N-5. */
  restOverTitle: 'Rest over',
  restOverBody(exercise: string | null, setNo: number | null): string {
    if (exercise && setNo) return `Next: ${exercise} set ${setNo}`;
    if (exercise) return `Next: ${exercise}`;
    return 'Time for your next set';
  },
  checkinTitle: 'Your week in 30 seconds',
  checkinBody: 'Check in to tune next week',
  trialTitle: 'Your free trial ends in 2 days',
  trialBody: 'Keep Repwise Pro or cancel in one tap.',
} as const;
