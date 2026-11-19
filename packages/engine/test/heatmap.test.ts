import { FATIGUE_SATURATION, MUSCLES, imbalanceRatio, meanRecovery, muscleHeatmap, type SetLog } from '../src';
import { exercises } from './fixtures/exercises';

const byId = new Map(exercises.map((e) => [e.id, e]));
const NOW = Date.UTC(2026, 10, 23, 12);
const H = 3_600_000;
const set = (exerciseId: string, hoursAgo: number, type: SetLog['type'] = 'working'): SetLog => ({ exerciseId, doneAt: NOW - hoursAgo * H, type, weightKg: 60, reps: 8 });

describe('heatmap', () => {
  test('no sets → fully recovered', () => {
    const h = muscleHeatmap([], byId, NOW);
    for (const m of MUSCLES) expect(h[m]).toEqual({ fatigue: 0, recovery: 1, setsLast7d: 0 });
  });

  test('fresh sets: primary 1, secondary 0.5', () => {
    const h = muscleHeatmap([set('bench_press', 0), set('bench_press', 0)], byId, NOW);
    expect(h.chest.fatigue).toBeCloseTo(2 / FATIGUE_SATURATION, 3);
    expect(h.triceps.fatigue).toBeCloseTo(1 / FATIGUE_SATURATION, 3);
    expect(h.chest.setsLast7d).toBe(2);
    expect(h.quads.fatigue).toBe(0);
  });

  test('decays with half-life', () => {
    const a = muscleHeatmap([set('bench_press', 0)], byId, NOW).chest.fatigue;
    const b = muscleHeatmap([set('bench_press', 36)], byId, NOW).chest.fatigue; // chest half-life 36 h
    expect(b).toBeCloseTo(a / 2, 2);
  });

  test('saturates at 1; ignores warm-ups, cardio, future and old sets, unknown ids', () => {
    const many = Array.from({ length: 20 }, () => set('bench_press', 1));
    expect(muscleHeatmap(many, byId, NOW).chest.fatigue).toBe(1);
    const ignored = [set('bench_press', 1, 'warmup'), set('rower', 1, 'cardio'), set('bench_press', -2), set('bench_press', 24 * 8), set('nope', 1)];
    expect(muscleHeatmap(ignored, byId, NOW).chest.fatigue).toBe(0);
  });

  test('mean recovery + imbalance', () => {
    const h = muscleHeatmap([set('bench_press', 1), set('bench_press', 1), set('bench_press', 1), set('back_squat', 1)], byId, NOW);
    expect(meanRecovery(h, ['chest'])).toBeLessThan(meanRecovery(h, ['quads']));
    expect(meanRecovery(h, [])).toBe(1);
    expect(imbalanceRatio(h, ['chest'], ['quads'])).toBe(3);
    expect(imbalanceRatio(h, ['chest'], ['calves'])).toBe(Infinity);
    expect(imbalanceRatio(h, ['biceps'], ['calves'])).toBe(1);
  });
});
