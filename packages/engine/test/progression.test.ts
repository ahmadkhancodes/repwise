import {
  BLOCK_WEEKS,
  brzycki1RM,
  deloadDecision,
  deloadSets,
  doubleProgression,
  epley1RM,
  loadForReps,
  percentTable,
  platesPerSide,
  roundToIncrement,
  rpeLoad,
  stalledSessions,
  startingLoad,
} from '../src';

describe('1RM', () => {
  test('Epley and Brzycki fixtures', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 3);
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(60, 10)).toBeCloseTo(80, 6);
    expect(brzycki1RM(100, 5)).toBeCloseTo(112.5, 6);
    expect(brzycki1RM(100, 1)).toBeCloseTo(100, 6);
    expect(brzycki1RM(80, 10)).toBeCloseTo(106.667, 3);
  });

  test('invalid input', () => {
    expect(() => epley1RM(100, 0)).toThrow(RangeError);
    expect(() => epley1RM(-1, 5)).toThrow(RangeError);
    expect(() => epley1RM(100, 2.5)).toThrow(RangeError);
    expect(() => brzycki1RM(100, 37)).toThrow(RangeError);
  });

  test('inverse + % table', () => {
    expect(loadForReps(epley1RM(100, 5), 5)).toBeCloseTo(100, 6);
    expect(loadForReps(120, 1)).toBe(120);
    const t = percentTable(100);
    expect(t).toHaveLength(11);
    expect(t[0]).toEqual({ pct: 100, load: 100, reps: 1 });
    expect(t.find((r) => r.pct === 80)).toEqual({ pct: 80, load: 80, reps: 8 });
    expect(t[t.length - 1]?.pct).toBe(50);
  });

  test('rounding to increment', () => {
    expect(roundToIncrement(101.2, 2.5)).toBe(100);
    expect(roundToIncrement(101.3, 2.5)).toBe(102.5);
    expect(roundToIncrement(102.4, 2.5, 'down')).toBe(100);
    expect(roundToIncrement(102.5, 2.5, 'down')).toBe(102.5);
    expect(() => roundToIncrement(1, 0)).toThrow();
  });
});

describe('double progression', () => {
  const range: [number, number] = [8, 12];

  test('all sets at top → +2.5 kg upper / +5 kg lower, reset reps', () => {
    const sets = [{ weight: 60, reps: 12 }, { weight: 60, reps: 12 }, { weight: 60, reps: 13 }];
    expect(doubleProgression({ lastSets: sets, repRange: range, lowerBody: false })).toEqual({ action: 'increase_load', weight: 62.5, targetReps: 8 });
    expect(doubleProgression({ lastSets: sets, repRange: range, lowerBody: true })).toEqual({ action: 'increase_load', weight: 65, targetReps: 8 });
    expect(doubleProgression({ lastSets: sets, repRange: range, lowerBody: false, unit: 'lb' }).weight).toBe(65);
    expect(doubleProgression({ lastSets: sets, repRange: range, lowerBody: true, unit: 'lb' }).weight).toBe(70);
  });

  test('not all at top → same load, +1 rep on the weakest set', () => {
    const sets = [{ weight: 60, reps: 12 }, { weight: 60, reps: 10 }];
    expect(doubleProgression({ lastSets: sets, repRange: range, lowerBody: false })).toEqual({ action: 'increase_reps', weight: 60, targetReps: 11 });
    expect(doubleProgression({ lastSets: [{ weight: 60, reps: 5 }], repRange: range, lowerBody: false }).targetReps).toBe(8);
  });

  test('RPE-aware: top reached at RPE 10 → hold', () => {
    const sets = [{ weight: 60, reps: 12, rpe: 10 }, { weight: 60, reps: 12, rpe: 10 }];
    expect(doubleProgression({ lastSets: sets, repRange: range, lowerBody: false })).toEqual({ action: 'hold', weight: 60, targetReps: 12 });
  });

  test('bodyweight → +1 rep', () => {
    expect(doubleProgression({ lastSets: [{ weight: 0, reps: 12 }], repRange: range, lowerBody: false, bodyweight: true }).targetReps).toBe(13);
    expect(doubleProgression({ lastSets: [{ weight: 0, reps: 9 }], repRange: range, lowerBody: false, bodyweight: true }).targetReps).toBe(10);
  });

  test('no history → calibrate', () => {
    expect(doubleProgression({ lastSets: [], repRange: range, lowerBody: false })).toEqual({ action: 'calibrate', weight: null, targetReps: 8 });
    expect(() => doubleProgression({ lastSets: [], repRange: [5, 3], lowerBody: false })).toThrow();
  });
});

