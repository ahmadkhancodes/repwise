/** S23 food logging: grams → macros from USDA per-100 g values, portion wheel and quick estimates. Pure. */
import type { Food } from '@repwise/content';

export type LoggedMacros = { kcal: number; p: number; c: number; f: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function macrosForGrams(food: Pick<Food, 'per100g'>, grams: number): LoggedMacros {
  const k = grams / 100;
  return {
    kcal: Math.round(food.per100g.kcal * k),
    p: r1(food.per100g.protein * k),
    c: r1(food.per100g.carbs * k),
    f: r1(food.per100g.fat * k),
  };
}

/** Wheel values: 5–100 g by 5, 110–500 by 10, 525–1000 by 25. */
export function gramOptions(): number[] {
  const out: number[] = [];
  for (let g = 5; g <= 100; g += 5) out.push(g);
  for (let g = 110; g <= 500; g += 10) out.push(g);
  for (let g = 525; g <= 1000; g += 25) out.push(g);
  return out;
}

/** Nearest wheel value (so a recent portion lands on the wheel). */
export function nearestGram(g: number, options: readonly number[] = gramOptions()): number {
  return options.reduce((best, o) => (Math.abs(o - g) < Math.abs(best - g) ? o : best), options[0] ?? 100);
}

/** Typical starting portion per category (a picker default, not advice). */
export function defaultGrams(category: string): number {
  switch (category) {
    case 'herbs_spices':
      return 5;
    case 'fats':
    case 'condiments':
    case 'sweeteners':
      return 15;
    case 'nuts_seeds':
      return 30;
    case 'eggs':
      return 50;
    case 'bread_pasta':
    case 'grains':
      return 80;
    default:
      return 100;
  }
}

/** "I ate out" quick estimates (RW-34): round numbers the user can adjust later. */
export const QUICK_ESTIMATES = [
  { id: 'snack', label: 'Snack', hint: 'about 250 kcal', kcal: 250, p: 8, c: 30, f: 10 },
  { id: 'light', label: 'Light meal', hint: 'about 450 kcal', kcal: 450, p: 25, c: 45, f: 18 },
  { id: 'regular', label: 'Regular meal', hint: 'about 750 kcal', kcal: 750, p: 35, c: 75, f: 32 },
  { id: 'large', label: 'Big meal', hint: 'about 1,100 kcal', kcal: 1100, p: 45, c: 110, f: 50 },
] as const;

export type QuickEstimate = (typeof QUICK_ESTIMATES)[number];

/** Distinct recent food names, newest first. */
export function recentNames(
  rows: readonly { name: string; source: string; createdAt: number }[],
  limit = 8,
): string[] {
  const out: string[] = [];
  for (const r of [...rows].sort((a, b) => b.createdAt - a.createdAt)) {
    if (r.source !== 'search' || out.includes(r.name)) continue;
    out.push(r.name);
    if (out.length >= limit) break;
  }
  return out;
}
