/** Plan output types shared by planner, validator and the LLM hook. */
import type { ISODate } from './dates';
import type { MacroSet, NutritionTargets, DayType } from './nutrition';
import type { Totals } from './portion';
import type {
  BlockState,
  Exercise,
  History,
  HistoryInput,
  LlmMealsOutput,
  LlmWorkoutOutput,
  MealSlot,
  Profile,
  ProfileInput,
  Recipe,
  SplitType,
} from './schemas';
import type { SlotRole, VolumeMap, VolumeRange } from './split';
import type { DeloadReason } from './progression';

export interface Catalogues {
  exercises: readonly Exercise[];
  recipes: readonly Recipe[];
}

export interface PlannedExercise {
  exerciseId: string;
  slotKey: string;
  /** Rotation key (pattern; isolation split by first primary muscle). */
  patternKey: string;
  role: SlotRole;
  sets: number;
  repRange: [number, number];
  targetReps: number;
  rpe: number;
  restS: number;
  /** Suggested load in kg; null = bodyweight or first-session calibration. */
  loadKg: number | null;
}

export interface PlannedSession {
  date: ISODate;
  /** 0 = Monday … 6 = Sunday. */
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
  totals: Totals;
}

export type PlanWarningCode =
  | 'safety_general_plan'
  | 'volume_capped'
  | 'slot_skipped'
  | 'repeat_window_relaxed'
  | 'recipe_filters_relaxed'
  | 'extra_snack_added'
  | 'protein_target_adjusted'
  | 'llm_rejected'
  | 'llm_error';

export interface PlanWarning {
  code: PlanWarningCode;
  message: string;
  date?: ISODate;
}

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
  deloadReason: DeloadReason;
  nutrition: NutritionTargets;
  volume: VolumeMap;
  volumeRange: VolumeRange;
  noRepeatDays: number;
  sessions: PlannedSession[];
  days: DayMealPlan[];
  warnings: PlanWarning[];
  validation: import('./validate').ValidationResult;
}

export interface PlanOptions {
  /** Epoch ms "now" (heatmap). Required: logic never reads the clock. */
  now: number;
  /** Any date in the target week; normalised to its Monday. */
  weekStart: ISODate;
  seed?: string;
  /** Meal no-repeat window, 7–30 (default 14). */
  noRepeatDays?: number;
  /** Weekly check-in kcal delta (from weeklyAdjustment). */
  adjustmentKcal?: number;
  /** The user asked for a deload this week (check-in / assistant card). */
  deload?: boolean;
}

/** Optional LLM variety layer (interface only; implemented in the Worker). Output must pass validate. */
export interface LlmWorkoutInput {
  weekStart: ISODate;
  sessions: {
    day: ISODate;
    templateKey: string;
    slots: { slotKey: string; role: SlotRole; candidates: string[]; sets: number; reps: number }[];
  }[];
  recentFingerprints: string[];
}

export interface LlmMealsInput {
  days: { date: ISODate; dayType: DayType; targets: MacroSet; slots: { slot: MealSlot; candidates: string[] }[] }[];
  recentRecipeIds: string[];
}

export interface LlmVarietyHook {
  planWorkouts?(input: LlmWorkoutInput): Promise<LlmWorkoutOutput | unknown>;
  planMeals?(input: LlmMealsInput): Promise<LlmMealsOutput | unknown>;
}

export type { History, HistoryInput, Profile, ProfileInput };
