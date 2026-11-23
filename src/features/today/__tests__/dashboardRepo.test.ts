import { dailyStepsRepo, loadDashboard, saveDailySteps, stepsForDate } from '../dashboardRepo';
import { EXERCISE, freshDb, seedDoneLift, seedWeight } from '../testing/seed';

beforeEach(async () => {
  await freshDb();
});

describe('dashboard repo', () => {
  it('daily steps: one row per date, rewritten only when the total changes', () => {
    saveDailySteps('2026-11-19', 1200, 'coremotion', 1000);
    saveDailySteps('2026-11-19', 1200, 'coremotion', 2000);
    expect(dailyStepsRepo.list()).toHaveLength(1);
    expect(stepsForDate('2026-11-19')?.updatedAt).toBe(1000);
    saveDailySteps('2026-11-19', 3400.6, 'coremotion', 3000);
    expect(dailyStepsRepo.list()).toHaveLength(1);
    expect(stepsForDate('2026-11-19')).toMatchObject({ steps: 3401, source: 'coremotion', dirty: 1 });
    saveDailySteps('2026-11-20', -5, 'pedometer', 4000);
    expect(stepsForDate('2026-11-20')?.steps).toBe(0);
  });

  it('loads the week sets, the weight window, done dates and today’s steps', () => {
    seedDoneLift('2026-11-17', EXERCISE.squat, 100, 5);
    seedDoneLift('2026-11-10', EXERCISE.squat, 100, 5); // last week
    seedWeight('2026-11-01', 82);
    seedWeight('2026-11-19', 81);
    seedWeight('2026-09-01', 90); // outside the window
    saveDailySteps('2026-11-19', 5000, 'health_connect');
    const d = loadDashboard('2026-11-19', '2026-11-16', '2026-11-22', '2026-10-20');
    expect(d.weekSets.every((s) => s.sessionDate === '2026-11-17')).toBe(true);
    expect(d.weekSets.length).toBeGreaterThan(0);
    expect(d.weights.map((w) => w.date)).toEqual(['2026-11-01', '2026-11-19']);
    expect(d.doneDates).toEqual(expect.arrayContaining(['2026-11-17', '2026-11-10']));
    expect(d.steps).toBe(5000);
  });

  it('no steps stored → null (the tile never shows a fake number)', () => {
    expect(loadDashboard('2026-11-19', '2026-11-16', '2026-11-22', '2026-10-20').steps).toBeNull();
  });
});
