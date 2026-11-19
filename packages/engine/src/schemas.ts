/**
 * Zod schemas: the contract between the engine, the content pipeline
 * (packages/content), the app and the Worker.
 *
 * The content agent produces exercises.json / recipes.json that must parse
 * with `ExerciseCatalogueSchema` / `RecipeCatalogueSchema`.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enumerations (fixed vocabularies; sheet 29)
// ---------------------------------------------------------------------------

export const PATTERNS = [
  'squat',
  'hinge',
  'push_h',
  'push_v',
  'pull_h',
  'pull_v',
  'lunge',
  'carry',
  'core',
  'isolation',
  'cardio',
] as const;
export const PatternSchema = z.enum(PATTERNS);
export type Pattern = z.infer<typeof PatternSchema>;

/** Fixed muscle list used by the heatmap and volume maths. */
export const MUSCLES = [
  'chest',
  'lats',
  'upper_back',
  'traps',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
] as const;
export const MuscleSchema = z.enum(MUSCLES);
export type Muscle = z.infer<typeof MuscleSchema>;

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
] as const;
export const EquipmentSchema = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof EquipmentSchema>;

/** Body areas used for injuries (profile) and contraindications (exercise). */
export const INJURIES = ['shoulder', 'knee', 'lower_back', 'wrist', 'elbow', 'hip', 'ankle', 'neck'] as const;
export const InjurySchema = z.enum(INJURIES);
export type Injury = z.infer<typeof InjurySchema>;

export const DIET_TAGS = [
  'halal',
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
  'low_carb',
  'high_protein',
  'gluten_free',
  'dairy_free',
] as const;
export const DietTagSchema = z.enum(DIET_TAGS);
export type DietTag = z.infer<typeof DietTagSchema>;

export const ALLERGENS = ['dairy', 'egg', 'gluten', 'nuts', 'peanut', 'soy', 'fish', 'shellfish', 'sesame'] as const;
export const AllergenSchema = z.enum(ALLERGENS);
export type Allergen = z.infer<typeof AllergenSchema>;

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
] as const;
export const CuisineSchema = z.enum(CUISINES);
export type Cuisine = z.infer<typeof CuisineSchema>;

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const MealSlotSchema = z.enum(MEAL_SLOTS);
export type MealSlot = z.infer<typeof MealSlotSchema>;

/** Main protein source of a recipe ('none' = no dominant source; exempt from the once-a-day rule). */
export const PROTEIN_SOURCES = [
  'chicken',
  'turkey',
  'beef',
  'lamb',
  'goat',
  'fish',
  'shellfish',
  'egg',
  'dairy',
  'tofu',
  'tempeh',
  'seitan',
  'legumes',
  'protein_powder',
  'mixed',
  'none',
] as const;
export const ProteinSourceSchema = z.enum(PROTEIN_SOURCES);
export type ProteinSource = z.infer<typeof ProteinSourceSchema>;

export const GOALS = ['fat_loss', 'muscle_gain', 'recomp', 'maintain'] as const;
export const GoalSchema = z.enum(GOALS);
export type Goal = z.infer<typeof GoalSchema>;

export const SEXES = ['male', 'female'] as const;
export const SexSchema = z.enum(SEXES);
export type Sex = z.infer<typeof SexSchema>;

export const EXPERIENCE = ['beginner', 'intermediate', 'advanced'] as const;
export const ExperienceSchema = z.enum(EXPERIENCE);
export type Experience = z.infer<typeof ExperienceSchema>;

export const DIET_TYPES = ['omnivore', 'halal', 'vegetarian', 'vegan', 'pescatarian', 'keto'] as const;
export const DietTypeSchema = z.enum(DIET_TYPES);
export type DietType = z.infer<typeof DietTypeSchema>;

export const LIFESTYLES = ['sedentary', 'light', 'moderate', 'active'] as const;
export const LifestyleSchema = z.enum(LIFESTYLES);
export type Lifestyle = z.infer<typeof LifestyleSchema>;

export const SPLIT_TYPES = ['full_body', 'upper_lower', 'ppl', 'ppl_ul'] as const;
export const SplitTypeSchema = z.enum(SPLIT_TYPES);
export type SplitType = z.infer<typeof SplitTypeSchema>;

export const SET_TYPES = ['warmup', 'working', 'drop', 'failure', 'cardio'] as const;
export const SetTypeSchema = z.enum(SET_TYPES);
export type SetType = z.infer<typeof SetTypeSchema>;

// ---------------------------------------------------------------------------
// Catalogue items
// ---------------------------------------------------------------------------

/** Stable slug id: lowercase letters, digits, underscores and dashes. */
export const SlugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'id must be a lowercase slug');

