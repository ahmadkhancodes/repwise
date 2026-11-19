import {
  FULL_GYM,
  GOALS,
  SEXES,
  addDays,
  appendPlanToHistory,
  dietOk,
  exercisePatternKey,
  planDay,
  planWeek,
  planWeekWithVariety,
  sessionFingerprint,
  swapExercise,
  swapMeal,
  weekdayMon0,
  type HistoryInput,
  type ProfileInput,
  type WeekPlan,
} from '../src';
import { allProfiles, catalogues, cutFemale, gymMale, NOW, pplAdvanced, veganHome, vegetarianGluten, WEEK } from './fixtures/profiles';

const exById = new Map(catalogues.exercises.map((e) => [e.id, e]));
const recipeById = new Map(catalogues.recipes.map((r) => [r.id, r]));
const DAY = 86_400_000;

/** Plan `weeks` consecutive weeks, feeding each plan back into history. */
function simulate(profile: ProfileInput, weeks: number, history: HistoryInput = {}, extra: Partial<Parameters<typeof planWeek>[3]> = {}) {
  const plans: WeekPlan[] = [];
  let h = history;
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(WEEK, 7 * w);
    const plan = planWeek(profile, h, catalogues, { now: NOW + w * 7 * DAY, weekStart, ...extra });
    plans.push(plan);
    h = appendPlanToHistory(h, plan);
  }
  return { plans, history: h };
}

describe('planWeek: basics', () => {
  test.each(Object.entries(allProfiles))('%s → a valid week', (_name, profile) => {
    const plan = planWeek(profile, {}, catalogues, { now: NOW, weekStart: WEEK });
    expect(plan.validation).toEqual({ ok: true, errors: [] });
    expect(plan.dates).toHaveLength(7);
    expect(plan.days).toHaveLength(7);
    expect(plan.sessions).toHaveLength(ProfileSchemaDays(profile));
    expect(plan.generatedBy).toBe('rules');
    for (const s of plan.sessions) {
      expect(plan.trainingDates).toContain(s.date);
      expect(s.fingerprint).toBe(sessionFingerprint(s.items.map((i) => i.exerciseId)));
      expect(s.items.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('deterministic for the same seed; varies with the seed', () => {
    const a = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK, seed: 's1' });
    const b = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK, seed: 's1' });
    const c = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK, seed: 's2' });
    expect(b).toEqual(a);
    expect(JSON.stringify(c.sessions)).not.toEqual(JSON.stringify(a.sessions));
    expect(JSON.stringify(c.days)).not.toEqual(JSON.stringify(a.days));
    // default seed is derived from profile + week, so it is stable too
    expect(planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK })).toEqual(planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK }));
  });

  test('re-planning a week ignores that week’s own history (same result)', () => {
    const first = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const again = planWeek(gymMale, { ...appendPlanToHistory({}, first), block: undefined }, catalogues, { now: NOW, weekStart: WEEK });
    expect(again.sessions).toEqual(first.sessions);
    expect(again.days).toEqual(first.days);
  });

  test.each(['2026-03-11', '2026-03-29', '2026-10-25', '2026-11-04'])('DST-safe week containing %s', (date) => {
    const plan = planWeek(cutFemale, {}, catalogues, { now: NOW, weekStart: date });
    expect(weekdayMon0(plan.weekStart)).toBe(0);
    plan.dates.forEach((d, i) => expect(d).toBe(addDays(plan.weekStart, i)));
    expect(plan.trainingDates.map(weekdayMon0)).toEqual([0, 2, 4]);
    expect(plan.validation.ok).toBe(true);
  });

  test('preferred training weekdays are used', () => {
    const plan = planWeek({ ...cutFemale, trainingWeekdays: [1, 3, 6] }, {}, catalogues, { now: NOW, weekStart: WEEK });
    expect(plan.sessions.map((s) => s.weekday)).toEqual([1, 3, 6]);
    expect(plan.days.filter((d) => d.dayType === 'training').map((d) => weekdayMon0(d.date))).toEqual([1, 3, 6]);
  });
});

