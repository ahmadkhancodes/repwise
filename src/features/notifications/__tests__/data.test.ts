import { freshDb, onboard } from '@/features/meals/__tests__/helpers';
import { todayISO } from '@/features/meals/logic/dates';
import { mealPlanForDate, mealsForPlan } from '@/features/meals/repo';
import { ensureWeekMeals } from '@/features/meals/service';
import { WIDGET_LINKS } from '@/widgets/snapshot';

import { loadSnapshot } from '../data';
import { DEFAULT_PREFS } from '../logic/prefs';

beforeEach(async () => {
  await freshDb();
});

describe('loadSnapshot (widgets)', () => {
  it('carries the next meal id so "Ate it" deep-links to a tick (R2-1)', () => {
    onboard();
    const today = todayISO();
    ensureWeekMeals(today);
    const ids = mealsForPlan(mealPlanForDate(today)!.id).map((m) => m.id);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const morning = new Date();
    morning.setHours(7, 0, 0, 0); // before breakfast, whatever time the suite runs
    const snap = loadSnapshot(morning.getTime(), tz, DEFAULT_PREFS, true);
    expect(snap.nextMeal).not.toBeNull();
    expect(ids).toContain(snap.nextMeal!.id);
    expect(WIDGET_LINKS.tickMeal(snap.nextMeal!.id)).toBe(
      `repwise://eat?mealId=${encodeURIComponent(snap.nextMeal!.id!)}&tick=1`,
    );
  });
});