export const ExerciseSchema = z
  .object({
    id: SlugSchema,
    name: z.string().min(2).max(80),
    aliases: z.array(z.string().min(1)).default([]),
    pattern: PatternSchema,
    primaryMuscles: z.array(MuscleSchema).min(1),
    secondaryMuscles: z.array(MuscleSchema).default([]),
    /** Everything required to perform it (all must be available). 'bodyweight' = nothing needed. */
    equipment: z.array(EquipmentSchema).min(1),
    /** Difficulty 1–3 (sheet 29). Beginners get level ≤ 2. */
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    unilateral: z.boolean(),
    /** Cloudinary public_id (sheet 29: /exercises/{id}). */
    mediaId: z.string().min(1),
    /** Body areas this exercise loads; excluded when the user reports that injury. */
    contraindications: z.array(InjurySchema).default([]),
    /** Optional override; derived from pattern when omitted (isolation/core/cardio/carry → false). */
    compound: z.boolean().optional(),
    /** MET value for cardio kcal (RW-24). */
    met: z.number().positive().max(25).optional(),
    steps: z.array(z.string().min(1)).min(3).max(6),
    tips: z.array(z.string().min(1)).min(2).max(4),
    source: z.string().min(1),
    licence: z.string().min(1),
  })
  .superRefine((ex, ctx) => {
    const overlap = ex.primaryMuscles.filter((m) => ex.secondaryMuscles.includes(m));
    if (overlap.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `muscle both primary and secondary: ${overlap.join(',')}` });
    }
    if (ex.pattern === 'cardio' && ex.met === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cardio exercises need a met value' });
    }
  });
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseInput = z.input<typeof ExerciseSchema>;

