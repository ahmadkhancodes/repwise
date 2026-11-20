/**
 * Seeded random profile generator for the property tests (fast-check is not installed, so this
 * is a small hand-rolled generator). Independent of the engine's own PRNG on purpose: the
 * system under test must not share its randomness with the test data.
 */
import {
  ALLERGENS,
  CUISINES,
  DIET_TYPES,
  EQUIPMENT,
  EQUIPMENT_PRESETS,
  EXPERIENCE,
  GOALS,
  INJURIES,
  LIFESTYLES,
  SEXES,
  SPLIT_TYPES,
  type Allergen,
  type Cuisine,
  type Equipment,
  type Injury,
  type ProfileInput,
} from '../../src';

/** mulberry32 over a 32-bit seed. */
export class Gen {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  real(lo: number, hi: number, dp = 1): number {
    const f = 10 ** dp;
    return Math.round((lo + this.next() * (hi - lo)) * f) / f;
  }
  bool(p = 0.5): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)] as T;
  }
  subset<T>(xs: readonly T[], p: number): T[] {
    return xs.filter(() => this.bool(p));
  }
}

/** Reference "today" used by every property: Monday 2026-11-23. */
export const REF_YEAR = 2026;

/** One random profile covering every field (including the 1- and 7-day and extreme-body edges). */
export function randomProfile(g: Gen): ProfileInput {
  const sex = g.pick(SEXES);
  // Ages 12–95 (under-16s exercise the safety path), plus rare extremes.
  const age = g.bool(0.03) ? g.pick([10, 13, 15, 16, 100, 120]) : g.int(14, 90);
  // Heights 120–230 cm; 10% of draws pin a schema edge.
  const heightCm = g.bool(0.1) ? g.pick([120, 230, 140, 210]) : g.real(sex === 'male' ? 150 : 140, sex === 'male' ? 205 : 190);
  // Mostly a plausible BMI (15–50), sometimes fully independent extremes inside the schema.
  let weightKg: number;
  if (g.bool(0.1)) weightKg = g.pick([30, 300, g.real(30, 300)]);
  else {
    const m = heightCm / 100;
    weightKg = Math.min(300, Math.max(30, g.real(15, 50) * m * m));
  }
  const kit = g.next();
  const equipment: Equipment[] =
    kit < 0.3
      ? [...EQUIPMENT_PRESETS.full_gym]
      : kit < 0.5
        ? [...EQUIPMENT_PRESETS.home_dumbbells]
        : kit < 0.7
          ? [...EQUIPMENT_PRESETS.bodyweight]
          : kit < 0.75
            ? []
            : g.subset(EQUIPMENT, g.real(0.1, 0.7, 2));
  const injuries: Injury[] = g.bool(0.7) ? [] : g.subset(INJURIES, 0.2);
  const allergies: Allergen[] = g.bool(0.5) ? [] : g.subset(ALLERGENS, g.pick([0.08, 0.15, 0.3]));
  const cuisines: Cuisine[] = g.bool(0.3) ? [] : g.subset(CUISINES, 0.12);
  const daysPerWeek = g.bool(0.12) ? g.pick([1, 7]) : g.int(2, 6);
  const weekdays = g.bool(0.3)
    ? [0, 1, 2, 3, 4, 5, 6].sort(() => g.next() - 0.5).slice(0, daysPerWeek)
    : undefined;
  const dislikePool = ['chicken', 'onion', 'mushroom', 'broccoli', 'salmon', 'tofu', 'rice', 'egg', 'beef', 'yogurt', 'chickpea'];
  const p: ProfileInput = {
    goal: g.pick(GOALS),
    sex,
    birthYear: REF_YEAR - age,
    heightCm,
    weightKg: Math.round(weightKg * 10) / 10,
    experience: g.pick(EXPERIENCE),
    daysPerWeek,
    sessionMin: g.bool(0.1) ? g.pick([20, 180]) : g.pick([30, 45, 60, 75, 90]),
    equipment,
    injuries,
    lifestyle: g.pick(LIFESTYLES),
    dietType: g.pick(DIET_TYPES),
    allergies,
    dislikes: g.bool(0.8) ? [] : g.subset(dislikePool, 0.2),
    cuisines,
    budget: g.pick([1, 2, 3] as const),
    cookMin: g.pick([10, 20, 30, 45, 60, 120]),
    mealsPerDay: g.int(2, 6),
    pregnant: sex === 'female' && g.bool(0.03),
  };
  if (weekdays) p.trainingWeekdays = weekdays;
  if (g.bool(0.2)) p.splitPreference = g.pick(SPLIT_TYPES);
  return p;
}

export function profiles(seed: number, n: number): ProfileInput[] {
  const g = new Gen(seed);
  return Array.from({ length: n }, () => randomProfile(g));
}