describe('RPE loads + starting loads', () => {
  test('rpeLoad', () => {
    // 100×5 @8 → e1RM = Epley(100, 7) = 123.33; 10 reps @8 → 12 reps → 123.33/1.4 = 88.1 → 87.5
    expect(rpeLoad({ weight: 100, reps: 5, rpe: 8 }, { reps: 10, rpe: 8 })).toBe(87.5);
    expect(rpeLoad({ weight: 100, reps: 5, rpe: 8 }, { reps: 5, rpe: 8 })).toBe(100);
    expect(() => rpeLoad({ weight: 100, reps: 5, rpe: 11 }, { reps: 5, rpe: 8 })).toThrow();
  });

  test('startingLoad from benchmark at ~RPE 8', () => {
    expect(startingLoad({ weight: 100, reps: 5 }, 8)).toBe(87.5);
  });
});

describe('stalls + deload', () => {
  test('stalled sessions count trailing non-improvements', () => {
    expect(stalledSessions([])).toBe(0);
    expect(stalledSessions([100])).toBe(0);
    expect(stalledSessions([100, 102, 104])).toBe(0);
    expect(stalledSessions([100, 104, 104])).toBe(1);
    expect(stalledSessions([100, 104, 103, 104])).toBe(2);
  });

  test('deload at block end (4–6 weeks) or after 2 stalls', () => {
    expect(BLOCK_WEEKS).toEqual({ beginner: 6, intermediate: 5, advanced: 4 });
    expect(deloadDecision({ weekInBlock: 3, blockWeeks: 4, stalledSessions: 0 })).toEqual({ deload: true, reason: 'block_end' });
    expect(deloadDecision({ weekInBlock: 1, blockWeeks: 5, stalledSessions: 2 })).toEqual({ deload: true, reason: 'stall' });
    expect(deloadDecision({ weekInBlock: 1, blockWeeks: 5, stalledSessions: 1 })).toEqual({ deload: false, reason: null });
    expect(deloadDecision({ weekInBlock: 2, blockWeeks: 5, stalledSessions: 3, weeksSinceDeload: 1 })).toEqual({ deload: false, reason: null });
  });

  test('−40% volume', () => {
    expect(deloadSets(5)).toBe(3);
    expect(deloadSets(4)).toBe(2);
    expect(deloadSets(3)).toBe(2);
    expect(deloadSets(1)).toBe(1);
  });
});

describe('plate calculator', () => {
  test('kg', () => {
    expect(platesPerSide(100)).toEqual({ perSide: [25, 15], achieved: 100, remainder: 0 });
    expect(platesPerSide(60)).toEqual({ perSide: [20], achieved: 60, remainder: 0 });
    expect(platesPerSide(102.5)).toEqual({ perSide: [25, 15, 1.25], achieved: 102.5, remainder: 0 });
    expect(platesPerSide(141.5).remainder).toBeCloseTo(1.5, 6);
  });

  test('lb', () => {
    expect(platesPerSide(225, { unit: 'lb' })).toEqual({ perSide: [45, 45], achieved: 225, remainder: 0 });
    expect(platesPerSide(135, { unit: 'lb' }).perSide).toEqual([45]);
    expect(platesPerSide(190, { unit: 'lb' }).perSide).toEqual([45, 25, 2.5]);
  });

  test('target at/below bar, custom bar, limited pairs', () => {
    expect(platesPerSide(20)).toEqual({ perSide: [], achieved: 20, remainder: 0 });
    expect(platesPerSide(10)).toEqual({ perSide: [], achieved: 20, remainder: 0 });
    expect(platesPerSide(55, { bar: 15 }).perSide).toEqual([20]);
    expect(platesPerSide(120, { pairs: { '25': 1, '20': 1 } }).perSide).toEqual([25, 20, 5]);
  });
});
