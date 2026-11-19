import {
  activeDates,
  cardsForDate,
  currentKcalTarget,
  deloadRequested,
  dismissCard,
  lastCheckin,
  latestCheckin,
  liftHistory,
  loadRuleContext,
  markCardApplied,
  materializeCards,
  rescheduleSession,
  saveCheckin,
  saveWeighIn,
  setDeloadRequested,
  skipSession,
  snoozeCard,
  weekActivity,
  weightsSince,
} from '@/features/assistant/repo';
import { evaluateRules } from '@/features/assistant/logic/rules';
import { addWater, setMealOpen, undoLog } from '@/features/meals';
import { mealsRepo } from '@/features/meals/repo';
import { foodLogsRepo } from '@/features/nutrition/repo';
import { sessionsRepo } from '@/features/workout/repo';

import { loadTodaySnapshot } from '../repo';
import {
  EXERCISE,
  freshDb,
  seedDoneLift,
  seedMealDay,
  seedProfile,
  seedSession,
  seedTrainingPlan,
  seedWeight,
} from '../testing/seed';

const TODAY = '2026-11-19';

beforeEach(async () => {
  await freshDb();
  setDeloadRequested(null);
});

describe('today snapshot + core writes', () => {
  it('loads today and tomorrow from SQLite', () => {
    seedProfile();
    seedTrainingPlan();
    const s = seedSession(TODAY);
    seedMealDay(TODAY);
    seedSession('2026-11-20', { title: 'Upper' });
    const snap = loadTodaySnapshot(TODAY, '2026-11-20');
    expect(snap.profile?.name).toBe('Sam');
    expect(snap.hasTrainingPlan).toBe(true);
    expect(snap.today.session?.id).toBe(s.id);
    expect(snap.today.exercises).toHaveLength(2);
    expect(snap.today.meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch']);
    expect(snap.tomorrow.session?.title).toBe('Upper');
    expect(snap.tomorrow.meals).toEqual([]);
  });

  it('reflects meals-domain writes (water quick-add + undo, skip)', () => {
    const { meals } = seedMealDay(TODAY);
    const row = addWater(TODAY, 250);
    expect(loadTodaySnapshot(TODAY, '2026-11-20').logs.map((l) => [l.slot, l.name])).toEqual([['water', 'Water 250 ml']]);
    undoLog(row.id);
    expect(loadTodaySnapshot(TODAY, '2026-11-20').logs).toEqual([]);
    setMealOpen(meals[1]!.id, 'skipped');
    expect(loadTodaySnapshot(TODAY, '2026-11-20').today.meals.map((m) => m.status)).toEqual(['planned', 'skipped']);
  });
});

describe('assistant repo', () => {
  it('rule context: sessions window, active dates and lifts', () => {
    seedProfile();
    seedSession('2026-11-17');
    seedSession('2026-11-01'); // outside the 14-day window
    seedDoneLift('2026-11-18', EXERCISE.squat, 100);
    foodLogsRepo.insert({ date: TODAY, source: 'quick', name: 'Water 250 ml', slot: 'water', kcal: 0 });
    foodLogsRepo.insert({ date: '2026-11-17', source: 'quick', name: 'Bar', kcal: 200 });
    const ctx = loadRuleContext({ today: TODAY, hour: 10, onboardedAt: 1, onboardedDate: '2026-11-01', protein: null });
    expect(ctx.daysSinceOnboarding).toBe(18);
    expect(ctx.sessions.map((s) => s.date)).toEqual(['2026-11-17', '2026-11-18']);
    expect(ctx.activeDates).toEqual(['2026-11-17', '2026-11-18']); // water does not count
    expect(evaluateRules(ctx).map((c) => c.ruleId)).toContain('missed_workout');
  });

  it('lift history: best e1RM per finished session, oldest first, 3+ sessions', () => {
    seedDoneLift('2026-11-10', EXERCISE.squat, 100);
    seedDoneLift('2026-11-13', EXERCISE.squat, 100);
    seedDoneLift('2026-11-17', EXERCISE.squat, 97.5);
    seedDoneLift('2026-11-17', EXERCISE.front, 60);
    const lifts = liftHistory(TODAY);
    expect(lifts).toHaveLength(1);
    expect(lifts[0]!.exerciseId).toBe(EXERCISE.squat);
    expect(lifts[0]!.bestE1rmBySession.map((x) => Math.round(x))).toEqual([117, 117, 114]);
  });

  it('active dates include finished workouts and meals, not water', () => {
    seedSession('2026-11-15', { status: 'done' });
    foodLogsRepo.insert({ date: '2026-11-16', source: 'plan', name: 'Oats', slot: 'breakfast', kcal: 400 });
    foodLogsRepo.insert({ date: '2026-11-17', source: 'quick', name: 'Water 250 ml', slot: 'water', kcal: 0 });
    expect(activeDates(TODAY)).toEqual(['2026-11-15', '2026-11-16']);
  });

  it('materializes card rows once; free users one a day', () => {
    seedSession('2026-11-17');
    const ctx = loadRuleContext({
      today: TODAY,
      hour: 19,
      onboardedAt: 1,
      onboardedDate: '2026-11-01',
      protein: { eaten: 10, target: 150 },
    });
    const cands = evaluateRules(ctx);
    expect(cands.map((c) => c.ruleId)).toEqual(['missed_workout', 'protein_low']);
    expect(materializeCards(TODAY, cands, false)).toBe(1);
    expect(materializeCards(TODAY, cands, false)).toBe(0);
    expect(materializeCards(TODAY, cands, true)).toBe(1);
    expect(materializeCards(TODAY, cands, true)).toBe(0);
    const rows = cardsForDate(TODAY);
    expect(rows.map((r) => [r.ruleId, r.state])).toEqual([
      ['missed_workout', 'active'],
      ['protein_low', 'active'],
    ]);
    dismissCard(rows[0]!.id);
    snoozeCard(rows[1]!.id, 1000);
    expect(cardsForDate(TODAY).map((r) => r.state)).toEqual(['dismissed', `snoozed:${1000 + 3 * 3600_000}`]);
    markCardApplied(rows[1]!.id);
    expect(cardsForDate(TODAY)[1]!.state).toBe('applied');
  });

  it('reschedule and skip sessions', () => {
    const s = seedSession('2026-11-17');
    rescheduleSession(s.id, TODAY);
    expect(sessionsRepo.get(s.id)?.date).toBe(TODAY);
    skipSession(s.id);
    expect(sessionsRepo.get(s.id)?.status).toBe('skipped');
  });

  it('deload request is pending for 10 days', () => {
    expect(deloadRequested(TODAY)).toBe(false);
    setDeloadRequested('2026-11-12');
    expect(deloadRequested(TODAY)).toBe(true);
    expect(deloadRequested('2026-11-23')).toBe(false);
    setDeloadRequested(null);
    expect(deloadRequested(TODAY)).toBe(false);
  });

  it('weigh-in upserts one row per date; week activity and kcal target', () => {
    seedWeight('2026-11-10', 82);
    saveWeighIn(TODAY, 81.4);
    saveWeighIn(TODAY, 81.2);
    expect(weightsSince('2026-11-12').map((w) => [w.date, w.weightKg])).toEqual([[TODAY, 81.2]]);
    seedSession('2026-11-18', { status: 'done' });
    const { meals } = seedMealDay('2026-11-18', { kcal: 2250 });
    mealsRepo.update(meals[0]!.id, { status: 'eaten' });
    const act = weekActivity(TODAY);
    expect(act.sessions).toEqual([{ date: '2026-11-18', status: 'done' }]);
    expect(act.meals.map((m) => m.status).sort()).toEqual(['eaten', 'planned']);
    expect(currentKcalTarget(TODAY)).toBe(2250);
    expect(currentKcalTarget('2026-11-01')).toBeNull();
  });

  it('check-in record: saved, updated, readable by the planner, and not shown as a card', () => {
    expect(latestCheckin()).toBeNull();
    const rec = {
      energy: 'ok' as const,
      sleep: 'good' as const,
      weighedIn: true,
      deltaKcal: -150,
      newKcal: 2150,
      volume: 'progress' as const,
      appliesFrom: '2026-11-23',
      applied: false,
    };
    saveCheckin('2026-11-22', rec);
    expect(latestCheckin()).toMatchObject({ date: '2026-11-22', deltaKcal: -150, pending: true });
    saveCheckin('2026-11-22', { ...rec, applied: true });
    expect(latestCheckin()).toMatchObject({ pending: false, applied: true });
    expect(lastCheckin()?.date).toBe('2026-11-22');
    expect(cardsForDate('2026-11-22')).toEqual([]);
  });
});
