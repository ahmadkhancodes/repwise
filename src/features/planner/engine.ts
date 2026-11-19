/**
 * Typed facade over `@repwise/engine` for the app.
 *
 * Why a facade: the engine is written against zod 3 (`z.record(z.string())`), but the shared
 * node_modules hoists zod 4, so `tsc` reports errors inside packages/engine/src as soon as any app
 * file imports it (types included). Runtime is fine (zod 4 still accepts the one-argument record).
 * Loading it with a plain `require` keeps the engine sources out of the app's type check; the types
 * below mirror packages/engine/src (types.ts, schemas.ts) for the parts the app uses.
 *
 * Once packages/engine uses `z.record(z.string(), z.string())` (schemas.ts BlockStateSchema), replace
 * this file with `export * from '@repwise/engine';` — every call site already matches the engine API.
 */

export const GOALS = ['fat_loss', 'muscle_gain', 'recomp', 'maintain'] as const;
export type Goal = (typeof GOALS)[number];
export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];
export const EXPERIENCE = ['beginner', 'intermediate', 'advanced'] as const;
export type Experience = (typeof EXPERIENCE)[number];
export const LIFESTYLES = ['sedentary', 'light', 'moderate', 'active'] as const;
export type Lifestyle = (typeof LIFESTYLES)[number];
export const DIET_TYPES = [
  'omnivore',
  'halal',
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
] as const;
export type DietType = (typeof DIET_TYPES)[number];
export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'band',
  'bodyweight',
  'smith',
  'ez_bar',
  'trap_bar',
  'pullup_bar',
  'bench',
  'cardio_machine',
  'squat_rack',
  'dip_station',
  'landmine',
  'box',
  'medicine_ball',
  'suspension_trainer',
  'ab_wheel',
  'stability_ball',
  'weight_plate',
  'sled',
  'jump_rope',
  'foam_roller',
  'mat',
  'treadmill',
  'bike',
  'rower',
  'elliptical',
  'stair_climber',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];
export const INJURIES = [
  'shoulder',
  'knee',
  'lower_back',
  'wrist',
  'elbow',
  'hip',
  'ankle',
  'neck',
] as const;
export type Injury = (typeof INJURIES)[number];
export const ALLERGENS = [
  'dairy',
  'egg',
  'gluten',
  'nuts',
  'peanut',
  'soy',
  'fish',
  'shellfish',
  'sesame',
  'celery',
  'lupin',
  'mustard',
  'sulphites',
] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const CUISINES = [
  'pakistani',
  'indian',
  'arab',
  'turkish',
  'persian',
  'mediterranean',
  'italian',
  'greek',
  'western',
  'american',
  'british',
  'mexican',
  'chinese',
  'japanese',
  'korean',
  'thai',
  'other',
  'middle_eastern',
  'gulf',
  'north_african',
  'east_asian',
  'southeast_asian',
  'global',
] as const;
export type Cuisine = (typeof CUISINES)[number];

/** Vocabularies the app does not branch on are plain strings (see packages/engine/src/schemas.ts). */
export type Pattern = string;
export type Muscle = string;
export type DietTag = string;
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ProteinSource = string;
export type SetType = 'warmup' | 'working' | 'drop' | 'failure' | 'cardio';
export type SplitType = 'full_body' | 'upper_lower' | 'ppl' | 'ppl_ul';
export type ISODate = string;
export type DayType = 'training' | 'rest';
export type SlotRole = 'main' | 'secondary' | 'accessory';

export interface Exercise {
  id: string;
  name: string;
  aliases: string[];
  pattern: Pattern;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment[];
  level: 1 | 2 | 3;
  unilateral: boolean;
  mediaId: string;
  contraindications: Injury[];
  compound?: boolean;
  met?: number;
  steps: string[];
  tips: string[];
  source: string;
  licence: string;
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: Cuisine;
  slots: MealSlot[];
  dietTags: DietTag[];
  allergens: Allergen[];
  proteinSource: ProteinSource;
  ingredients: { id: string; name: string; grams: number; fdcId?: number; aisle?: string }[];
  perServing: { kcal: number; protein: number; carbs: number; fat: number; fibre: number };
  prepMin: number;
  costTier: 1 | 2 | 3;
  scalable: { min: number; max: number };
  steps: string[];
  imageId?: string;
}

export interface Catalogues {
  exercises: readonly Exercise[];
  recipes: readonly Recipe[];
}

export interface ProfileInput {
  goal: Goal;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  targetKg?: number;
  experience: Experience;
  daysPerWeek: number;
  trainingWeekdays?: number[];
  sessionMin: number;
  splitPreference?: SplitType;
  equipment?: Equipment[];
  injuries?: Injury[];
  lifestyle?: Lifestyle;
  dietType?: DietType;
  allergies?: Allergen[];
  dislikes?: string[];
  cuisines?: Cuisine[];
  budget?: 1 | 2 | 3;
  cookMin?: number;
  mealsPerDay?: number;
  units?: 'metric' | 'imperial';
  pregnant?: boolean;
}

export interface BlockState {
  startDate: ISODate;
  blockNo: number;
  mainLifts: Record<string, string>;
  lastDeloadWeekStart?: ISODate;
}

export interface HistoryInput {
  sessions?: {
    date: ISODate;
    exerciseIds: string[];
    patternKeys?: string[];
    mainExerciseIds?: string[];
    templateKey?: string;
    fingerprint?: string;
    deload?: boolean;
  }[];
  sets?: {
    exerciseId: string;
    doneAt: number;
    type?: SetType;
    weightKg?: number;
    reps?: number;
    rpe?: number;
  }[];
  meals?: { date: ISODate; slot: MealSlot; recipeId: string }[];
  weights?: { date: ISODate; kg: number }[];
  block?: BlockState;
  signals?: { neverShow?: string[]; moreLike?: string[] };
}

