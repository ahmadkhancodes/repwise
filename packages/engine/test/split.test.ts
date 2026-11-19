import {
  PATTERNS,
  SET_LIMITS,
  SPLIT_ROTATIONS,
  TEMPLATES,
  VOLUME_GROUP_KEYS,
  allocateSets,
  chooseSplit,
  exercisesPerSession,
  groupContribution,
  isCompound,
  isLowerBody,
  patternKey,
  setsPerSession,
  trainingWeekdays,
  volumeTargets,
  weeklyVolume,
  type AllocItem,
} from '../src';
import { exercises } from './fixtures/exercises';

const byId = new Map(exercises.map((e) => [e.id, e]));

describe('split choice', () => {
  test('defaults by days', () => {
    expect(chooseSplit(2)).toBe('full_body');
    expect(chooseSplit(3)).toBe('full_body');
    expect(chooseSplit(4)).toBe('upper_lower');
    expect(chooseSplit(5)).toBe('ppl');
    expect(chooseSplit(6)).toBe('ppl');
    expect(() => chooseSplit(1)).toThrow();
    expect(() => chooseSplit(7)).toThrow();
  });

  test('user preference wins when it fits', () => {
    expect(chooseSplit(3, 'upper_lower')).toBe('upper_lower');
    expect(chooseSplit(2, 'ppl')).toBe('full_body');
    expect(chooseSplit(5, 'ppl_ul')).toBe('ppl_ul');
    expect(chooseSplit(4, 'ppl_ul')).toBe('upper_lower');
    expect(chooseSplit(6, 'full_body')).toBe('full_body');
  });

  test('weekdays', () => {
    expect(trainingWeekdays(3)).toEqual([0, 2, 4]);
    expect(trainingWeekdays(3, [5, 1, 3])).toEqual([1, 3, 5]);
    expect(trainingWeekdays(3, [1, 1, 3])).toEqual([0, 2, 4]);
    for (let d = 2; d <= 6; d++) expect(trainingWeekdays(d)).toHaveLength(d);
  });

  test('templates are well-formed', () => {
    for (const rot of Object.values(SPLIT_ROTATIONS)) for (const t of rot) expect(TEMPLATES[t]).toBeDefined();
    for (const t of Object.values(TEMPLATES)) {
      expect(t.slots.length).toBeGreaterThanOrEqual(7);
      const keys = t.slots.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const s of t.slots) {
        expect(PATTERNS).toContain(s.pattern);
        if (s.pattern === 'isolation') expect(s.muscle).toBeDefined();
      }
      expect(t.slots[0]?.role).toBe('main');
    }
  });

  test('session sizing', () => {
    expect([20, 30, 45, 60, 75, 90, 180].map(exercisesPerSession)).toEqual([4, 4, 5, 6, 7, 8, 8]);
    expect([20, 45, 60, 180].map(setsPerSession)).toEqual([8, 15, 20, 30]);
  });

  test('helpers', () => {
    expect(patternKey('isolation', 'biceps')).toBe('isolation:biceps');
    expect(patternKey('squat', 'quads')).toBe('squat');
    expect(isCompound(byId.get('back_squat')!)).toBe(true);
    expect(isCompound(byId.get('dumbbell_curl')!)).toBe(false);
    expect(isCompound({ pattern: 'squat', compound: false })).toBe(false);
    expect(isLowerBody(byId.get('leg_extension')!)).toBe(true);
    expect(isLowerBody(byId.get('bench_press')!)).toBe(false);
  });
});

describe('volume', () => {
  test('group contribution: primary 1, secondary 0.5', () => {
    const c = groupContribution(byId.get('bench_press')!);
    expect(c.chest).toBe(1);
    expect(c.triceps).toBe(0.5);
    expect(c.shoulders).toBe(0.5);
    expect(c.quads).toBe(0);
  });

  test('targets start low, +1/week, capped by capacity and experience, halved on deload', () => {
    expect(volumeTargets({ experience: 'beginner', daysPerWeek: 4, sessionMin: 75 }).chest).toEqual({ min: 10, max: 16 });
    expect(volumeTargets({ experience: 'intermediate', daysPerWeek: 6, sessionMin: 90 }).chest).toEqual({ min: 12, max: 18 });
    expect(volumeTargets({ experience: 'intermediate', daysPerWeek: 6, sessionMin: 90, weekInBlock: 3 }).chest.min).toBe(15);
    expect(volumeTargets({ experience: 'advanced', daysPerWeek: 6, sessionMin: 90, weekInBlock: 20 }).chest.min).toBe(20);
    expect(volumeTargets({ experience: 'advanced', daysPerWeek: 2, sessionMin: 30 }).chest.min).toBe(2);
    expect(volumeTargets({ experience: 'beginner', daysPerWeek: 4, sessionMin: 75, deload: true }).chest.min).toBe(5);
    const t = volumeTargets({ experience: 'beginner', daysPerWeek: 4, sessionMin: 75, trainableGroups: new Set(['chest']) });
    expect(t.chest.min).toBe(10);
    expect(t.biceps.min).toBe(0);
    for (const g of VOLUME_GROUP_KEYS) expect(t[g].max).toBeLessThanOrEqual(20);
  });

  test('allocateSets lands every group inside the range when capacity allows', () => {
    const mk = (ids: [string, AllocItem['role']][]) => ({ items: ids.map(([exerciseId, role]) => ({ exerciseId, role, sets: SET_LIMITS[role].initial })) });
    const week = [
      mk([['bench_press', 'main'], ['barbell_row', 'main'], ['overhead_press', 'secondary'], ['lat_pulldown', 'secondary'], ['dumbbell_curl', 'accessory'], ['triceps_pushdown', 'accessory'], ['lateral_raise', 'accessory']]),
      mk([['back_squat', 'main'], ['romanian_deadlift', 'secondary'], ['walking_lunge', 'accessory'], ['leg_extension', 'accessory'], ['lying_leg_curl', 'accessory'], ['standing_calf_raise', 'accessory']]),
      mk([['incline_dumbbell_press', 'main'], ['pull_up', 'main'], ['seated_dumbbell_press', 'secondary'], ['seated_cable_row', 'secondary'], ['hammer_curl', 'accessory'], ['skull_crusher', 'accessory'], ['cable_fly', 'accessory']]),
      mk([['deadlift', 'main'], ['leg_press', 'secondary'], ['bulgarian_split_squat', 'accessory'], ['seated_leg_curl', 'accessory'], ['sissy_squat', 'accessory'], ['hip_abduction', 'accessory']]),
    ];
    const range = volumeTargets({ experience: 'intermediate', daysPerWeek: 4, sessionMin: 75 });
    allocateSets(week, byId, range, setsPerSession(75));
    const v = weeklyVolume(week, byId);
    for (const g of VOLUME_GROUP_KEYS) {
      expect(v[g]).toBeGreaterThanOrEqual(range[g].min);
      expect(v[g]).toBeLessThanOrEqual(range[g].max);
    }
    for (const s of week) {
      expect(s.items.reduce((a, i) => a + i.sets, 0)).toBeLessThanOrEqual(setsPerSession(75));
      for (const it of s.items) {
        expect(it.sets).toBeGreaterThanOrEqual(SET_LIMITS[it.role].min);
        expect(it.sets).toBeLessThanOrEqual(SET_LIMITS[it.role].max);
      }
    }
  });

  test('weeklyVolume ignores unknown ids', () => {
    expect(weeklyVolume([{ items: [{ exerciseId: 'nope', sets: 5 }] }], byId).chest).toBe(0);
  });
});
