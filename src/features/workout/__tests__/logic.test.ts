import { cardioKcal, distanceToMetres, formatDistance, metresToDisplay } from '../logic/cardio';
import { confettiParticles } from '../logic/confetti';
import { dayOfMonth, localDate, shortDate, shortWeekday, weekOf } from '../logic/dates';
import {
  activeMs,
  durationBucket,
  estimateMinutes,
  formatClock,
  formatCountdown,
  formatMinutes,
} from '../logic/duration';
import { isBodyweight, isLowerBody, nextTimeFor, nextTimeHeadline } from '../logic/nextTime';
import { moveItem, positionChanges } from '../logic/order';
import { bestOf, detectPR, sessionPR } from '../logic/prs';
import { canAddRoutine, parseRoutineItems, routineSetCount } from '../logic/routines';
import {
  doneFraction,
  nextSetIndex,
  parseRepRange,
  prefillSets,
  setLabels,
  spokenSetName,
  volumeKg,
  type SetLike,
} from '../logic/sets';
import {
  formatWeight,
  fromDisplayWeight,
  parseNumberInput,
  toDisplayWeight,
  weightStep,
  weightUnitFor,
} from '../logic/units';
import { dayState, weekCounts, weekStates } from '../logic/week';

const set = (p: Partial<SetLike>): SetLike => ({
  type: 'working',
  weightKg: null,
  reps: null,
  doneAt: null,
  ...p,
});

describe('units', () => {
  it('maps profile units to kg/lb with plate steps', () => {
    expect(weightUnitFor('imperial')).toBe('lb');
    expect(weightUnitFor('metric')).toBe('kg');
    expect(weightUnitFor(null)).toBe('kg');
    expect(weightStep('kg')).toBe(2.5);
    expect(weightStep('lb')).toBe(5);
  });
  it('round-trips lb through stored kg exactly', () => {
    const kg = fromDisplayWeight(135, 'lb');
    expect(kg).toBeCloseTo(61.235, 3);
    expect(toDisplayWeight(kg, 'lb')).toBe(135);
    expect(formatWeight(kg, 'lb')).toBe('135');
    expect(formatWeight(82.5, 'kg')).toBe('82.5');
    expect(formatWeight(null, 'kg')).toBe('');
  });
  it('parses typed numbers, including a decimal comma', () => {
    expect(parseNumberInput('82,5')).toBe(82.5);
    expect(parseNumberInput(' 10 ')).toBe(10);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('-3')).toBeNull();
  });
});

describe('dates', () => {
  it('gives Monday-first weeks and labels', () => {
    const w = weekOf('2026-11-19'); // Thursday
    expect(w[0]).toBe('2026-11-16');
    expect(w[6]).toBe('2026-11-22');
    expect(shortWeekday('2026-11-19')).toBe('Thu');
    expect(dayOfMonth('2026-11-19')).toBe(19);
    expect(shortDate('2026-11-19')).toBe('Thu 19 Nov');
  });
  it('formats today as a local ISO date', () => {
    expect(localDate(new Date(2026, 10, 19, 23, 30).getTime())).toBe('2026-11-19');
  });
});

