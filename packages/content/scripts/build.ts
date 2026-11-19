/**
 * Content build.
 *   npm run build   → recompute recipe nutrition/allergens/diet tags/main protein and write recipes.json
 *   npm run verify  → same checks, but fail if recipes.json is stale (used in CI / npm run check)
 *
 * Also checks referential integrity: ingredient ids exist, exercise alternatives exist,
 * no duplicate ids, every file passes its zod schema.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveRecipe, indexFoods } from '../src/compute';
import { COMPUTED_RECIPE_FIELDS, ExercisesFile, FoodsFile, RecipesFile } from '../src/schemas';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const errors: string[] = [];

const readJson = (name: string): unknown => JSON.parse(readFileSync(join(root, name), 'utf8'));

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

/* ---- foods ---- */
const foods = FoodsFile.parse(readJson('foods.json'));
for (const d of dupes(foods.map((f) => f.id))) errors.push(`foods: duplicate id ${d}`);
const foodIndex = indexFoods(foods);

/* ---- exercises ---- */
const exercises = ExercisesFile.parse(readJson('exercises.json'));
const exerciseIds = new Set(exercises.map((e) => e.id));
for (const d of dupes(exercises.map((e) => e.id))) errors.push(`exercises: duplicate id ${d}`);
for (const ex of exercises) {
  for (const alt of ex.alternatives) {
    if (!exerciseIds.has(alt)) errors.push(`exercises: ${ex.id} → unknown alternative ${alt}`);
  }
}

/* ---- recipes ---- */
type RawRecipe = Record<string, unknown> & {
  id: string;
  servings: number;
  slots: never;
  ingredients: { foodId: string; grams: number }[];
};
const raw = readJson('recipes.json') as RawRecipe[];
for (const d of dupes(raw.map((r) => r.id))) errors.push(`recipes: duplicate id ${d}`);

let stale = 0;
const built = raw.map((r) => {
  for (const ing of r.ingredients) {
    if (!foodIndex.has(ing.foodId)) errors.push(`recipes: ${r.id} → unknown food ${ing.foodId}`);
  }
  if (r.ingredients.some((i) => !foodIndex.has(i.foodId))) return r;
  const derived = deriveRecipe(r, foodIndex);
  const authored = Object.fromEntries(
    Object.entries(r).filter(([k]) => !(COMPUTED_RECIPE_FIELDS as readonly string[]).includes(k)),
  );
  const next = { ...authored, ...derived };
  if (JSON.stringify(next) !== JSON.stringify(r)) stale++;
  return next;
});

const recipes = RecipesFile.safeParse(built);
if (!recipes.success) {
  for (const issue of recipes.error.issues.slice(0, 20)) {
    errors.push(`recipes: ${issue.path.join('.')} ${issue.message}`);
  }
}

if (errors.length) {
  console.error(`Content build failed with ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

if (write) {
  writeFileSync(join(root, 'recipes.json'), `${JSON.stringify(built, null, 2)}\n`);
  console.log(`recipes.json written (${stale} recipe(s) updated).`);
} else if (stale) {
  console.error(`${stale} recipe(s) have stale computed fields. Run: npm run build`);
  process.exit(1);
}

console.log(`OK: ${exercises.length} exercises, ${recipes.success ? recipes.data.length : 0} recipes, ${foods.length} foods.`);