function ProfileSchemaDays(p: ProfileInput): number {
  return p.daysPerWeek;
}

describe('acceptance: 60-session uniqueness (RW-11)', () => {
  test.each([
    ['6-day PPL', pplAdvanced, 10],
    ['4-day upper/lower', gymMale, 15],
    ['3-day full body', cutFemale, 20],
    ['3-day home, knee injury', veganHome, 20],
  ] as const)('%s: no repeated fingerprint in a rolling 10, no consecutive variant repeats', (_n, profile, weeks) => {
    const { plans } = simulate(profile, weeks);
    const sessions = plans.flatMap((p) => p.sessions);
    expect(sessions.length).toBeGreaterThanOrEqual(60);
    plans.forEach((p) => expect(p.validation.errors).toEqual([]));
    const fps = sessions.map((s) => s.fingerprint);
    fps.forEach((fp, i) => expect(fps.slice(Math.max(0, i - 10), i)).not.toContain(fp));
    // independent consecutive-variant check
    const last = new Map<string, Set<string>>();
    for (const s of sessions) {
      const local = new Map<string, Set<string>>();
      for (const it of s.items) {
        if (it.role === 'main') continue;
        const key = exercisePatternKey(exById.get(it.exerciseId)!);
        expect(last.get(key)?.has(it.exerciseId) ?? false).toBe(false);
        if (!local.has(key)) local.set(key, new Set());
        local.get(key)!.add(it.exerciseId);
      }
      for (const [k, v] of local) last.set(k, v);
    }
  });
});

describe('acceptance: 100 generated days pass macro + allergen checks (RW-31)', () => {
  const profiles = Object.entries(allProfiles);
  const days = profiles.flatMap(([name, profile]) => simulate(profile, 3).plans.flatMap((p) => p.days.map((d) => ({ name, profile, plan: p, day: d }))));

  test('at least 100 days generated', () => {
    expect(days.length).toBeGreaterThanOrEqual(100);
  });

  test.each(days.map((d, i) => [i, d.name, d.day.date, d] as const))('#%i %s %s', (_i, _n, _d, { profile, plan, day }) => {
    const target = day.dayType === 'training' ? plan.nutrition.training : plan.nutrition.rest;
    let kcal = 0;
    let protein = 0;
    const sources: string[] = [];
    for (const m of day.meals) {
      const r = recipeById.get(m.recipeId)!;
      expect(r).toBeDefined();
      kcal += r.perServing.kcal * m.servings;
      protein += r.perServing.protein * m.servings;
      for (const a of profile.allergies ?? []) expect(r.allergens).not.toContain(a);
      expect(dietOk(r, profile.dietType ?? 'omnivore')).toBe(true);
      expect(r.slots).toContain(m.slot);
      if (r.proteinSource !== 'none') sources.push(r.proteinSource);
    }
    expect(Math.abs(kcal - target.kcal)).toBeLessThanOrEqual(target.kcal * 0.05 + 0.5);
    expect(Math.abs(protein - target.protein)).toBeLessThanOrEqual(10.05);
    expect(new Set(sources).size).toBe(sources.length);
  });

  test('no recipe repeats inside the no-repeat window (per profile)', () => {
    for (const [, profile] of profiles) {
      const { plans } = simulate(profile, 3);
      const window = Math.min(...plans.map((p) => p.noRepeatDays));
      const seen = new Map<string, string>();
      for (const d of plans.flatMap((p) => p.days)) for (const m of d.meals) {
        const prev = seen.get(m.recipeId);
        if (prev) expect((Date.parse(d.date) - Date.parse(prev)) / DAY).toBeGreaterThanOrEqual(window);
        seen.set(m.recipeId, d.date);
      }
    }
  });

  test('grocery-aware: ingredients are re-used across meals in a week', () => {
    const plan = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const count = new Map<string, number>();
    for (const d of plan.days) for (const m of d.meals) for (const ing of recipeById.get(m.recipeId)!.ingredients) count.set(ing.id, (count.get(ing.id) ?? 0) + 1);
    expect([...count.values()].filter((n) => n >= 2).length).toBeGreaterThanOrEqual(5);
  });
});

