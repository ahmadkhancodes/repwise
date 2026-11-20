import { z } from 'zod';

import {
  ALLERGENS,
  CUISINES,
  DIET_TAGS,
  EQUIPMENT,
  MUSCLES,
  PATTERN_FAMILIES,
  PATTERNS,
} from './enums';

export { ALLERGENS, CUISINES, DIET_TAGS, EQUIPMENT, MUSCLES, PATTERN_FAMILIES, PATTERNS };

/* ------------------------------------------------------------------ */
/* Shared enums                                                        */
/* ------------------------------------------------------------------ */

export const Allergen = z.enum(ALLERGENS);
export type Allergen = z.infer<typeof Allergen>;

const kebabId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be stable kebab-case');

/* ------------------------------------------------------------------ */
/* Exercises                                                           */
/* ------------------------------------------------------------------ */

export const PatternFamily = z.enum(PATTERN_FAMILIES);
export type PatternFamily = z.infer<typeof PatternFamily>;

export const Pattern = z.enum(Object.keys(PATTERNS) as [keyof typeof PATTERNS, ...(keyof typeof PATTERNS)[]]);
export type Pattern = z.infer<typeof Pattern>;

export const Muscle = z.enum(MUSCLES);
export type Muscle = z.infer<typeof Muscle>;

export const Equipment = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof Equipment>;

export const Level = z.enum(['beginner', 'intermediate', 'advanced']);
export type Level = z.infer<typeof Level>;

export const Contraindication = z.enum([
  'shoulder',
  'elbow',
  'wrist',
  'neck',
  'lower_back',
  'hip',
  'knee',
  'ankle',
]);
export type Contraindication = z.infer<typeof Contraindication>;

const shortLine = z.string().trim().min(3).max(160);

export const ExerciseSchema = z
  .object({
    id: kebabId,
    name: z.string().min(2).max(60),
    aliases: z.array(z.string().min(2)).default([]),
    pattern: Pattern,
    patternFamily: PatternFamily,
    primaryMuscles: z.array(Muscle).min(1),
    secondaryMuscles: z.array(Muscle),
    /** Everything needed; the exercise is available only when the user has ALL of it. */
    equipment: z.array(Equipment).min(1),
    level: Level,
    unilateral: z.boolean(),
    mechanics: z.enum(['compound', 'isolation']),
    /**
     * Metabolic equivalent from the 2024 Adult Compendium of Physical Activities (code cited in
     * SOURCES.md). Required for cardio (calorie estimate RW-24), absent elsewhere.
     */
    met: z.number().positive().max(25).optional(),
    contraindications: z.array(Contraindication),
    instructions: z.array(shortLine).min(3).max(5),
    cues: z.array(shortLine).min(2).max(4),
    commonMistakes: z.array(shortLine).min(2).max(4),
    /**
     * Cloudinary public id (`repwise/exercises/<id>`, start frame; `<id>-end` is the end frame).
     * Stable forever. Whether a licensed demo exists is in media/exercises-with-media.json
     * (`exerciseHasMedia`), not here.
     */
    mediaId: z.string().regex(/^repwise\/exercises\/[a-z0-9-]+$/),
    alternatives: z.array(kebabId).min(1).max(5),
    source: z.literal('repwise-original'),
    licence: z.literal('proprietary'),
  })
  .strict()
  .superRefine((ex, ctx) => {
    if (PATTERNS[ex.pattern] !== ex.patternFamily) {
      ctx.addIssue({ code: 'custom', message: `patternFamily must be ${PATTERNS[ex.pattern]} for ${ex.pattern}` });
    }
    if (ex.mediaId !== `repwise/exercises/${ex.id}`) {
      ctx.addIssue({ code: 'custom', message: 'mediaId must equal repwise/exercises/<id>' });
    }
    if (ex.pattern === 'cardio' && ex.met === undefined) {
      ctx.addIssue({ code: 'custom', message: 'cardio exercises need a met value (Compendium of Physical Activities)' });
    }
    if (ex.alternatives.includes(ex.id)) {
      ctx.addIssue({ code: 'custom', message: 'an exercise cannot be its own alternative' });
    }
    if (ex.primaryMuscles.some((m) => ex.secondaryMuscles.includes(m))) {
      ctx.addIssue({ code: 'custom', message: 'a muscle cannot be both primary and secondary' });
    }
  });
export type Exercise = z.infer<typeof ExerciseSchema>;

/* ------------------------------------------------------------------ */
/* Foods                                                               */
/* ------------------------------------------------------------------ */

export const FoodCategory = z.enum([
  'poultry',
  'meat',
  'seafood',
  'eggs',
  'dairy',
  'legumes',
  'plant_protein',
  'grains',
  'bread_pasta',
  'vegetables',
  'fruit',
  'nuts_seeds',
  'fats',
  'condiments',
  'sweeteners',
  'herbs_spices',
]);
export type FoodCategory = z.infer<typeof FoodCategory>;

