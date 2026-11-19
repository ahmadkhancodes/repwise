import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { dayIntake } from '@/features/nutrition/logic/intake';
import { totalWaterMl } from '@/features/nutrition/logic/water';
import { logsForDate } from '@/features/nutrition/repo';
import { saveProfile } from '@/features/settings/repo';
import { setAnalyticsSink } from '@/services/analytics';
import { getCatalog } from '@/services/catalog';
import { kv } from '@/services/storage';

import { addDays, startOfWeek, todayISO, weekDates } from '../logic/dates';
import { mealPlanForDate, mealsForPlan } from '../repo';
import {
  addWater,
  applySwap,
  ensureWeekMeals,
  logOffPlan,
  markMealEaten,
  pastMealRows,
  plansByDate,
  replanFrom,
  setMealOpen,
  swapChoices,
  undoLog,
} from '../service';
import { addNeverShow, getGroceryChecked, getSignals, setGroceryChecked, addMoreLike } from '../signals';

const NOW = Date.UTC(2026, 10, 19, 12); // Thursday
const TODAY = todayISO(NOW);
const events: [string, Record<string, unknown>][] = [];

function onboard(extra: Record<string, unknown> = {}) {
  saveProfile({
    goal: 'fat_loss',
    sex: 'male',
    birthYear: 1990,
    heightCm: 178,
    weightKg: 82,
    experience: 'intermediate',
    days: 4,
    sessionMin: 60,
    dietType: 'omnivore',
    allergies: ['milk'],
    mealsPerDay: 3,
    cookMin: 45,
    ...extra,
  });
}

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  kv.remove('meals.signals.v1');
  events.length = 0;
  setAnalyticsSink((e, p) => events.push([e, p]));
});
afterAll(() => setAnalyticsSink(null));