describe('blocks, deloads and progression', () => {
  test('main lifts held for the block; last week is a deload; new block rotates mains', () => {
    const { plans } = simulate(gymMale, 6); // intermediate: 5-week blocks
    const mains = plans.map((p) => JSON.stringify(p.block.mainLifts));
    expect(new Set(mains.slice(0, 5)).size).toBe(1);
    expect(plans.map((p) => p.weekInBlock)).toEqual([0, 1, 2, 3, 4, 0]);
    expect(plans.map((p) => p.deload)).toEqual([false, false, false, false, true, false]);
    expect(plans[4]!.deloadReason).toBe('block_end');
    expect(plans[5]!.block.blockNo).toBe(2);
    expect(mains[5]).not.toEqual(mains[0]);
    const sets = (p: WeekPlan) => p.sessions.reduce((a, s) => a + s.items.reduce((b, i) => b + i.sets, 0), 0);
    expect(sets(plans[4]!)).toBeLessThan(sets(plans[3]!) * 0.75);
    plans[4]!.sessions.forEach((s) => s.items.forEach((i) => expect(i.rpe).toBe(6)));
    // main lifts appear with role main in their sessions
    const mainIds = new Set(Object.values(plans[0]!.block.mainLifts));
    plans[0]!.sessions.forEach((s) => expect(s.items.some((i) => i.role === 'main' && mainIds.has(i.exerciseId))).toBe(true));
  });

  test('double progression from logged sets raises the load', () => {
    const first = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const main = first.sessions[0]!.items[0]!;
    expect(main.loadKg).toBeNull(); // calibrate on first session
    const [, hi] = main.repRange;
    const doneAt = NOW + 2 * DAY;
    const sets = [0, 1, 2].map(() => ({ exerciseId: main.exerciseId, doneAt, type: 'working' as const, weightKg: 60, reps: hi }));
    const history = { ...appendPlanToHistory({}, first), sets };
    const next = planWeek(gymMale, history, catalogues, { now: NOW + 7 * DAY, weekStart: addDays(WEEK, 7) });
    const again = next.sessions.flatMap((s) => s.items).find((i) => i.exerciseId === main.exerciseId)!;
    expect(again.loadKg).toBeGreaterThan(60);
    expect(again.targetReps).toBe(again.repRange[0]);
  });

  test('a requested deload (check-in / assistant) cuts volume and stays valid', () => {
    const normal = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const light = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK, deload: true });
    expect(normal.deload).toBe(false);
    expect(light.deload).toBe(true);
    expect(light.deloadReason).toBe('requested');
    const sets = (p: WeekPlan) => p.sessions.reduce((a, s) => a + s.items.reduce((b, i) => b + i.sets, 0), 0);
    expect(sets(light)).toBeLessThan(sets(normal));
    expect(light.validation.ok).toBe(true);
  });

  test('two stalled sessions on a main lift trigger a deload', () => {
    const first = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const mainId = Object.values(first.block.mainLifts)[0]!;
    const sets = [0, 1, 2].flatMap((d) => [0, 1].map(() => ({ exerciseId: mainId, doneAt: NOW + d * 2 * DAY, type: 'working' as const, weightKg: 80, reps: 5 })));
    const next = planWeek(gymMale, { ...appendPlanToHistory({}, first), sets }, catalogues, { now: NOW + 7 * DAY, weekStart: addDays(WEEK, 7) });
    expect(next.deload).toBe(true);
    expect(next.deloadReason).toBe('stall');
    expect(next.validation.ok).toBe(true);
  });

  test('recovery heatmap picks the freshest first session when there is no rotation history', () => {
    const legs = catalogues.exercises.filter((e) => e.pattern === 'squat').slice(0, 3);
    const sets = legs.flatMap((e) => Array.from({ length: 4 }, () => ({ exerciseId: e.id, doneAt: NOW - 12 * 3_600_000, type: 'working' as const, weightKg: 100, reps: 8 })));
    const plan = planWeek(pplAdvanced, { sets }, catalogues, { now: NOW, weekStart: WEEK });
    expect(plan.sessions[0]!.templateKey).not.toBe('legs');
  });
});

