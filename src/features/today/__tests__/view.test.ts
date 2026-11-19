import { buildTodayView, type SnapshotDay, type ViewSnapshot } from '../logic/view';

const emptyDay: SnapshotDay = { session: undefined, exercises: [], mealPlan: undefined, meals: [] };
const recipes: Record<string, { title: string; perServing: { kcal: number; protein: number; carbs: number; fat: number } }> = {
  oats: { title: 'Overnight oats', perServing: { kcal: 400, protein: 20, carbs: 60, fat: 10 } },
  karahi: { title: 'Chicken karahi', perServing: { kcal: 644, protein: 48, carbs: 65, fat: 21 } },
};
const lookups = {
  recipe: (id: string) => recipes[id],
  muscles: (id: string) => (id === 'bench' ? ['chest', 'triceps'] : ['chest']),
};

function snap(over: Partial<ViewSnapshot> = {}): ViewSnapshot {
  return {
    date: '2026-11-19',
    profile: { name: 'Sam', onboardedAt: 1, mealTimes: ['08:00', '13:00'] },
    hasTrainingPlan: true,
    today: emptyDay,
    tomorrow: emptyDay,
    logs: [],
    ...over,
  };
}

const trainingDay: SnapshotDay = {
  session: { id: 's1', title: 'Push day', status: 'planned' },
  exercises: [
    { exerciseId: 'bench', targetSets: 4, restS: 120 },
    { exerciseId: 'fly', targetSets: 3, restS: 60 },
  ],
  mealPlan: { id: 'mp', dayType: 'training', kcalTarget: 2000, macros: { protein: 150, carbs: 200, fat: 60 } },
  meals: [
    { id: 'm1', slot: 'breakfast', recipeId: 'oats', portion: 1, status: 'eaten' },
    { id: 'm2', slot: 'lunch', recipeId: 'karahi', portion: 1.5, status: 'planned' },
  ],
};

describe('buildTodayView', () => {
  it('not onboarded → onboarding empty state', () => {
    expect(buildTodayView(snap({ profile: undefined }), lookups, 600, 10).state).toBe('not_onboarded');
    expect(buildTodayView(snap({ profile: { name: null, onboardedAt: null, mealTimes: null } }), lookups, 600, 10).state).toBe(
      'not_onboarded',
    );
  });

  it('onboarded without any plan → no_plan', () => {
    expect(buildTodayView(snap({ hasTrainingPlan: false }), lookups, 600, 10).state).toBe('no_plan');
  });

  it('training plan but no session today → rest day', () => {
    const v = buildTodayView(snap(), lookups, 600, 10);
    expect(v.state).toBe('ready');
    expect(v.restDay).toBe(true);
    expect(v.workout).toBeNull();
    expect(v.brief[0]?.kind).toBe('rest');
  });

  it('training day: workout, meals with times, eaten from logs, targets from plan', () => {
    const v = buildTodayView(
      snap({
        today: trainingDay,
        logs: [
          { slot: 'breakfast', name: 'Overnight oats', kcal: 400, p: 20, c: 60, f: 10 },
          { slot: 'water', name: 'Water 250 ml', kcal: 0, p: null, c: null, f: null },
          { slot: 'water', name: 'Water 250 ml', kcal: 0, p: null, c: null, f: null },
        ],
      }),
      lookups,
      9 * 60,
      9,
    );
    expect(v.greeting).toBe('Good morning, Sam');
    expect(v.dateLabel).toBe('Thursday 19 November');
    expect(v.workout).toMatchObject({ sessionId: 's1', title: 'Push day', exercises: 2, muscles: ['Chest', 'Triceps'], done: false });
    expect(v.workout?.minutes).toBeGreaterThan(0);
    expect(v.meals.map((m) => [m.title, m.time, m.nutrients.kcal])).toEqual([
      ['Overnight oats', '08:00', 400],
      ['Chicken karahi', '13:00', 966],
    ]);
    expect(v.eaten).toEqual({ kcal: 400, p: 20, c: 60, f: 10 });
    expect(v.targets).toEqual({ kcal: 2000, p: 150, c: 200, f: 60 });
    expect(v.waterMl).toBe(500);
    expect(v.next?.id).toBe('m2');
    expect(v.brief.map((b) => b.kind)).toEqual(['workout', 'meal']);
    expect(v.evening).toBeNull();
  });

  it('evening shows progress and tomorrow', () => {
    const v = buildTodayView(
      snap({
        today: trainingDay,
        tomorrow: { ...emptyDay, session: { id: 's2', title: 'Pull day', status: 'planned' }, exercises: [{ exerciseId: 'row', targetSets: 3, restS: 90 }] },
      }),
      lookups,
      19 * 60,
      19,
    );
    expect(v.greeting).toBe('Good evening, Sam');
    expect(v.evening?.items.map((i) => i.id)).toEqual(['workout', 'meals', 'protein']);
    expect(v.evening?.tomorrow).toMatchObject({ title: 'Pull day', restDay: false });
  });

  it('a finished day shows the evening card early', () => {
    const done: SnapshotDay = {
      ...trainingDay,
      session: { id: 's1', title: 'Push day', status: 'done' },
      meals: trainingDay.meals.map((m) => ({ ...m, status: 'eaten' as const })),
    };
    const v = buildTodayView(snap({ today: done }), lookups, 14 * 60, 14);
    expect(v.evening?.headline).toBeDefined();
    expect(v.workout?.done).toBe(true);
  });

  it('unknown recipes fall back to the slot name with zero nutrients', () => {
    const v = buildTodayView(
      snap({ today: { ...emptyDay, mealPlan: trainingDay.mealPlan, meals: [{ id: 'x', slot: 'snack', recipeId: 'nope', portion: 1, status: 'planned' }] } }),
      lookups,
      600,
      10,
    );
    expect(v.meals[0]).toMatchObject({ title: 'Snack', nutrients: { kcal: 0, p: 0, c: 0, f: 0 } });
    expect(v.restDay).toBe(true);
  });
});