describe('ensureWeekMeals (offline planner)', () => {
  it('needs a profile', () => {
    expect(ensureWeekMeals(TODAY, NOW)).toEqual({ status: 'no_profile' });
  });

  it('plans today → Sunday once, and is idempotent', () => {
    onboard();
    const res = ensureWeekMeals(TODAY, NOW);
    expect(res).toMatchObject({ status: 'ready', created: 4 }); // Thu, Fri, Sat, Sun
    const dates = weekDates(startOfWeek(TODAY));
    expect([...plansByDate(dates[0]!, addDays(dates[0]!, 7)).keys()]).toEqual(dates.slice(3));
    const plan = mealPlanForDate(TODAY)!;
    expect(plan.kcalTarget).toBeGreaterThan(1200);
    expect(plan.macros?.protein).toBeGreaterThan(0);
    const meals = mealsForPlan(plan.id);
    expect(meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(meals.every((m) => m.status === 'planned' && m.recipeId)).toBe(true);
    expect(events.find(([e]) => e === 'plan_generated')?.[1]).toMatchObject({ goal: 'fat_loss', diet_type: 'omnivore' });
    expect(ensureWeekMeals(TODAY, NOW)).toMatchObject({ status: 'ready', created: 0 });
  });

  it('next week avoids recipes from this week (no-repeat window)', () => {
    onboard();
    ensureWeekMeals(TODAY, NOW);
    const nextMon = addDays(startOfWeek(TODAY), 7);
    ensureWeekMeals(nextMon, NOW);
    const thisWeek = new Set(pastMealRows(startOfWeek(TODAY), nextMon).map((r) => r.recipeId));
    const next = pastMealRows(nextMon, addDays(nextMon, 7));
    expect(next.length).toBeGreaterThan(0);
    expect(next.filter((r) => thisWeek.has(r.recipeId))).toEqual([]);
  });
});

describe('profile changes', () => {
  it('a new allergy re-plans untouched days so no planned meal contains it', () => {
    onboard({ allergies: [] });
    ensureWeekMeals(TODAY, NOW);
    const planned = pastMealRows(TODAY, addDays(TODAY, 7));
    const cat = getCatalog();
    const withMilk = planned.filter((r) => cat.recipeById.get(r.recipeId!)!.allergens.includes('milk'));
    expect(withMilk.length).toBeGreaterThan(0);
    // Eat one meal today, so today is kept and its unsafe meals are skipped instead.
    const today = mealsForPlan(mealPlanForDate(TODAY)!.id);
    const safeToday = today.find((m) => !cat.recipeById.get(m.recipeId!)!.allergens.includes('milk'));
    if (safeToday) markMealEaten(safeToday.id, 1, NOW);
    saveProfile({ allergies: ['milk'] });
    ensureWeekMeals(TODAY, NOW + 10);
    for (const d of weekDates(startOfWeek(TODAY)).filter((x) => x >= TODAY)) {
      const plan = mealPlanForDate(d)!;
      for (const m of mealsForPlan(plan.id).filter((x) => x.status === 'planned')) {
        expect(cat.recipeById.get(m.recipeId!)!.allergens).not.toContain('milk');
      }
    }
  });
});

describe('meal actions', () => {
  beforeEach(() => {
    onboard();
    ensureWeekMeals(TODAY, NOW);
  });
  const todays = () => mealsForPlan(mealPlanForDate(TODAY)!.id);

  it('"Ate it" writes the intake log in the same tap; undo removes it', () => {
    const lunch = todays().find((m) => m.slot === 'lunch')!;
    expect(markMealEaten(lunch.id, 1, NOW)).toBe(true);
    const logs = logsForDate(TODAY);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ source: 'plan', slot: 'lunch' });
    expect(logs[0]!.kcal).toBeGreaterThan(0);
    expect(todays().find((m) => m.id === lunch.id)!.status).toBe('eaten');
    expect(events.find(([e]) => e === 'meal_logged')?.[1]).toMatchObject({ slot: 'lunch', from_plan: true });

    // Ticking twice never double-counts.
    markMealEaten(lunch.id, 0.5, NOW + 1);
    expect(logsForDate(TODAY)).toHaveLength(1);
    expect(logsForDate(TODAY)[0]!.kcal).toBeCloseTo(logs[0]!.kcal / 2, -1);

    setMealOpen(lunch.id, 'planned', NOW + 2);
    expect(logsForDate(TODAY)).toHaveLength(0);
    expect(todays().find((m) => m.id === lunch.id)!.status).toBe('planned');
  });

  it('swap: 3 alternatives, apply keeps the slot and remembers the old recipe', () => {
    const dinner = todays().find((m) => m.slot === 'dinner')!;
    const opts = swapChoices(dinner.id, NOW);
    expect(opts.length).toBeGreaterThan(0);
    const saved = applySwap(dinner.id, opts[0]!, NOW + 1)!;
    expect(saved).toMatchObject({ slot: 'dinner', recipeId: opts[0]!.recipeId, swappedFrom: dinner.recipeId, portion: opts[0]!.servings });
    expect(events.some(([e, p]) => e === 'meal_swapped' && p.slot === 'dinner')).toBe(true);
    expect(swapChoices('missing', NOW)).toEqual([]);
  });

  it('ate out: logs, skips the replaced meal and rebalances the rest of the day', () => {
    const [breakfast, lunch, dinner] = todays();
    const before = dinner!.portion;
    const res = logOffPlan(
      { date: TODAY, slot: 'lunch', name: 'Big meal out', kcal: 1100, p: 45, c: 110, f: 50, source: 'quick', replaceMealId: lunch!.id },
      NOW,
    );
    expect(res.log).toMatchObject({ source: 'quick', slot: 'lunch', kcal: 1100 });
    const after = todays();
    expect(after.find((m) => m.id === lunch!.id)!.status).toBe('skipped');
    expect(res.rebalanced).toBeGreaterThan(0);
    const dinnerAfter = after.find((m) => m.id === dinner!.id)!;
    const breakfastAfter = after.find((m) => m.id === breakfast!.id)!;
    expect(dinnerAfter.portion + breakfastAfter.portion).toBeLessThan(before + breakfast!.portion + 1e-9);
    expect(events.some(([e, p]) => e === 'meal_logged' && p.from_plan === false)).toBe(true);
  });

  it('water quick add and undo', () => {
    const row = addWater(TODAY, 250, NOW);
    addWater(TODAY, 500, NOW + 1);
    expect(totalWaterMl(logsForDate(TODAY))).toBe(750);
    expect(dayIntake(logsForDate(TODAY)).kcal).toBe(0);
    undoLog(row.id, NOW + 2);
    expect(totalWaterMl(logsForDate(TODAY))).toBe(500);
  });

  it('replanFrom keeps days with anything eaten and re-plans the rest', () => {
    const lunch = todays().find((m) => m.slot === 'lunch')!;
    markMealEaten(lunch.id, 1, NOW);
    const tomorrow = addDays(TODAY, 1);
    const oldTomorrow = mealPlanForDate(tomorrow)!.id;
    saveProfile({ goal: 'muscle_gain' });
    const res = replanFrom(TODAY, NOW + 10);
    expect(res).toMatchObject({ status: 'ready', created: 3 });
    expect(mealPlanForDate(TODAY)!.id).toBe(lunch.mealPlanId);
    expect(mealPlanForDate(tomorrow)!.id).not.toBe(oldTomorrow);
  });
});

describe('signals', () => {
  it('more-like-this and never-show are exclusive', () => {
    addMoreLike('a');
    addNeverShow('b');
    addNeverShow('a');
    expect(getSignals()).toEqual({ neverShow: ['b', 'a'], moreLike: [] });
    addMoreLike('b');
    expect(getSignals()).toEqual({ neverShow: ['a'], moreLike: ['b'] });
  });
  it('grocery ticks per week', () => {
    setGroceryChecked('2026-11-16', ['x', 'y']);
    expect(getGroceryChecked('2026-11-16')).toEqual(['x', 'y']);
    expect(getGroceryChecked('2026-11-23')).toEqual([]);
  });
});