describe('duration', () => {
  it('excludes paused time, including an open pause', () => {
    const s = { startedAt: 0, endedAt: null, pausedMs: 60_000 };
    expect(activeMs(s, 600_000)).toBe(540_000);
    expect(activeMs(s, 600_000, 540_000)).toBe(480_000);
    expect(activeMs({ startedAt: 0, endedAt: 300_000, pausedMs: 0 }, 9e9)).toBe(300_000);
    expect(activeMs({ startedAt: null, endedAt: null, pausedMs: null }, 5)).toBe(0);
  });
  it('formats clocks, countdowns and minutes', () => {
    expect(formatClock(245_000)).toBe('4:05');
    expect(formatClock(3_909_000)).toBe('1:05:09');
    expect(formatCountdown(90_000)).toBe('1:30');
    expect(formatCountdown(4_100)).toBe('0:05');
    expect(formatCountdown(-10)).toBe('0:00');
    expect(formatMinutes(52 * 60_000)).toBe('52 min');
    expect(formatMinutes(65 * 60_000)).toBe('1 h 5 min');
    expect(formatMinutes(120 * 60_000)).toBe('2 h');
  });
  it('buckets durations for analytics', () => {
    expect(durationBucket(10 * 60_000)).toBe('<30');
    expect(durationBucket(40 * 60_000)).toBe('30-45');
    expect(durationBucket(50 * 60_000)).toBe('45-60');
    expect(durationBucket(75 * 60_000)).toBe('60-90');
    expect(durationBucket(100 * 60_000)).toBe('90+');
  });
  it('estimates session minutes from sets and rest', () => {
    expect(estimateMinutes([{ sets: 3, restS: 90 }, { sets: 3, restS: null }])).toBe(16);
    expect(estimateMinutes([])).toBe(0);
  });
});

describe('sets', () => {
  it('parses rep targets', () => {
    expect(parseRepRange('8-12')).toEqual([8, 12]);
    expect(parseRepRange('12–8')).toEqual([8, 12]);
    expect(parseRepRange('10')).toEqual([10, 10]);
    expect(parseRepRange(null)).toEqual([8, 12]);
    expect(parseRepRange('AMRAP')).toEqual([8, 12]);
  });
  it('labels sets W / 1 / 2 / D / F', () => {
    expect(
      setLabels([
        { type: 'warmup' },
        { type: 'working' },
        { type: 'working' },
        { type: 'drop' },
        { type: 'failure' },
      ]),
    ).toEqual(['W', '1', '2', 'D', 'F']);
    expect(spokenSetName('working', '2')).toBe('Set 2');
    expect(spokenSetName('warmup', 'W')).toBe('Warm-up set');
    expect(spokenSetName('drop', 'D')).toBe('Drop set');
    expect(spokenSetName('failure', 'F')).toBe('Set to failure');
  });
  it('sums volume over done work sets only', () => {
    expect(
      volumeKg([
        set({ weightKg: 100, reps: 5, doneAt: 1 }),
        set({ weightKg: 100, reps: 5, doneAt: null }),
        set({ type: 'warmup', weightKg: 60, reps: 5, doneAt: 1 }),
        set({ type: 'drop', weightKg: 80, reps: 8, doneAt: 1 }),
        set({ weightKg: null, reps: 12, doneAt: 1 }),
      ]),
    ).toBe(1140);
  });
  it('pre-fills from target load first, then previous sets', () => {
    expect(
      prefillSets({ targetSets: 3, targetReps: '8-12', targetLoad: 82.5, previous: [] }),
    ).toEqual([
      { type: 'working', weightKg: 82.5, reps: 8 },
      { type: 'working', weightKg: 82.5, reps: 8 },
      { type: 'working', weightKg: 82.5, reps: 8 },
    ]);
    const previous = [
      { type: 'warmup' as const, weightKg: 40, reps: 10 },
      { type: 'working' as const, weightKg: 80, reps: 9 },
    ];
    expect(prefillSets({ targetSets: 3, targetReps: null, targetLoad: null, previous })).toEqual([
      { type: 'warmup', weightKg: 40, reps: 10 },
      { type: 'working', weightKg: 80, reps: 9 },
      { type: 'working', weightKg: 80, reps: 9 },
    ]);
    expect(prefillSets({ targetSets: null, targetReps: null, targetLoad: null, previous: [] })).toHaveLength(3);
    expect(
      prefillSets({ targetSets: 2, targetReps: null, targetLoad: null, previous: [], cardio: true }),
    ).toEqual([
      { type: 'cardio', weightKg: null, reps: null },
      { type: 'cardio', weightKg: null, reps: null },
    ]);
  });
  it('tracks progress and the next set', () => {
    const s = [set({ doneAt: 1 }), set({}), set({})];
    expect(doneFraction(s)).toBeCloseTo(1 / 3);
    expect(doneFraction([])).toBe(0);
    expect(nextSetIndex(s)).toBe(1);
    expect(nextSetIndex([set({ doneAt: 1 })])).toBe(-1);
  });
});