export interface MacroSet {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionTargets {
  age: number;
  bmr: number;
  activity: string;
  tdee: number;
  floor: number;
  goal: Goal;
  base: MacroSet;
  training: MacroSet;
  rest: MacroSet;
  flags: string[];
  consultProfessional: boolean;
}

export interface PlannedExercise {
  exerciseId: string;
  slotKey: string;
  patternKey: string;
  role: SlotRole;
  sets: number;
  repRange: [number, number];
  targetReps: number;
  rpe: number;
  restS: number;
  loadKg: number | null;
}

export interface PlannedSession {
  date: ISODate;
  weekday: number;
  templateKey: string;
  title: string;
  items: PlannedExercise[];
  fingerprint: string;
  deload: boolean;
}

export interface PlannedMeal {
  slot: MealSlot;
  recipeId: string;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayMealPlan {
  date: ISODate;
  dayType: DayType;
  targets: MacroSet;
  meals: PlannedMeal[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
}

export interface PlanWarning {
  code: string;
  message: string;
  date?: ISODate;
}

export interface ValidationResult {
  ok: boolean;
  errors: { code: string }[];
}

export type VolumeRange = Record<string, { min: number; max: number }>;

export interface WeekPlan {
  version: 1;
  weekStart: ISODate;
  dates: ISODate[];
  seed: string;
  generatedBy: 'rules' | 'llm';
  split: SplitType;
  trainingDates: ISODate[];
  block: BlockState;
  weekInBlock: number;
  deload: boolean;
  deloadReason: 'block_end' | 'stall' | null;
  nutrition: NutritionTargets;
  volume: Record<string, number>;
  volumeRange: VolumeRange;
  noRepeatDays: number;
  sessions: PlannedSession[];
  days: DayMealPlan[];
  warnings: PlanWarning[];
  validation: ValidationResult;
}

export interface PlanOptions {
  now: number;
  weekStart: ISODate;
  seed?: string;
  noRepeatDays?: number;
  adjustmentKcal?: number;
}

/** Opaque planning context; the app only adjusts the two limits the README tells it to. */
export interface PlanningContext {
  volumeRange: VolumeRange;
  noRepeatDays: number;
}

export interface EngineApi {
  EXPECTED_WEEKLY_RATE: Record<Goal, number>;
  EQUIPMENT_PRESETS: {
    full_gym: readonly Equipment[];
    home_dumbbells: readonly Equipment[];
    bodyweight: readonly Equipment[];
  };
  addDays(date: ISODate, days: number): ISODate;
  daysBetween(a: ISODate, b: ISODate): number;
  startOfWeek(date: ISODate): ISODate;
  weekDates(start: ISODate): ISODate[];
  weekdayMon0(date: ISODate): number;
  localDateFromEpoch(epochMs: number, utcOffsetMinutes: number): ISODate;
  kgToLb(kg: number): number;
  lbToKg(lb: number): number;
  cmToFtIn(cm: number): { ft: number; in: number };
  ftInToCm(ft: number, inches: number): number;
  planWeek(
    profile: ProfileInput,
    history: HistoryInput,
    catalogues: Catalogues,
    opts: PlanOptions,
  ): WeekPlan;
  buildContext(
    profile: ProfileInput,
    history: HistoryInput,
    catalogues: Catalogues,
    opts: PlanOptions,
  ): PlanningContext;
  validatePlan(
    ctx: PlanningContext,
    plan: { sessions: readonly PlannedSession[]; days: readonly DayMealPlan[] },
  ): ValidationResult;
  mealFromRecipe(r: Recipe, slot: MealSlot, servings: number): PlannedMeal;
  swapExercise(args: {
    profile: ProfileInput;
    history: HistoryInput;
    catalogues: Catalogues;
    session: PlannedSession;
    index: number;
    now: number;
    seed?: string;
    count?: number;
  }): string[];
  swapMeal(args: {
    profile: ProfileInput;
    history: HistoryInput;
    catalogues: Catalogues;
    day: DayMealPlan;
    index: number;
    now: number;
    seed?: string;
    count?: number;
    noRepeatDays?: number;
  }): PlannedMeal[];
}

// Plain require: TypeScript does not follow it, so the engine's zod-3 sources stay out of `tsc`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const engine = require('@repwise/engine') as EngineApi;

/** `@repwise/content`'s adapter (D26–D28): content catalogues → engine catalogues. */
export type ContentToEngine = {
  toEngineCatalogues(src: {
    exercises: readonly unknown[];
    recipes: readonly unknown[];
    foods: readonly unknown[];
  }): { exercises: Exercise[]; recipes: Recipe[]; excluded: { id: string; reason: string }[] };
};

/**
 * Loaded on first plan, not at startup: the content entry evaluates its zod schemas and the JSON
 * (already parsed by src/services/catalog.ts, so Metro reuses the same modules).
 */
export function contentAdapter(): ContentToEngine {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@repwise/content') as ContentToEngine;
}

export const {
  EXPECTED_WEEKLY_RATE,
  EQUIPMENT_PRESETS,
  addDays,
  daysBetween,
  startOfWeek,
  weekDates,
  weekdayMon0,
  localDateFromEpoch,
  kgToLb,
  lbToKg,
  cmToFtIn,
  ftInToCm,
  planWeek,
  buildContext,
  validatePlan,
  mealFromRecipe,
  swapExercise,
  swapMeal,
} = engine;
