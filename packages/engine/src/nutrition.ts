/**
 * Nutrition maths (sheet 28 "Nutrition maths"). Deterministic; never ask an LLM.
 * Units: kg, cm, kcal, grams. Convert only for display (see conversions below).
 */
import { addDays, ageFromBirthYear, daysBetween, type ISODate } from './dates';
import type { DietType, Goal, Lifestyle, Profile, Sex, WeighIn } from './schemas';

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;
export const KJ_PER_KCAL = 4.184;

export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const cmToInches = (cm: number): number => cm / CM_PER_INCH;
export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;
export const kcalToKj = (kcal: number): number => kcal * KJ_PER_KCAL;
export const kjToKcal = (kj: number): number => kj / KJ_PER_KCAL;

/** cm → {ft, in} with inches rounded to 0.5 and carried into feet when needed. */
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = Math.round(cmToInches(cm) * 2) / 2;
  const ft = Math.floor(totalIn / 12);
  return { ft, in: Math.round((totalIn - ft * 12) * 10) / 10 };
}

export function ftInToCm(ft: number, inches: number): number {
  return inchesToCm(ft * 12 + inches);
}

/** Round to the nearest multiple of `step` (avoids FP drift by working in integers of 1e-6). */
export function roundTo(value: number, step: number): number {
  if (step <= 0) throw new RangeError('step must be > 0');
  return Math.round(Math.round(value / step) * step * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// BMR / TDEE
// ---------------------------------------------------------------------------

export interface BodyInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}

/** Mifflin-St Jeor: 10×kg + 6.25×cm − 5×age + 5 (men) / −161 (women). */
export function bmrMifflin({ sex, weightKg, heightCm, age }: BodyInput): number {
  if (weightKg <= 0 || heightCm <= 0 || age <= 0) throw new RangeError('weight, height and age must be > 0');
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';

/** Standard reference-calculator factors (1.2–1.725). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

const LIFESTYLE_POINTS: Record<Lifestyle, number> = { sedentary: 0, light: 1, moderate: 2, active: 3 };

/**
 * Activity level from daily life (steps/job → lifestyle) + training days.
 * points = lifestyle (0–3) + training (0–1 d: 0, 2–3 d: 1, 4–5 d: 2, 6–7 d: 3)
 * 0 → sedentary, 1–2 → light, 3–4 → moderate, 5–6 → very active.
 */
export function activityLevel(lifestyle: Lifestyle, trainingDaysPerWeek: number): ActivityLevel {
  const d = Math.max(0, Math.min(7, Math.round(trainingDaysPerWeek)));
  const trainingPts = d <= 1 ? 0 : d <= 3 ? 1 : d <= 5 ? 2 : 3;
  const pts = LIFESTYLE_POINTS[lifestyle] + trainingPts;
  if (pts === 0) return 'sedentary';
  if (pts <= 2) return 'light';
  if (pts <= 4) return 'moderate';
  return 'very_active';
}

export function tdee(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[level];
}

/** Lifestyle from average daily steps (when the quiz asks steps instead of job). */
export function lifestyleFromSteps(stepsPerDay: number): Lifestyle {
  if (stepsPerDay < 5000) return 'sedentary';
  if (stepsPerDay < 7500) return 'light';
  if (stepsPerDay < 10000) return 'moderate';
  return 'active';
}

// ---------------------------------------------------------------------------
// Goal calories + floors
// ---------------------------------------------------------------------------

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Calorie floor: never below BMR × 1.1, and never below 1,200 (women) / 1,500 (men) kcal. */
export function calorieFloor(bmr: number, sex: Sex): number {
  return Math.ceil(Math.max(bmr * 1.1, sex === 'female' ? 1200 : 1500) / 10) * 10;
}

export const GOAL_RANGES: Record<Goal, { min: number; max: number }> = {
  fat_loss: { min: -0.2, max: -0.15 },
  muscle_gain: { min: 0.08, max: 0.12 },
  recomp: { min: 0, max: 0 },
  maintain: { min: 0, max: 0 },
};

export interface GoalCaloriesInput {
  tdee: number;
  bmr: number;
  sex: Sex;
  goal: Goal;
  /** Optional explicit adjustment fraction (e.g. −0.18); clamped into the goal's range. */
  adjustment?: number;
  /** BMI, used to pick the default deficit (−20% when BMI ≥ 27, else −15%). */
  bmi?: number;
}

export interface GoalCalories {
  kcal: number;
  floor: number;
  floorApplied: boolean;
  adjustment: number;
}

/** Fat loss −15–20%, muscle gain +8–12%, recomposition/maintain ±0. Rounded to 10 kcal, floor enforced. */
export function goalCalories(input: GoalCaloriesInput): GoalCalories {
  const range = GOAL_RANGES[input.goal];
  let adj: number;
  if (input.adjustment !== undefined) adj = Math.min(range.max, Math.max(range.min, input.adjustment));
  else if (input.goal === 'fat_loss') adj = (input.bmi ?? 0) >= 27 ? -0.2 : -0.15;
  else if (input.goal === 'muscle_gain') adj = 0.1;
  else adj = 0;
  const floor = calorieFloor(input.bmr, input.sex);
  const raw = Math.round((input.tdee * (1 + adj)) / 10) * 10;
  return { kcal: Math.max(raw, floor), floor, floorApplied: raw < floor, adjustment: adj };
}

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

export interface MacroSet {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const kcalFromMacros = (m: { protein: number; carbs: number; fat: number }): number =>
  4 * m.protein + 4 * m.carbs + 9 * m.fat;

export const DEFAULT_PROTEIN_G_PER_KG: Record<Goal, number> = {
  fat_loss: 2.0,
  recomp: 2.0,
  muscle_gain: 1.8,
  maintain: 1.6,
};

/**
 * Weight used for g/kg maths: actual weight, capped at the weight for BMI 27 so that
 * protein/fat targets stay sensible at higher body weights.
 */
export function macroBasisKg(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.min(weightKg, 27 * m * m);
}

export interface MacroInput {
  kcal: number;
  weightKg: number;
  heightCm: number;
  goal: Goal;
  dietType?: DietType;
  /** Protein g/kg, clamped to 1.6–2.2. */
  proteinGPerKg?: number;
}

/**
 * Protein 1.6–2.2 g/kg; fat ≥ 0.6 g/kg (and ≥ 25% kcal when there is room); carbs = the rest.
 * Keto: carbs capped at 30 g, fat takes the rest.
 */
export function macroTargets(input: MacroInput): MacroSet {
  const basis = macroBasisKg(input.weightKg, input.heightCm);
  const perKg = Math.min(2.2, Math.max(1.6, input.proteinGPerKg ?? DEFAULT_PROTEIN_G_PER_KG[input.goal]));
  let protein = Math.round(basis * perKg);
  const fatFloor = Math.ceil(basis * 0.6);
  let fat = Math.max(fatFloor, Math.round((input.kcal * 0.25) / 9));
  if (input.dietType === 'keto') {
    const carbs = 30;
    fat = Math.max(fatFloor, Math.round((input.kcal - 4 * protein - 4 * carbs) / 9));
    return { kcal: input.kcal, protein, carbs, fat };
  }
  let rest = input.kcal - 4 * protein - 9 * fat;
  if (rest < 0) {
    fat = fatFloor;
    rest = input.kcal - 4 * protein - 9 * fat;
  }
  if (rest < 0) {
    protein = Math.round(basis * 1.6);
    rest = input.kcal - 4 * protein - 9 * fat;
  }
  const carbs = Math.max(0, Math.round(rest / 4));
  return { kcal: input.kcal, protein, carbs, fat };
}

export type DayType = 'training' | 'rest';

/** Training days +15% carbs, rest days −15% carbs; kcal follow the carbs. Rest days never drop below `floor`. */
export function dayTypeMacros(base: MacroSet, dayType: DayType, floor = 0): MacroSet {
  if (dayType === 'training') {
    const carbs = Math.round(base.carbs * 1.15);
    return { ...base, carbs, kcal: base.kcal + 4 * (carbs - base.carbs) };
  }
  let carbs = Math.round(base.carbs * 0.85);
  let kcal = base.kcal + 4 * (carbs - base.carbs);
  if (kcal < floor) {
    carbs = Math.max(0, base.carbs - Math.floor(Math.max(0, base.kcal - floor) / 4));
    kcal = base.kcal + 4 * (carbs - base.carbs);
  }
  return { ...base, carbs, kcal };
}

// ---------------------------------------------------------------------------
// Weekly adjustment from the 7-day weight trend
// ---------------------------------------------------------------------------

/** Expected weekly change as a fraction of body weight. */
export const EXPECTED_WEEKLY_RATE: Record<Goal, number> = {
  fat_loss: -0.005,
  muscle_gain: 0.0025,
  recomp: 0,
  maintain: 0,
};

export interface WeeklyAdjustmentInput {
  weights: WeighIn[];
  goal: Goal;
  /** Local date of the check-in (inclusive end of the latest 7-day window). */
  onDate: ISODate;
  currentKcal: number;
  floor: number;
  /** Override the expected weekly change in kg. */
  expectedKgPerWeek?: number;
  /** Minimum weigh-ins required in each 7-day window. Default 3. */
  minWeighIns?: number;
}

export type AdjustmentReason = 'insufficient_data' | 'on_track' | 'slower_than_expected' | 'faster_than_expected' | 'floor';

export interface WeeklyAdjustment {
  deltaKcal: number;
  newKcal: number;
  reason: AdjustmentReason;
  trendKgPerWeek: number | null;
  expectedKgPerWeek: number;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Compare the 7-day average weight (days onDate−6..onDate) with the previous 7-day
 * average (onDate−13..onDate−7). If the change deviates from the expected change by more
 * than the tolerance (max(0.1 kg, 0.2% bw)), move calories by 100–200 kcal (in 50 kcal steps,
 * ~7,700 kcal per kg). Never below the floor.
 */
export function weeklyAdjustment(input: WeeklyAdjustmentInput): WeeklyAdjustment {
  const minN = input.minWeighIns ?? 3;
  const recent: number[] = [];
  const prior: number[] = [];
  for (const w of input.weights) {
    const ago = daysBetween(w.date, input.onDate);
    if (ago >= 0 && ago <= 6) recent.push(w.kg);
    else if (ago >= 7 && ago <= 13) prior.push(w.kg);
  }
  const lastKg = recent.length ? mean(recent) : prior.length ? mean(prior) : 0;
  const expected = input.expectedKgPerWeek ?? EXPECTED_WEEKLY_RATE[input.goal] * lastKg;
  if (recent.length < minN || prior.length < minN) {
    return { deltaKcal: 0, newKcal: input.currentKcal, reason: 'insufficient_data', trendKgPerWeek: null, expectedKgPerWeek: expected };
  }
  const trend = mean(recent) - mean(prior);
  const dev = trend - expected;
  const tol = Math.max(0.1, 0.002 * lastKg);
  if (Math.abs(dev) <= tol) {
    return { deltaKcal: 0, newKcal: input.currentKcal, reason: 'on_track', trendKgPerWeek: trend, expectedKgPerWeek: expected };
  }
  const mag = Math.min(200, Math.max(100, Math.round((Math.abs(dev) * 7700) / 7 / 50) * 50));
  // Gaining more / losing less than expected → eat less; otherwise eat more.
  const delta = dev > 0 ? -mag : mag;
  let newKcal = input.currentKcal + delta;
  let reason: AdjustmentReason = dev > 0 ? 'slower_than_expected' : 'faster_than_expected';
  if (input.goal === 'muscle_gain') reason = dev > 0 ? 'faster_than_expected' : 'slower_than_expected';
  if (newKcal < input.floor) {
    newKcal = Math.max(input.floor, input.currentKcal);
    reason = 'floor';
  }
  return { deltaKcal: newKcal - input.currentKcal, newKcal, reason, trendKgPerWeek: trend, expectedKgPerWeek: expected };
}

/** 7-day rolling average for the weight trend line (RW-38). One point per date with data. */
export function weightTrend(weights: WeighIn[]): { date: ISODate; avgKg: number }[] {
  const sorted = [...weights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sorted.map((w) => {
    const from = addDays(w.date, -6);
    const win = sorted.filter((x) => x.date >= from && x.date <= w.date).map((x) => x.kg);
    return { date: w.date, avgKg: Math.round(mean(win) * 100) / 100 };
  });
}

// ---------------------------------------------------------------------------
// Safety + full targets
// ---------------------------------------------------------------------------

export type SafetyFlag = 'under_16' | 'underweight_fat_loss' | 'pregnancy' | 'floor_applied';

export interface SafetyAssessment {
  effectiveGoal: Goal;
  flags: SafetyFlag[];
  /** UI shows the general plan + "consult a professional" copy. */
  consultProfessional: boolean;
}

/** Sheet 28 guardrails: under-16s, BMI < 18.5 with a weight-loss goal, pregnancy → general (maintain) plan. */
export function assessSafety(profile: Pick<Profile, 'goal' | 'birthYear' | 'weightKg' | 'heightCm' | 'pregnant'>, onDate: ISODate): SafetyAssessment {
  const flags: SafetyFlag[] = [];
  if (ageFromBirthYear(profile.birthYear, onDate) < 16) flags.push('under_16');
  if (profile.goal === 'fat_loss' && bmi(profile.weightKg, profile.heightCm) < 18.5) flags.push('underweight_fat_loss');
  if (profile.pregnant) flags.push('pregnancy');
  const blocked = flags.length > 0;
  return { effectiveGoal: blocked ? 'maintain' : profile.goal, flags, consultProfessional: blocked };
}

export interface NutritionTargets {
  age: number;
  bmr: number;
  activity: ActivityLevel;
  tdee: number;
  floor: number;
  goal: Goal;
  base: MacroSet;
  training: MacroSet;
  rest: MacroSet;
  flags: SafetyFlag[];
  consultProfessional: boolean;
}

export interface TargetOptions {
  /** Weekly check-in delta already applied (from weeklyAdjustment), added to goal kcal. */
  adjustmentKcal?: number;
  goalAdjustment?: number;
  proteinGPerKg?: number;
}

/** Everything the meal planner needs for a profile on a date. */
export function computeTargets(profile: Profile, onDate: ISODate, opts: TargetOptions = {}): NutritionTargets {
  const safety = assessSafety(profile, onDate);
  const age = Math.max(1, ageFromBirthYear(profile.birthYear, onDate));
  const bmr = bmrMifflin({ sex: profile.sex, weightKg: profile.weightKg, heightCm: profile.heightCm, age });
  const activity = activityLevel(profile.lifestyle, profile.daysPerWeek);
  const t = tdee(bmr, activity);
  const gc = goalCalories({
    tdee: t,
    bmr,
    sex: profile.sex,
    goal: safety.effectiveGoal,
    bmi: bmi(profile.weightKg, profile.heightCm),
    ...(opts.goalAdjustment !== undefined ? { adjustment: opts.goalAdjustment } : {}),
  });
  const kcal = Math.max(gc.floor, gc.kcal + (opts.adjustmentKcal ?? 0));
  const flags = [...safety.flags];
  if (gc.floorApplied) flags.push('floor_applied');
  const base = macroTargets({
    kcal,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    goal: safety.effectiveGoal,
    dietType: profile.dietType,
    ...(opts.proteinGPerKg !== undefined ? { proteinGPerKg: opts.proteinGPerKg } : {}),
  });
  return {
    age,
    bmr,
    activity,
    tdee: t,
    floor: gc.floor,
    goal: safety.effectiveGoal,
    base,
    training: dayTypeMacros(base, 'training', gc.floor),
    rest: dayTypeMacros(base, 'rest', gc.floor),
    flags,
    consultProfessional: safety.consultProfessional,
  };
}
