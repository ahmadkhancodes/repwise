/**
 * Local SQLite schema (build bible sheet 14). SQLite is the source of truth; the Worker is backup only.
 *
 * Every table has the common columns: id (uuid v7), user_id (null until signed in), created_at,
 * updated_at (ms UTC), deleted_at (soft delete) and dirty (local only: 0 clean, 1 needs push,
 * 2 rejected by the server until edited again).
 *
 * Column (SQL) names MUST match the server allow-list in server/src/sync/tables.ts; a unit test
 * enforces it. Arrays/objects are JSON text. No foreign keys: rows sync table by table in any order.
 * After changing this file run `npm run db:generate` to add a migration.
 */
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  type SQLiteColumn,
} from 'drizzle-orm/sqlite-core';

const common = {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  dirty: integer('dirty').notNull().default(1),
};

/**
 * Partial index for the sync engine's push scan (`WHERE dirty = 1`): it only holds rows waiting to
 * be pushed, so it stays tiny and costs nothing for clean rows (migration 0002, perf audit A5).
 */
const dirtyIdx = (table: string, t: { dirty: SQLiteColumn }) =>
  index(`${table}_dirty_idx`)
    .on(t.dirty)
    .where(sql`dirty = 1`);

const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

export type DayType = 'training' | 'rest';
export type SetType = 'warmup' | 'working' | 'drop' | 'failure' | 'cardio';
export type MealStatus = 'planned' | 'eaten' | 'skipped' | 'swapped';
export type SessionStatus = 'planned' | 'active' | 'paused' | 'done' | 'skipped';
export type Macros = { protein: number; carbs: number; fat: number; fibre?: number };

export const profile = sqliteTable('profile', {
  ...common,
  name: text('name'),
  goal: text('goal'),
  sex: text('sex'),
  birthYear: integer('birth_year'),
  heightCm: real('height_cm'),
  weightKg: real('weight_kg'),
  targetKg: real('target_kg'),
  experience: text('experience'),
  days: integer('days'),
  sessionMin: integer('session_min'),
  equipment: json<string[]>('equipment'),
  injuries: json<string[]>('injuries'),
  dietType: text('diet_type'),
  allergies: json<string[]>('allergies'),
  dislikes: json<string[]>('dislikes'),
  cuisines: json<string[]>('cuisines'),
  budget: text('budget'),
  cookMin: integer('cook_min'),
  mealsPerDay: integer('meals_per_day'),
  mealTimes: json<string[]>('meal_times'),
  units: text('units'),
  theme: text('theme'),
  activityLevel: text('activity_level'),
  timezone: text('timezone'),
  locale: text('locale'),
  onboardedAt: integer('onboarded_at'),
});

export const plans = sqliteTable(
  'plans',
  {
    ...common,
    type: text('type').$type<'training' | 'nutrition'>().notNull(),
    blockNo: integer('block_no'),
    weekStart: text('week_start'),
    payload: json<unknown>('payload'),
    version: integer('version'),
    generatedBy: text('generated_by').$type<'rules' | 'ai'>(),
  },
  (t) => [index('plans_type_week_idx').on(t.type, t.weekStart), dirtyIdx('plans', t)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    ...common,
    planId: text('plan_id'),
    date: text('date'),
    title: text('title'),
    dayIndex: integer('day_index'),
    status: text('status').$type<SessionStatus>(),
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),
    pausedMs: integer('paused_ms'),
    notes: text('notes'),
  },
  (t) => [
    index('sessions_date_idx').on(t.date),
    // History / PR / active-session queries: WHERE status = ? ORDER BY ended_at | started_at.
    index('sessions_status_ended_idx').on(t.status, t.endedAt),
    index('sessions_status_started_idx').on(t.status, t.startedAt),
    index('sessions_user_date_idx').on(t.userId, t.date),
    dirtyIdx('sessions', t),
  ],
);

