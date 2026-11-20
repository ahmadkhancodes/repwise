import { and, eq, isNotNull } from 'drizzle-orm';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { plans, sessions } from '@/db/schema';
import { saveProfile } from '@/features/settings/repo';
import { exercisesForSession, sessionExercisesRepo, sessionsRepo, startSession, type Session } from '@/features/workout/repo';

import { dedupeAfterPull, ensurePlannedAhead } from '../bridge';
import { plansRepo } from '../repo';
import { dedupePlannedSessions, ensureWeekPlanned, localToday, planToday } from '../planService';

// Thursday 19 Nov 2026, 09:00 local.
const NOW = new Date(2026, 10, 19, 9, 0, 0).getTime();
const TODAY = localToday(NOW);

function profile() {
  saveProfile({
    goal: 'muscle_gain',
    sex: 'male',
    birthYear: 1995,
    heightCm: 180,
    weightKg: 78,
    experience: 'intermediate',
    days: 3,
    sessionMin: 60,
    equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pullup_bar', 'bodyweight', 'squat_rack'],
    dietType: 'omnivore',
    cookMin: 30,
    mealsPerDay: 3,
    units: 'metric',
  });
}

const planned = () => sessionsRepo.list(isNotNull(sessions.planId));
const perDate = () => {
  const m = new Map<string, number>();
  for (const s of planned()) m.set(s.date!, (m.get(s.date!) ?? 0) + 1);
  return m;
};

/** What a pull from a second device that planned the same week looks like: new ids, same days. */
function secondDevicePlannedTheSameWeek(at: number): Session[] {
  const original = plansRepo.first(and(eq(plans.type, 'training'), isNotNull(plans.payload)))!;
  const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, dirty: _x, userId: _o, ...rest } = original;
  const other = plansRepo.insert(rest, at);
  const out: Session[] = [];
  for (const s of planned()) {
    const copy = sessionsRepo.insert(
      { planId: other.id, date: s.date, title: s.title, dayIndex: s.dayIndex, status: 'planned' },
      at,
    );
    for (const e of exercisesForSession(s.id)) {
      sessionExercisesRepo.insert(
        {
          sessionId: copy.id,
          exerciseId: e.exerciseId,
          position: e.position,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          targetLoad: e.targetLoad,
          restS: e.restS,
        },
        at,
      );
    }
    out.push(copy);
  }
  return out;
}

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
});

describe('dedupePlannedSessions (#16, R2-6)', () => {
  it('collapses two devices\' plans to one session per day, keeping the newest plan', () => {
    profile();
    ensureWeekPlanned(TODAY, NOW);
    const days = planned().length;
    expect(days).toBeGreaterThan(0);
    const copies = secondDevicePlannedTheSameWeek(NOW + 1000);
    expect(planned()).toHaveLength(days * 2);
    expect(dedupePlannedSessions({}, NOW + 2000)).toBe(days);
    expect([...perDate().values()].every((n) => n === 1)).toBe(true);
    expect(new Set(planned().map((s) => s.id))).toEqual(new Set(copies.map((s) => s.id)));
    // Removed sessions take their exercises with them (soft delete, so it syncs).
    expect(sessionsRepo.list()).toHaveLength(days); // live rows only
    // Idempotent.
    expect(dedupePlannedSessions({}, NOW + 3000)).toBe(0);
  });

  it('keeps a started or edited duplicate and drops the untouched one', () => {
    profile();
    ensureWeekPlanned(TODAY, NOW);
    const today = planToday(TODAY, NOW).session!;
    const copies = secondDevicePlannedTheSameWeek(NOW + 1000);
    startSession(today.id, NOW + 1500); // the OLDER plan's session was started on this phone
    const other = copies.find((c) => c.date !== TODAY)!;
    expect(other).toBeTruthy();
    const editedOld = planned().find((s) => s.date === other.date && s.planId !== other.planId)!;
    sessionExercisesRepo.remove(exercisesForSession(editedOld.id)[0]!.id, NOW + 1600);
    dedupePlannedSessions({}, NOW + 2000);
    expect([...perDate().values()].every((n) => n === 1)).toBe(true);
    expect(sessionsRepo.get(today.id)?.status).toBe('active');
    expect(sessionsRepo.get(editedOld.id)).toBeTruthy();
    expect(sessionsRepo.get(other.id)).toBeUndefined();
    expect(planToday(TODAY, NOW).session?.id).toBe(today.id);
  });

  it('never touches ad-hoc sessions (no plan)', () => {
    profile();
    ensureWeekPlanned(TODAY, NOW);
    const adhoc = sessionsRepo.insert({ date: TODAY, title: 'My routine', status: 'planned' }, NOW);
    expect(dedupePlannedSessions({}, NOW)).toBe(0);
    expect(sessionsRepo.get(adhoc.id)).toBeTruthy();
  });

  it('runs after a pull that changed sessions, and from the plan keeper', () => {
    profile();
    ensureWeekPlanned(TODAY, NOW);
    const days = planned().length;
    secondDevicePlannedTheSameWeek(NOW + 1000);
    expect(dedupeAfterPull(new Set(['food_logs']), NOW + 2000)).toBe(0);
    expect(dedupeAfterPull(new Set(['sessions']), NOW + 2000)).toBe(days);
    secondDevicePlannedTheSameWeek(NOW + 3000);
    ensurePlannedAhead(NOW + 4000);
    expect([...perDate().values()].every((n) => n === 1)).toBe(true);
  });
});
