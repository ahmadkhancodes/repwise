import { PORTION_STEP, solvePortions, totalsFor, withinTargets, type PortionItem } from '../src';

const item = (kcal: number, protein: number, min = 0.5, max = 3): PortionItem => ({
  perServing: { kcal, protein, carbs: (kcal - 4 * protein) / 8, fat: (kcal - 4 * protein) / 18 },
  min,
  max,
});

describe('portion solver', () => {
  test('hits kcal ±5% and protein ±10 g on a typical day', () => {
    const items = [item(450, 35), item(620, 50), item(650, 45), item(200, 20)];
    const target = { kcal: 2400, protein: 170 };
    const r = solvePortions(items, target);
    expect(r.ok).toBe(true);
    expect(Math.abs(r.totals.kcal - 2400)).toBeLessThanOrEqual(120);
    expect(Math.abs(r.totals.protein - 170)).toBeLessThanOrEqual(10);
    r.servings.forEach((s) => expect(Math.round(s / PORTION_STEP) * PORTION_STEP).toBeCloseTo(s, 9));
  });

  test('respects scalable bounds', () => {
    const items = [item(500, 30, 1, 1.5), item(500, 30, 0.5, 1)];
    const r = solvePortions(items, { kcal: 5000, protein: 300 });
    expect(r.ok).toBe(false);
    expect(r.servings).toEqual([1.5, 1]);
    expect(r.kcalError).toBeLessThan(0);
  });

  test('protein-dense vs energy-dense trade-off uses paired moves', () => {
    const items = [item(300, 50), item(700, 10)];
    const r = solvePortions(items, { kcal: 1600, protein: 110 });
    expect(r.ok).toBe(true);
  });

  test('deterministic and handles empty input', () => {
    const items = [item(450, 35), item(620, 50)];
    expect(solvePortions(items, { kcal: 1500, protein: 120 })).toEqual(solvePortions(items, { kcal: 1500, protein: 120 }));
    const e = solvePortions([], { kcal: 2000, protein: 150 });
    expect(e.ok).toBe(false);
    expect(e.servings).toEqual([]);
  });

  test('totals + tolerance helpers', () => {
    expect(totalsFor([item(400, 30)], [2]).kcal).toBe(800);
    expect(withinTargets({ kcal: 2100, protein: 160 }, { kcal: 2000, protein: 150 })).toBe(true);
    expect(withinTargets({ kcal: 2101, protein: 160 }, { kcal: 2000, protein: 150 })).toBe(false);
    expect(withinTargets({ kcal: 2000, protein: 160.5 }, { kcal: 2000, protein: 150 })).toBe(false);
  });
});