describe('profiles, signals and safety', () => {
  const grid: [string, ProfileInput][] = [];
  for (const goal of GOALS) for (const sex of SEXES) for (const days of [2, 3, 4, 5, 6]) for (const sessionMin of [20, 180]) {
    grid.push([`${goal}/${sex}/${days}d/${sessionMin}min`, { goal, sex, birthYear: 1990, heightCm: sex === 'male' ? 178 : 163, weightKg: sex === 'male' ? 82 : 64, experience: 'intermediate', daysPerWeek: days, sessionMin, equipment: FULL_GYM }]);
  }
  test.each(grid)('%s → valid', (_n, profile) => {
    const plan = planWeek(profile, {}, catalogues, { now: NOW, weekStart: WEEK });
    expect(plan.validation.errors).toEqual([]);
  });

  test.each([
    ['min age (16) and small body', { birthYear: 2010, sex: 'female' as const, weightKg: 45, heightCm: 150 }],
    ['max age/weight (fat loss)', { birthYear: 1926, weightKg: 300, heightCm: 230, goal: 'fat_loss' as const }],
    ['imperial', { units: 'imperial' as const }],
  ])('edge profile %s → valid', (_n, over) => {
    const plan = planWeek({ ...gymMale, ...over }, {}, catalogues, { now: NOW, weekStart: WEEK });
    expect(plan.validation.errors).toEqual([]);
  });

  test('under-16 → general maintain plan with a safety warning', () => {
    const plan = planWeek({ ...cutFemale, birthYear: 2012 }, {}, catalogues, { now: NOW, weekStart: WEEK });
    expect(plan.nutrition.goal).toBe('maintain');
    expect(plan.nutrition.consultProfessional).toBe(true);
    expect(plan.warnings.map((w) => w.code)).toContain('safety_general_plan');
  });

  test('never-show items never appear; more-like-this items appear more', () => {
    const base = simulate(gymMale, 4).plans;
    const counts = new Map<string, number>();
    base.forEach((p) => p.days.forEach((d) => d.meals.forEach((m) => counts.set(m.recipeId, (counts.get(m.recipeId) ?? 0) + 1))));
    const exCounts = new Map<string, number>();
    base.forEach((p) => p.sessions.forEach((s) => s.items.forEach((i) => exCounts.set(i.exerciseId, (exCounts.get(i.exerciseId) ?? 0) + 1))));
    const hated = [...counts.keys()].slice(0, 5);
    const hatedEx = [...exCounts.keys()].filter((id) => !Object.values(base[0]!.block.mainLifts).includes(id)).slice(0, 3);
    const liked = catalogues.recipes.filter((r) => r.slots.includes('dinner') && r.cuisine === 'thai').map((r) => r.id);
    const signals = { neverShow: [...hated, ...hatedEx], moreLike: liked };
    const plans = simulate(gymMale, 4, { signals }).plans;
    for (const p of plans) {
      expect(p.validation.ok).toBe(true);
      p.days.forEach((d) => d.meals.forEach((m) => expect(hated).not.toContain(m.recipeId)));
      p.sessions.forEach((s) => s.items.forEach((i) => expect(hatedEx).not.toContain(i.exerciseId)));
    }
    const thai = (ps: WeekPlan[]) => ps.flatMap((p) => p.days.flatMap((d) => d.meals)).filter((m) => recipeById.get(m.recipeId)!.cuisine === 'thai').length;
    expect(thai(plans)).toBeGreaterThan(thai(base));
  });

  test('weekly check-in adjustment flows into targets', () => {
    const a = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const b = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK, adjustmentKcal: -150 });
    expect(b.nutrition.base.kcal).toBe(a.nutrition.base.kcal - 150);
    expect(b.validation.ok).toBe(true);
  });

  test('long no-repeat window on a small pool relaxes with a warning but stays valid', () => {
    const { plans } = simulate(vegetarianGluten, 3, {}, { noRepeatDays: 30 });
    plans.forEach((p) => expect(p.validation.ok).toBe(true));
    expect(plans.some((p) => p.warnings.some((w) => w.code === 'repeat_window_relaxed'))).toBe(true);
  });
});