describe('PRs', () => {
  const history = [set({ weightKg: 80, reps: 8, doneAt: 1 }), set({ weightKg: 85, reps: 3, doneAt: 2 })];
  it('finds the best weight and e1RM (engine Epley)', () => {
    const b = bestOf(history);
    expect(b?.weightKg).toBe(85);
    expect(b?.e1rm).toBeCloseTo(101.33, 1); // 80 × (1 + 8/30)
    expect(bestOf([set({ type: 'warmup', weightKg: 200, reps: 1, doneAt: 1 })])).toBeNull();
  });
  it('detects heavier weight first, then a higher e1RM', () => {
    const best = bestOf(history);
    expect(detectPR(set({ weightKg: 87.5, reps: 1, doneAt: 3 }), best)?.kind).toBe('weight');
    expect(detectPR(set({ weightKg: 80, reps: 10, doneAt: 3 }), best)?.kind).toBe('e1rm');
    expect(detectPR(set({ weightKg: 80, reps: 8, doneAt: 3 }), best)).toBeNull();
    expect(detectPR(set({ type: 'warmup', weightKg: 100, reps: 5, doneAt: 3 }), best)).toBeNull();
    expect(detectPR(set({ weightKg: 100, reps: 5, doneAt: 3 }), null)).toBeNull();
  });
  it('reports the top PR of a session', () => {
    const session = [
      set({ weightKg: 87.5, reps: 2, doneAt: 10 }),
      set({ weightKg: 90, reps: 1, doneAt: 11 }),
      set({ weightKg: 70, reps: 5, doneAt: 12 }),
    ];
    expect(sessionPR(session, history)).toMatchObject({ kind: 'weight', weightKg: 90 });
    expect(sessionPR(session, [])).toBeNull();
  });
});

describe('next time (engine double progression)', () => {
  it('adds load when every work set hits the top of the range', () => {
    const n = nextTimeFor({
      sets: [set({ weightKg: 80, reps: 12, doneAt: 1 }), set({ weightKg: 80, reps: 12, doneAt: 2 })],
      targetReps: '8-12',
      pattern: 'push_h',
      equipment: ['barbell', 'bench'],
      unit: 'kg',
    });
    expect(n).toMatchObject({ action: 'increase_load', weight: 82.5, targetReps: 8, text: '82.5 kg × 8' });
    expect(nextTimeHeadline(n!)).toBe('Add weight');
  });
  it('uses the lower-body jump and the lb increments', () => {
    const n = nextTimeFor({
      sets: [set({ weightKg: fromDisplayWeight(225, 'lb'), reps: 5, doneAt: 1 })],
      targetReps: '5',
      pattern: 'squat',
      equipment: ['barbell'],
      unit: 'lb',
    });
    expect(n?.text).toBe('235 lb × 5');
    expect(isLowerBody('hinge')).toBe(true);
    expect(isLowerBody('pull_v')).toBe(false);
  });
  it('adds reps below the top, and for bodyweight work', () => {
    expect(
      nextTimeFor({
        sets: [set({ weightKg: 60, reps: 9, doneAt: 1 })],
        targetReps: '8-12',
        pattern: 'pull_h',
        equipment: ['cable'],
        unit: 'kg',
      })?.text,
    ).toBe('60 kg × 10');
    const bw = nextTimeFor({
      sets: [set({ weightKg: null, reps: 10, doneAt: 1 })],
      targetReps: '8-12',
      pattern: 'push_h',
      equipment: ['bodyweight'],
      unit: 'kg',
    });
    expect(bw?.text).toBe('11 reps');
    expect(isBodyweight(['bodyweight'])).toBe(true);
    expect(isBodyweight(['bodyweight', 'pull_up_bar'])).toBe(false);
  });
  it('returns null when nothing was logged', () => {
    expect(nextTimeFor({ sets: [set({})], targetReps: null, pattern: 'squat', equipment: [], unit: 'kg' })).toBeNull();
  });
});

