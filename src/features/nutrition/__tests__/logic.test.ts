import { getCatalog } from '@/services/catalog';

import { QUICK_ESTIMATES, defaultGrams, gramOptions, macrosForGrams, nearestGram, recentNames } from '../logic/food';
import { dayIntake, progress, remaining } from '../logic/intake';
import {
  DEFAULT_WATER_GOAL_ML,
  clampWaterGoal,
  formatWater,
  glassCount,
  isWaterLog,
  totalWaterMl,
  waterMl,
  waterName,
} from '../logic/water';

describe('water', () => {
  it('round-trips the amount through the log name', () => {
    const row = { slot: 'water', name: waterName(330) };
    expect(row.name).toBe('Water 330 ml');
    expect(isWaterLog(row)).toBe(true);
    expect(waterMl(row)).toBe(330);
    expect(waterMl({ slot: 'lunch', name: 'Water 330 ml' })).toBe(0);
    expect(waterMl({ slot: 'water', name: 'Water' })).toBe(0);
    expect(totalWaterMl([row, row, { slot: null, name: 'Rice' }])).toBe(660);
  });
  it('formats and clamps', () => {
    expect(formatWater(750)).toBe('750 ml');
    expect(formatWater(1250)).toBe('1.25 L');
    expect(formatWater(2000)).toBe('2 L');
    expect(glassCount(DEFAULT_WATER_GOAL_ML)).toBe(8);
    expect(glassCount(500)).toBe(4);
    expect(clampWaterGoal(100)).toBe(1000);
    expect(clampWaterGoal(9000)).toBe(5000);
    expect(clampWaterGoal(2130)).toBe(2250);
  });
});

describe('food', () => {
  const rice = getCatalog().foods.find((f) => f.id === 'rice-white')!;
  it('macros for grams from per-100 g values', () => {
    const m = macrosForGrams(rice, 150);
    expect(m.kcal).toBe(Math.round(rice.per100g.kcal * 1.5));
    expect(m.p).toBeCloseTo(rice.per100g.protein * 1.5, 1);
    expect(macrosForGrams(rice, 0)).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
  });
  it('portion wheel values and defaults', () => {
    const g = gramOptions();
    expect(g[0]).toBe(5);
    expect(g[g.length - 1]).toBe(1000);
    expect(new Set(g).size).toBe(g.length);
    expect(nearestGram(103)).toBe(100);
    expect(nearestGram(108)).toBe(110);
    expect(nearestGram(5000)).toBe(1000);
    expect(defaultGrams('herbs_spices')).toBe(5);
    expect(defaultGrams('fats')).toBe(15);
    expect(defaultGrams('poultry')).toBe(100);
  });
  it('quick estimates add up roughly (4/4/9 within 15%)', () => {
    for (const e of QUICK_ESTIMATES) {
      const k = 4 * e.p + 4 * e.c + 9 * e.f;
      expect(Math.abs(k - e.kcal) / e.kcal).toBeLessThan(0.15);
    }
  });
  it('recent names: distinct, newest first, search only', () => {
    const rows = [
      { name: 'Rice', source: 'search', createdAt: 1 },
      { name: 'Banana', source: 'search', createdAt: 3 },
      { name: 'Rice', source: 'search', createdAt: 5 },
      { name: 'Karahi', source: 'plan', createdAt: 9 },
    ];
    expect(recentNames(rows)).toEqual(['Rice', 'Banana']);
    expect(recentNames(rows, 1)).toEqual(['Rice']);
  });
});

describe('intake', () => {
  const log = (o: Partial<{ source: string; slot: string | null; kcal: number; p: number }>) => ({
    source: 'search',
    slot: null,
    kcal: 100,
    p: 10,
    c: 10,
    f: 1,
    ...o,
  });
  it('sums logs, ignores water and adds eaten meals that have no plan log', () => {
    const meals = [
      { slot: 'lunch', status: 'eaten', kcal: 600, protein: 40, carbs: 60, fat: 20 },
      { slot: 'dinner', status: 'eaten', kcal: 700, protein: 50, carbs: 70, fat: 25 },
      { slot: 'snack', status: 'planned', kcal: 200, protein: 10, carbs: 20, fat: 5 },
    ];
    const t = dayIntake(
      [log({}), log({ source: 'quick', slot: 'water', kcal: 0, p: 0 }), log({ source: 'plan', slot: 'lunch', kcal: 590, p: 39 })],
      meals,
    );
    expect(t.kcal).toBe(100 + 590 + 700);
    expect(t.p).toBe(10 + 39 + 50);
  });
  it('progress and remaining', () => {
    expect(progress(500, 2000)).toBe(0.25);
    expect(progress(5, 0)).toBe(0);
    expect(remaining(1500, 2000)).toEqual({ left: 500, over: 0 });
    expect(remaining(2100, 2000)).toEqual({ left: 0, over: 100 });
  });
});