describe('planDay + swaps', () => {
  test('planDay matches the week plan', () => {
    const date = addDays(WEEK, 2);
    const d = planDay(cutFemale, {}, catalogues, { now: NOW, date });
    expect(d.meals).toEqual(d.plan.days[2]);
    expect(d.session).toEqual(d.plan.sessions.find((s) => s.date === date));
    expect(planDay(cutFemale, {}, catalogues, { now: NOW, date: addDays(WEEK, 1) }).session).toBeNull();
  });

  test('swapExercise: 3 alternatives in a full gym, deterministic', () => {
    const plan = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const s = plan.sessions[0]!;
    s.items.forEach((it, idx) => {
      const args = { profile: gymMale, history: {}, catalogues, session: s, index: idx, now: NOW };
      const alts = swapExercise(args);
      expect(alts).toHaveLength(3);
      expect(swapExercise(args)).toEqual(alts);
      const cur = exById.get(it.exerciseId)!;
      alts.forEach((id) => expect(exById.get(id)!.pattern).toBe(cur.pattern));
    });
  });

  test('swapExercise: same pattern, safe for home + knee injury, not in session', () => {
    const plan = planWeek(veganHome, {}, catalogues, { now: NOW, weekStart: WEEK });
    const s = plan.sessions[0]!;
    const idx = s.items.findIndex((i) => i.role !== 'main' && exById.get(i.exerciseId)!.pattern === 'isolation');
    const args = { profile: veganHome, history: {}, catalogues, session: s, index: idx, now: NOW };
    const alts = swapExercise(args);
    expect(alts.length).toBeGreaterThanOrEqual(1);
    const cur = exById.get(s.items[idx]!.exerciseId)!;
    for (const id of alts) {
      const e = exById.get(id)!;
      expect(e.pattern).toBe(cur.pattern);
      expect(s.items.map((i) => i.exerciseId)).not.toContain(id);
      expect(e.equipment.every((x) => ['bodyweight', 'band', 'dumbbell'].includes(x))).toBe(true);
      expect(e.contraindications).not.toContain('knee');
    }
    expect(() => swapExercise({ ...args, index: 99 })).toThrow(RangeError);
  });

  test('swapMeal: alternatives within ±10% kcal/protein, safe, not already in the day', () => {
    const plan = planWeek(cutFemale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const day = plan.days[0]!;
    const idx = day.meals.findIndex((m) => m.slot === 'dinner');
    const meal = day.meals[idx]!;
    const alts = swapMeal({ profile: cutFemale, history: {}, catalogues, day, index: idx, now: NOW });
    expect(alts.length).toBeGreaterThanOrEqual(1);
    expect(alts.length).toBeLessThanOrEqual(3);
    for (const a of alts) {
      const r = recipeById.get(a.recipeId)!;
      expect(Math.abs(a.kcal - meal.kcal)).toBeLessThanOrEqual(meal.kcal * 0.1);
      expect(Math.abs(a.protein - meal.protein)).toBeLessThanOrEqual(Math.max(meal.protein * 0.1, 3));
      expect(r.allergens).not.toContain('nuts');
      expect(r.allergens).not.toContain('shellfish');
      expect(r.dietTags).toContain('halal');
      expect(day.meals.map((m) => m.recipeId)).not.toContain(a.recipeId);
      expect(a.servings).toBeGreaterThanOrEqual(r.scalable.min);
    }
  });
});

describe('LLM variety hook (optional; output must pass validate)', () => {
  const rules = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
  const asWorkoutOutput = (p: WeekPlan) => ({
    sessions: p.sessions.map((s) => ({ day: s.date, title: `Fresh ${s.templateKey}`, items: s.items.map((i) => ({ exercise_id: i.exerciseId, sets: i.sets, reps: i.targetReps, rest_s: i.restS })) })),
  });
  const asMealsOutput = (p: WeekPlan) => ({ days: p.days.map((d) => ({ date: d.date, meals: d.meals.map((m) => ({ slot: m.slot, recipe_id: m.recipeId })) })) });

  test('no hook → rules plan', async () => {
    const p = await planWeekWithVariety(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    expect(p).toEqual(rules);
  });

  test('valid output is accepted', async () => {
    const seen: unknown[] = [];
    const p = await planWeekWithVariety(gymMale, {}, catalogues, {
      now: NOW,
      weekStart: WEEK,
      hook: {
        planWorkouts: async (input) => {
          seen.push(input);
          return asWorkoutOutput(rules);
        },
        planMeals: async (input) => {
          seen.push(input);
          return asMealsOutput(rules);
        },
      },
    });
    expect(p.generatedBy).toBe('llm');
    expect(p.validation.ok).toBe(true);
    expect(p.sessions[0]!.title).toMatch(/^Fresh /);
    expect(seen).toHaveLength(2);
    expect(JSON.stringify(seen)).not.toMatch(/email|name"/);
  });

  test.each([
    ['garbage', async () => ({ nope: true })],
    ['throws', async () => { throw new Error('timeout'); }],
    ['unknown id', async () => ({ sessions: [{ day: WEEK, title: 'x', items: [{ exercise_id: 'made_up', sets: 3, reps: 8, rest_s: 90 }] }] })],
    ['missing sessions', async () => ({ sessions: asWorkoutOutput(rules).sessions.slice(1) })],
    ['equipment not available', async () => {
      const out = asWorkoutOutput(rules);
      out.sessions[0]!.items[0]!.exercise_id = 'rower';
      return out;
    }],
  ])('invalid workouts (%s) → rules fallback', async (_n, planWorkouts) => {
    const p = await planWeekWithVariety(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK, hook: { planWorkouts } });
    expect(p.generatedBy).toBe('rules');
    expect(p.sessions).toEqual(rules.sessions);
    expect(p.validation.ok).toBe(true);
    expect(p.warnings.some((w) => w.code === 'llm_rejected' || w.code === 'llm_error')).toBe(true);
  });

  test('meals with an allergen are rejected', async () => {
    const out = asMealsOutput(rules);
    const nutty = catalogues.recipes.find((r) => r.allergens.includes('peanut') && r.slots.includes('snack'))!;
    const profile = { ...gymMale, allergies: ['peanut' as const] };
    const base = planWeek(profile, {}, catalogues, { now: NOW, weekStart: WEEK });
    const o = asMealsOutput(base);
    o.days[0]!.meals[o.days[0]!.meals.length - 1] = { slot: 'snack', recipe_id: nutty.id };
    const p = await planWeekWithVariety(profile, {}, catalogues, { now: NOW, weekStart: WEEK, hook: { planMeals: async () => o } });
    expect(p.generatedBy).toBe('rules');
    expect(p.days).toEqual(base.days);
    expect(out.days).toHaveLength(7);
  });
});