/** Animal origin, used to derive diet tags. */
export const FoodOrigin = z.enum(['plant', 'dairy', 'egg', 'honey', 'fish', 'shellfish', 'poultry', 'meat', 'pork']);
export type FoodOrigin = z.infer<typeof FoodOrigin>;

const grams = z.number().min(0).max(100);

export const FoodSchema = z
  .object({
    id: kebabId,
    name: z.string().min(2),
    category: FoodCategory,
    origin: FoodOrigin,
    per100g: z
      .object({
        kcal: z.number().int().min(0).max(900),
        protein: grams,
        carbs: grams,
        fat: grams,
        fibre: grams,
      })
      .strict(),
    allergens: z.array(Allergen),
    source: z
      .object({
        dataset: z.string().min(5),
        fdcId: z.number().int().positive(),
        description: z.string().min(3),
        licence: z.literal('Public domain (CC0 1.0)'),
      })
      .strict(),
  })
  .strict();
export type Food = z.infer<typeof FoodSchema>;

/* ------------------------------------------------------------------ */
/* Recipes                                                             */
/* ------------------------------------------------------------------ */

export const Cuisine = z.enum(CUISINES);
export type Cuisine = z.infer<typeof Cuisine>;

export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealSlot = z.infer<typeof MealSlot>;

export const DietTag = z.enum(DIET_TAGS);
export type DietTag = z.infer<typeof DietTag>;

export const ProteinSource = z.enum([
  'chicken',
  'turkey',
  'beef',
  'lamb',
  'goat',
  'pork',
  'fish',
  'shellfish',
  'eggs',
  'dairy',
  'legumes',
  'soy',
  'nuts_seeds',
  'grains',
  'other',
]);
export type ProteinSource = z.infer<typeof ProteinSource>;

export const Macros = z
  .object({
    kcal: z.number().int().min(0),
    protein: z.number().min(0),
    carbs: z.number().min(0),
    fat: z.number().min(0),
    fibre: z.number().min(0),
  })
  .strict();
export type Macros = z.infer<typeof Macros>;

export const RecipeIngredient = z
  .object({
    foodId: kebabId,
    /** Grams for the WHOLE recipe (all servings), as purchased/uncooked unless the food says otherwise. */
    grams: z.number().positive().max(3000),
    note: z.string().min(2).max(60).optional(),
  })
  .strict();
export type RecipeIngredient = z.infer<typeof RecipeIngredient>;

export const RecipeSchema = z
  .object({
    id: kebabId,
    title: z.string().min(3).max(70),
    cuisine: Cuisine,
    slots: z.array(MealSlot).min(1),
    servings: z.number().int().min(1).max(8),
    prepMin: z.number().int().min(0).max(240),
    cookMin: z.number().int().min(0).max(360),
    /** 1 = budget, 2 = mid, 3 = premium (per serving, relative). */
    costTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Portion multiplier range for the portion solver. */
    scalable: z.object({ min: z.number().min(0.25).max(1), max: z.number().min(1).max(3) }).strict(),
    ingredients: z.array(RecipeIngredient).min(2),
    steps: z.array(z.string().trim().min(8).max(240)).min(2).max(8),
    /**
     * Cloudinary public id of the recipe photo. Present ONLY when a photo exists
     * (docs/MEDIA_STATUS.md); absent → the app shows the designed placeholder
     * and makes no request. Optional since 19 Nov 2026 (older data with a placeholder id still parses).
     */
    mediaId: z.string().regex(/^repwise\/recipes\/[a-z0-9-]+$/).optional(),
    source: z.literal('repwise-original'),
    licence: z.literal('proprietary'),
    /* ---- Computed by scripts/build.ts — never edit by hand ---- */
    perServing: Macros,
    allergens: z.array(Allergen),
    dietTags: z.array(DietTag),
    mainProtein: ProteinSource,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.mediaId !== undefined && r.mediaId !== `repwise/recipes/${r.id}`) {
      ctx.addIssue({ code: 'custom', message: 'mediaId must equal repwise/recipes/<id>' });
    }
    const ids = r.ingredients.map((i) => i.foodId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate ingredient in recipe' });
    }
  });
export type Recipe = z.infer<typeof RecipeSchema>;

/** Fields the build computes; everything else in a recipe is authored. */
export const COMPUTED_RECIPE_FIELDS = ['perServing', 'allergens', 'dietTags', 'mainProtein'] as const;

export const ExercisesFile = z.array(ExerciseSchema);
export const FoodsFile = z.array(FoodSchema);
export const RecipesFile = z.array(RecipeSchema);