export const sessionExercises = sqliteTable(
  'session_exercises',
  {
    ...common,
    sessionId: text('session_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    position: integer('position').notNull().default(0),
    supersetGroup: text('superset_group'),
    targetSets: integer('target_sets'),
    targetReps: text('target_reps'),
    targetLoad: real('target_load'),
    restS: integer('rest_s'),
    notes: text('notes'),
  },
  (t) => [
    // (session_id, position): the player's list comes back already in order (no sort step).
    index('session_exercises_session_pos_idx').on(t.sessionId, t.position),
    // "Previous" column and PR detection look up every session of one exercise.
    index('session_exercises_exercise_idx').on(t.exerciseId),
    dirtyIdx('session_exercises', t),
  ],
);

export const sets = sqliteTable(
  'sets',
  {
    ...common,
    sessionExerciseId: text('session_exercise_id').notNull(),
    idx: integer('idx').notNull().default(0),
    type: text('type').$type<SetType>().notNull().default('working'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    rpe: real('rpe'),
    durationS: integer('duration_s'),
    distanceM: real('distance_m'),
    doneAt: integer('done_at'),
  },
  (t) => [
    // (session_exercise_id, idx): sets of an exercise in order, no sort step.
    index('sets_session_exercise_idx_idx').on(t.sessionExerciseId, t.idx),
    // Logged sets in time order (Progress, Library "recent", history): partial, so it only holds
    // ticked, live rows (perf audit r2 N4).
    index('sets_done_at_idx')
      .on(t.doneAt)
      .where(sql`${t.doneAt} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    dirtyIdx('sets', t),
  ],
);

/** User-created exercises only; the catalogue lives in @repwise/content (src/services/catalog.ts). */
export const exercises = sqliteTable(
  'exercises',
  {
    ...common,
    name: text('name').notNull(),
    mediaUrl: text('media_url'),
    primaryMuscles: json<string[]>('primary_muscles'),
    secondary: json<string[]>('secondary'),
    equipment: json<string[]>('equipment'),
    pattern: text('pattern'),
    difficulty: integer('difficulty'),
    steps: json<string[]>('steps'),
    tips: json<string[]>('tips'),
    source: text('source'),
    licence: text('licence'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [dirtyIdx('exercises', t)],
);

export const routines = sqliteTable(
  'routines',
  {
    ...common,
    name: text('name').notNull(),
    folder: text('folder'),
    items: json<unknown[]>('items'),
  },
  (t) => [dirtyIdx('routines', t)],
);

export const mealPlans = sqliteTable(
  'meal_plans',
  {
    ...common,
    date: text('date').notNull(),
    dayType: text('day_type').$type<DayType>(),
    kcalTarget: integer('kcal_target'),
    macros: json<Macros>('macros'),
  },
  (t) => [index('meal_plans_date_updated_idx').on(t.date, t.updatedAt), dirtyIdx('meal_plans', t)],
);

export const meals = sqliteTable(
  'meals',
  {
    ...common,
    mealPlanId: text('meal_plan_id').notNull(),
    slot: text('slot').notNull(),
    recipeId: text('recipe_id'),
    portion: real('portion').notNull().default(1),
    status: text('status').$type<MealStatus>().notNull().default('planned'),
    swappedFrom: text('swapped_from'),
    eatenAt: integer('eaten_at'),
  },
  (t) => [index('meals_plan_created_idx').on(t.mealPlanId, t.createdAt), dirtyIdx('meals', t)],
);

/** User-created recipes only; the catalogue lives in @repwise/content. */
export const recipes = sqliteTable(
  'recipes',
  {
    ...common,
    title: text('title').notNull(),
    cuisine: text('cuisine'),
    dietTags: json<string[]>('diet_tags'),
    allergens: json<string[]>('allergens'),
    ingredients: json<unknown[]>('ingredients'),
    steps: json<string[]>('steps'),
    prepMin: integer('prep_min'),
    costLevel: integer('cost_level'),
    kcal: integer('kcal'),
    protein: real('protein'),
    carb: real('carb'),
    fat: real('fat'),
    imageUrl: text('image_url'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [dirtyIdx('recipes', t)],
);

export const foodLogs = sqliteTable(
  'food_logs',
  {
    ...common,
    date: text('date').notNull(),
    source: text('source').$type<'plan' | 'search' | 'quick'>().notNull(),
    name: text('name').notNull(),
    slot: text('slot'),
    kcal: integer('kcal').notNull().default(0),
    p: real('p'),
    c: real('c'),
    f: real('f'),
    /** The planned meal this 'plan' log records (several snacks share one slot, so never key by slot). */
    mealId: text('meal_id'),
  },
  (t) => [
    index('food_logs_date_idx').on(t.date),
    index('food_logs_meal_idx').on(t.mealId),
    dirtyIdx('food_logs', t),
  ],
);

export const bodyMetrics = sqliteTable(
  'body_metrics',
  {
    ...common,
    date: text('date').notNull(),
    weightKg: real('weight_kg'),
    waistCm: real('waist_cm'),
    hipsCm: real('hips_cm'),
    chestCm: real('chest_cm'),
    armCm: real('arm_cm'),
    thighCm: real('thigh_cm'),
    neckCm: real('neck_cm'),
    bodyFatPct: real('body_fat_pct'),
    note: text('note'),
  },
  (t) => [index('body_metrics_date_idx').on(t.date), dirtyIdx('body_metrics', t)],
);

export const photos = sqliteTable(
  'photos',
  {
    ...common,
    date: text('date').notNull(),
    localUri: text('local_uri'),
    cloudKey: text('cloud_key'),
    pose: text('pose'),
  },
  (t) => [index('photos_date_idx').on(t.date), dirtyIdx('photos', t)],
);

export const cards = sqliteTable(
  'cards',
  {
    ...common,
    ruleId: text('rule_id').notNull(),
    date: text('date').notNull(),
    text: text('text'),
    action: text('action'),
    state: text('state'),
  },
  (t) => [index('cards_date_idx').on(t.date), dirtyIdx('cards', t)],
);

/** Every synced table by its SQL name, in the server's TABLE_NAMES order. */
export const syncTables = {
  profile,
  plans,
  sessions,
  session_exercises: sessionExercises,
  sets,
  exercises,
  routines,
  meal_plans: mealPlans,
  meals,
  recipes,
  food_logs: foodLogs,
  body_metrics: bodyMetrics,
  photos,
  cards,
} as const;

export type SyncTableName = keyof typeof syncTables;
export type SyncTable = (typeof syncTables)[SyncTableName];
export const SYNC_TABLE_NAMES = Object.keys(syncTables) as SyncTableName[];

/** Partial indexes for the sync engine's dirty-row scan are added in the migration SQL. */
