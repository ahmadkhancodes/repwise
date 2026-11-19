/**
 * Adherence (workouts done + meals eaten) and calories vs target for the Trends screen.
 * Pure: plain rows in, chart-ready values out. Never sends values to analytics.
 */
import { addDays, startOfWeek, type ISODate } from './engine';

export type PlanSessionLike = { date: string | null; status: string | null };
export type MealPlanLike = { id: string; date: string; kcalTarget: number | null };
export type MealLike = { mealPlanId: string; status: string };
export type FoodLogLike = { date: string; kcal: number | null };

export type WeekAdherence = {
  weekStart: ISODate;
  workoutsDone: number;
  workoutsPlanned: number;
  mealsEaten: number;
  mealsPlanned: number;
  /** 0..1 over everything due so far, null when nothing was due. */
  rate: number | null;
};

/** Per week: what was due up to today (future days don't count against you) vs what got done. */
export function weeklyAdherence(
  sessions: readonly PlanSessionLike[],
  mealPlans: readonly MealPlanLike[],
  meals: readonly MealLike[],
  weekStarts: readonly ISODate[],
  today: ISODate,
): WeekAdherence[] {
  const planDate = new Map(mealPlans.map((p) => [p.id, p.date]));
  return weekStarts.map((ws) => {
    const monday = startOfWeek(ws);
    const end = addDays(monday, 7);
    const due = (d: string | null | undefined): d is string =>
      !!d && d >= monday && d < end && d <= today;
    const weekSessions = sessions.filter((s) => due(s.date));
    const workoutsDone = weekSessions.filter((s) => s.status === 'done').length;
    const weekMeals = meals.filter((m) => due(planDate.get(m.mealPlanId)));
    const mealsEaten = weekMeals.filter((m) => m.status === 'eaten').length;
    const planned = weekSessions.length + weekMeals.length;
    return {
      weekStart: monday,
      workoutsDone,
      workoutsPlanned: weekSessions.length,
      mealsEaten,
      mealsPlanned: weekMeals.length,
      rate: planned === 0 ? null : (workoutsDone + mealsEaten) / planned,
    };
  });
}

export type DayCalories = { date: ISODate; kcal: number; target: number | null };

/** Logged kcal per day vs that day's plan target. Days with no logs show 0. */
export function dailyCalories(
  logs: readonly FoodLogLike[],
  mealPlans: readonly MealPlanLike[],
  dates: readonly ISODate[],
): DayCalories[] {
  const kcal = new Map<string, number>();
  for (const l of logs) kcal.set(l.date, (kcal.get(l.date) ?? 0) + (l.kcal ?? 0));
  const target = new Map<string, number>();
  for (const p of mealPlans)
    if (p.kcalTarget != null && p.kcalTarget > 0) target.set(p.date, p.kcalTarget);
  return dates.map((date) => ({
    date,
    kcal: Math.round(kcal.get(date) ?? 0),
    target: target.get(date) ?? null,
  }));
}

/** Average kcal over days that have any log, and how many of those landed within ±10% of target. */
export function calorieSummary(days: readonly DayCalories[]): {
  avg: number | null;
  onTarget: number;
  logged: number;
} {
  const logged = days.filter((d) => d.kcal > 0);
  const onTarget = logged.filter(
    (d) => d.target != null && Math.abs(d.kcal - d.target) <= d.target * 0.1,
  ).length;
  return {
    avg: logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : null,
    onTarget,
    logged: logged.length,
  };
}