export const IngredientSchema = z.object({
  /** Stable ingredient key used for grocery re-use and dislikes (e.g. 'chicken_breast'). */
  id: SlugSchema,
  name: z.string().min(1),
  grams: z.number().positive().max(2000),
  /** USDA FoodData Central id; nutrition is computed from it, never typed by hand. */
  fdcId: z.number().int().positive().optional(),
  aisle: z.string().min(1).optional(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const MacrosSchema = z.object({
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  fibre: z.number().nonnegative().default(0),
});
export type PerServing = z.infer<typeof MacrosSchema>;

export const RecipeSchema = z
  .object({
    id: SlugSchema,
    name: z.string().min(2).max(100),
    cuisine: CuisineSchema,
    slots: z.array(MealSlotSchema).min(1),
    dietTags: z.array(DietTagSchema).default([]),
    /** Must list every allergen present (double-checked by a second reviewer). */
    allergens: z.array(AllergenSchema).default([]),
    proteinSource: ProteinSourceSchema,
    ingredients: z.array(IngredientSchema).min(1),
    perServing: MacrosSchema,
    /** Total active + cook time in minutes. */
    prepMin: z.number().int().min(0).max(600),
    /** 1 = budget, 2 = mid, 3 = premium. */
    costTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Portion multiplier bounds for the portion solver. */
    scalable: z
      .object({ min: z.number().positive(), max: z.number().positive() })
      .default({ min: 0.5, max: 3 }),
    steps: z.array(z.string().min(1)).default([]),
    imageId: z.string().min(1).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.scalable.min > r.scalable.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'scalable.min > scalable.max' });
    }
    const { kcal, protein, carbs, fat } = r.perServing;
    const fromMacros = 4 * protein + 4 * carbs + 9 * fat;
    if (Math.abs(fromMacros - kcal) > Math.max(25, kcal * 0.12)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `perServing.kcal ${kcal} disagrees with macros (${Math.round(fromMacros)})`,
      });
    }
    if (r.dietTags.includes('vegan') && r.allergens.some((a) => a === 'dairy' || a === 'egg' || a === 'fish' || a === 'shellfish')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'vegan recipe lists an animal allergen' });
    }
    const ids = new Set<string>();
    for (const ing of r.ingredients) {
      if (ids.has(ing.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate ingredient ${ing.id}` });
      ids.add(ing.id);
    }
  });
export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeInput = z.input<typeof RecipeSchema>;

function uniqueIds<T extends { id: string }>(items: T[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  items.forEach((it, i) => {
    if (seen.has(it.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'id'], message: `duplicate id ${it.id}` });
    seen.add(it.id);
  });
}

/** exercises.json = an array of exercises with unique ids. */
export const ExerciseCatalogueSchema = z.array(ExerciseSchema).superRefine(uniqueIds);
/** recipes.json = an array of recipes with unique ids. */
export const RecipeCatalogueSchema = z.array(RecipeSchema).superRefine(uniqueIds);

// ---------------------------------------------------------------------------
// Profile + history (engine inputs; compact, no names/emails)
// ---------------------------------------------------------------------------

export const ISODateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const ProfileSchema = z.object({
  goal: GoalSchema,
  sex: SexSchema,
  birthYear: z.number().int().min(1900).max(2100),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(300),
  targetKg: z.number().min(30).max(300).optional(),
  experience: ExperienceSchema,
  daysPerWeek: z.number().int().min(2).max(6),
  /** Preferred training weekdays, 0 = Monday … 6 = Sunday. Length should equal daysPerWeek. */
  trainingWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  sessionMin: z.number().int().min(20).max(180),
  splitPreference: SplitTypeSchema.optional(),
  equipment: z.array(EquipmentSchema).default([]),
  injuries: z.array(InjurySchema).default([]),
  lifestyle: LifestyleSchema.default('light'),
  dietType: DietTypeSchema.default('omnivore'),
  allergies: z.array(AllergenSchema).default([]),
  /** Ingredient ids or names the user dislikes (case-insensitive match). */
  dislikes: z.array(z.string()).default([]),
  cuisines: z.array(CuisineSchema).default([]),
  /** Max cost tier 1–3. */
  budget: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  /** Max cooking time per meal in minutes. */
  cookMin: z.number().int().min(5).max(240).default(30),
  mealsPerDay: z.number().int().min(2).max(6).default(3),
  units: z.enum(['metric', 'imperial']).default('metric'),
  pregnant: z.boolean().default(false),
});
export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileInput = z.input<typeof ProfileSchema>;

export const SetLogSchema = z.object({
  exerciseId: z.string(),
  /** Epoch ms when the set was done. */
  doneAt: z.number(),
  type: SetTypeSchema.default('working'),
  weightKg: z.number().min(0).default(0),
  reps: z.number().int().min(0).default(0),
  rpe: z.number().min(1).max(10).optional(),
});
export type SetLog = z.infer<typeof SetLogSchema>;

export const PastSessionSchema = z.object({
  date: ISODateSchema,
  exerciseIds: z.array(z.string()),
  /** Exercise id → pattern key it filled (for the consecutive-variant rule). Optional. */
  patternKeys: z.array(z.string()).optional(),
  mainExerciseIds: z.array(z.string()).optional(),
  templateKey: z.string().optional(),
  fingerprint: z.string().optional(),
  deload: z.boolean().optional(),
});
export type PastSession = z.infer<typeof PastSessionSchema>;

export const PastMealSchema = z.object({
  date: ISODateSchema,
  slot: MealSlotSchema,
  recipeId: z.string(),
});
export type PastMeal = z.infer<typeof PastMealSchema>;

export const WeighInSchema = z.object({ date: ISODateSchema, kg: z.number().min(20).max(400) });
export type WeighIn = z.infer<typeof WeighInSchema>;

export const BlockStateSchema = z.object({
  /** Monday of the block's first week. */
  startDate: ISODateSchema,
  blockNo: z.number().int().min(1),
  /** slotKey → exercise id of the main lift held for this block. */
  mainLifts: z.record(z.string(), z.string()),
  lastDeloadWeekStart: ISODateSchema.optional(),
});
export type BlockState = z.infer<typeof BlockStateSchema>;

export const SignalsSchema = z.object({
  neverShow: z.array(z.string()).default([]),
  moreLike: z.array(z.string()).default([]),
});
export type Signals = z.infer<typeof SignalsSchema>;

export const HistorySchema = z.object({
  sessions: z.array(PastSessionSchema).default([]),
  sets: z.array(SetLogSchema).default([]),
  meals: z.array(PastMealSchema).default([]),
  weights: z.array(WeighInSchema).default([]),
  block: BlockStateSchema.optional(),
  signals: SignalsSchema.default({ neverShow: [], moreLike: [] }),
});
export type History = z.infer<typeof HistorySchema>;
export type HistoryInput = z.input<typeof HistorySchema>;

// ---------------------------------------------------------------------------
// LLM variety hook I/O (sheet 28 output schemas; IDs only)
// ---------------------------------------------------------------------------

export const LlmWorkoutOutputSchema = z.object({
  sessions: z.array(
    z.object({
      day: ISODateSchema,
      title: z.string().min(1).max(80),
      items: z
        .array(
          z.object({
            exercise_id: z.string(),
            sets: z.number().int().min(1).max(8),
            reps: z.number().int().min(1).max(30),
            rest_s: z.number().int().min(15).max(600),
          }),
        )
        .min(1)
        .max(12),
    }),
  ),
});
export type LlmWorkoutOutput = z.infer<typeof LlmWorkoutOutputSchema>;

export const LlmMealsOutputSchema = z.object({
  days: z.array(
    z.object({
      date: ISODateSchema,
      meals: z.array(z.object({ slot: MealSlotSchema, recipe_id: z.string() })).min(1).max(8),
    }),
  ),
});
export type LlmMealsOutput = z.infer<typeof LlmMealsOutputSchema>;
