/**
 * Sync table allow-list (build bible sheet 14). Field names are the SQLite column names (snake_case).
 * Every table also has the common columns. `user_id` is always overwritten with the token's user and
 * `dirty` is local-only, so both are stripped on push. Add new columns here when the app adds them,
 * or pushes of those rows are rejected with `unknown_field`.
 */
export const COMMON_COLUMNS = ['id', 'created_at', 'updated_at', 'deleted_at'] as const;
export const STRIPPED_COLUMNS = ['user_id', 'dirty'] as const;

export const SYNC_TABLES: Record<string, readonly string[]> = {
  profile: [
    'name', 'goal', 'sex', 'birth_year', 'height_cm', 'weight_kg', 'target_kg', 'experience', 'days', 'session_min',
    'equipment', 'injuries', 'diet_type', 'allergies', 'dislikes', 'cuisines', 'budget', 'cook_min', 'meals_per_day',
    'meal_times', 'units', 'theme', 'activity_level', 'timezone', 'locale', 'onboarded_at',
  ],
  plans: ['type', 'block_no', 'week_start', 'payload', 'version', 'generated_by'],
  sessions: ['plan_id', 'date', 'title', 'day_index', 'status', 'started_at', 'ended_at', 'paused_ms', 'notes'],
  session_exercises: ['session_id', 'exercise_id', 'position', 'superset_group', 'target_sets', 'target_reps', 'target_load', 'rest_s', 'notes'],
  sets: ['session_exercise_id', 'idx', 'type', 'weight_kg', 'reps', 'rpe', 'duration_s', 'distance_m', 'done_at'],
  exercises: [
    'name', 'media_url', 'primary_muscles', 'secondary', 'equipment', 'pattern', 'difficulty', 'steps', 'tips', 'source',
    'licence', 'is_custom',
  ],
  routines: ['name', 'folder', 'items'],
  meal_plans: ['date', 'day_type', 'kcal_target', 'macros'],
  meals: ['meal_plan_id', 'slot', 'recipe_id', 'portion', 'status', 'swapped_from', 'eaten_at'],
  recipes: [
    'title', 'cuisine', 'diet_tags', 'allergens', 'ingredients', 'steps', 'prep_min', 'cost_level', 'kcal', 'protein',
    'carb', 'fat', 'image_url', 'is_custom',
  ],
  food_logs: ['date', 'source', 'name', 'slot', 'kcal', 'p', 'c', 'f', 'meal_id'],
  body_metrics: ['date', 'weight_kg', 'waist_cm', 'hips_cm', 'chest_cm', 'arm_cm', 'thigh_cm', 'neck_cm', 'body_fat_pct', 'note'],
  photos: ['date', 'local_uri', 'cloud_key', 'pose'],
  cards: ['rule_id', 'date', 'text', 'action', 'state'],
  daily_steps: ['date', 'steps', 'source'],
};

export const TABLE_NAMES = Object.keys(SYNC_TABLES);

export const SYNC_LIMITS = {
  maxRowsPerPush: 500,
  maxRowBytes: 256 * 1024,
  maxStringBytes: 200 * 1024,
  maxPushBytes: 2 * 1024 * 1024,
  maxPullPage: 500,
  /** Reject rows dated further than this into the future (they would win every conflict). */
  maxFutureSkewMs: 24 * 3600 * 1000,
};