describe('order', () => {
  it('moves items and lists only changed positions', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a'], 3, 0)).toEqual(['a']);
    expect(
      positionChanges(
        [
          { id: 'a', position: 0 },
          { id: 'b', position: 1 },
          { id: 'c', position: 2 },
        ],
        ['b', 'a', 'c'],
      ),
    ).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ]);
  });
});

describe('cardio', () => {
  it('estimates kcal with the engine MET maths', () => {
    expect(cardioKcal(30 * 60, 80)).toBe(240); // 6 MET × 80 kg × 0.5 h
    expect(cardioKcal(30 * 60, null)).toBeNull();
    expect(cardioKcal(0, 80)).toBeNull();
  });
  it('formats and converts distances', () => {
    expect(formatDistance(5200, 'metric')).toBe('5.2 km');
    expect(formatDistance(800, 'metric')).toBe('800 m');
    expect(formatDistance(1609.344, 'imperial')).toBe('1 mi');
    expect(formatDistance(null, 'metric')).toBe('');
    expect(distanceToMetres(5, 'metric')).toBe(5000);
    expect(metresToDisplay(5000, 'metric')).toBe(5);
    expect(metresToDisplay(null, 'metric')).toBeNull();
  });
});

describe('week', () => {
  const sessions = [
    { id: '1', date: '2026-11-16', status: 'done' as const },
    { id: '2', date: '2026-11-17', status: 'planned' as const },
    { id: '3', date: '2026-11-19', status: 'active' as const },
    { id: '4', date: '2026-11-21', status: 'planned' as const },
    { id: '5', date: '2026-11-22', status: 'skipped' as const },
  ];
  it('derives one state per day', () => {
    expect(dayState(sessions, '2026-11-16', '2026-11-19')).toBe('done');
    expect(dayState(sessions, '2026-11-17', '2026-11-19')).toBe('missed');
    expect(dayState(sessions, '2026-11-19', '2026-11-19')).toBe('active');
    expect(dayState(sessions, '2026-11-21', '2026-11-19')).toBe('planned');
    expect(dayState(sessions, '2026-11-22', '2026-11-19')).toBe('rest');
    expect(weekStates(sessions, ['2026-11-18'], '2026-11-19')).toEqual([{ date: '2026-11-18', state: 'rest' }]);
    expect(weekCounts(sessions)).toEqual({ done: 1, total: 4 });
  });
});

describe('routines', () => {
  it('parses items defensively', () => {
    expect(
      parseRoutineItems([
        { exerciseId: 'a', sets: 4, reps: '5', restS: 120 },
        { exerciseId: 'b' },
        { nope: true },
        null,
        { exerciseId: 'c', sets: 99 },
      ]),
    ).toEqual([
      { exerciseId: 'a', sets: 4, reps: '5', restS: 120 },
      { exerciseId: 'b', sets: 3, reps: '8-12', restS: 90 },
      { exerciseId: 'c', sets: 10, reps: '8-12', restS: 90 },
    ]);
    expect(parseRoutineItems('x')).toEqual([]);
    expect(routineSetCount(parseRoutineItems([{ exerciseId: 'a' }, { exerciseId: 'b', sets: 2 }]))).toBe(5);
  });
  it('limits free users to 3 routines', () => {
    expect(canAddRoutine(2, false)).toBe(true);
    expect(canAddRoutine(3, false)).toBe(false);
    expect(canAddRoutine(30, true)).toBe(true);
  });
});

describe('confetti', () => {
  it('is deterministic and within bounds', () => {
    const a = confettiParticles(20, 4);
    expect(confettiParticles(20, 4)).toEqual(a);
    expect(a).toHaveLength(20);
    for (const p of a) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(p.fall).toBeGreaterThanOrEqual(0.5);
      expect(p.colorIndex).toBeLessThan(4);
    }
  });
});
