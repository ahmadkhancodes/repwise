import { and, desc, eq } from 'drizzle-orm';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { plans } from '@/db/schema';
import { saveCheckin } from '@/features/assistant/repo';
import { mealPlanForDate } from '@/features/meals/repo';
import { saveProfile } from '@/features/settings/repo';
import { getPlanner, resetPlannerForTests } from '@/features/today/plannerBridge';

import { createPlannerBridge, registerPlannerBridge } from '../bridge';
import { addDays, startOfWeek } from '../engine';
import { localToday } from '../planService';
import { plansRepo } from '../repo';
import type { TrainingPayload } from '../logic/planRows';

// Thursday 19 Nov 2026, 09:00 local; next week starts Monday 23 Nov.
const NOW = new Date(2026, 10, 19, 9, 0, 0).getTime();
const NEXT = addDays(startOfWeek(localToday(NOW)), 7);
const clock = () => NOW;

function profile() {
  saveProfile({
    goal: 'muscle_gain',
    sex: 'male',
    birthYear: 1995,
    heightCm: 180,
    weightKg: 78,
    targetKg: 82,
    experience: 'intermediate',
    days: 3,
    sessionMin: 60,
    equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pullup_bar', 'bodyweight', 'squat_rack'],
    injuries: [],
    dietType: 'omnivore',
    allergies: [],
    dislikes: [],
    cuisines: [],
    budget: '2',
    cookMin: 30,
    mealsPerDay: 3,
    units: 'metric',
    activityLevel: 'light',
  });
}

function latestTraining(weekStart: string): TrainingPayload {
  const row = plansRepo.first(
    and(eq(plans.type, 'training'), eq(plans.weekStart, weekStart)),
    desc(plans.version),
  );
  return row?.payload as TrainingPayload;
}

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  resetPlannerForTests();
  profile();
});

describe('planner bridge (Today / check-in → planner service)', () => {
  it('registers both hooks at start-up', () => {
    expect(getPlanner().regenerateWeek).toBeUndefined();
    registerPlannerBridge();
    expect(typeof getPlanner().regenerateWeek).toBe('function');
    expect(typeof getPlanner().requestDeload).toBe('function');
  });

  it('regenerateWeek applies the check-in kcal delta through the engine', async () => {
    const bridge = createPlannerBridge(clock);
    await bridge.regenerateWeek({ weekStart: NEXT, adjustmentKcal: 0, volume: 'progress' });
    const before = mealPlanForDate(NEXT)!.kcalTarget!;
    await bridge.regenerateWeek({ weekStart: NEXT, adjustmentKcal: -200, volume: 'progress' });
    const after = mealPlanForDate(NEXT)!.kcalTarget!;
    // The engine owns the maths (day-type split etc.); the app only checks the direction.
    expect(after).toBeLessThan(before);
    expect(latestTraining(NEXT).deload).toBe(false);
  });

  it("volume 'deload' plans a deload week", async () => {
    await createPlannerBridge(clock).regenerateWeek({ weekStart: NEXT, adjustmentKcal: 0, volume: 'deload' });
    const p = latestTraining(NEXT);
    expect(p.deload).toBe(true);
    expect(p.deloadReason).toBe('requested');
  });

  it('requestDeload rebuilds next week as a deload and keeps a pending check-in delta', async () => {
    const bridge = createPlannerBridge(clock);
    await bridge.regenerateWeek({ weekStart: NEXT, adjustmentKcal: 0, volume: 'progress' });
    const base = mealPlanForDate(NEXT)!.kcalTarget!;
    saveCheckin(localToday(NOW), {
      energy: 'ok',
      sleep: 'ok',
      weighedIn: false,
      deltaKcal: -150,
      newKcal: base - 150,
      volume: 'progress',
      appliesFrom: NEXT,
      applied: true,
    });
    await bridge.requestDeload();
    expect(latestTraining(NEXT).deload).toBe(true);
    expect(mealPlanForDate(NEXT)!.kcalTarget!).toBeLessThan(base);
  });
});
