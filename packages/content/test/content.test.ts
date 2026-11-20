import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CUISINES,
  DIET_TAGS,
  ExercisesFile,
  FoodsFile,
  MEAL_SLOTS_SANITY,
  PATTERN_FAMILIES,
  PATTERNS,
  RecipesFile,
  atwaterKcal,
  deriveRecipe,
  exercises,
  foods,
  indexFoods,
  recipes,
  type Pattern,
} from './helpers';

const foodIndex = indexFoods(foods);
const BANNED = /\b(cure[sd]?|curing|treat(s|ing|ment)?|diagnos\w*|prescri\w*)\b/i;

describe('schemas', () => {
  it('every file passes its zod schema', () => {
    ExercisesFile.parse(exercises);
    FoodsFile.parse(foods);
    RecipesFile.parse(recipes);
  });

  it('meets the catalogue size targets', () => {
    assert.ok(exercises.length >= 220, `exercises: ${exercises.length}`);
    assert.ok(recipes.length >= 600, `recipes: ${recipes.length}`);
    assert.ok(foods.length >= 290, `foods: ${foods.length}`);
  });
});

describe('referential integrity', () => {
  for (const [name, ids] of [
    ['exercises', exercises.map((e) => e.id)],
    ['recipes', recipes.map((r) => r.id)],
    ['foods', foods.map((f) => f.id)],
  ] as const) {
    it(`${name} have no duplicate ids`, () => {
      assert.equal(new Set(ids).size, ids.length);
    });
  }

  it('every recipe ingredient references foods.json', () => {
    for (const r of recipes) for (const i of r.ingredients) assert.ok(foodIndex.has(i.foodId), `${r.id} → ${i.foodId}`);
  });

  it('every exercise alternative exists and shares the movement pattern', () => {
    const byId = new Map(exercises.map((e) => [e.id, e]));
    for (const e of exercises) {
      for (const alt of e.alternatives) {
        const other = byId.get(alt);
        assert.ok(other, `${e.id} → missing ${alt}`);
        assert.equal(other.pattern, e.pattern, `${e.id} → ${alt} has a different pattern`);
      }
    }
  });
});

describe('exercise QA', () => {
  const byPattern = new Map<Pattern, number>();
  for (const e of exercises) byPattern.set(e.pattern, (byPattern.get(e.pattern) ?? 0) + 1);

  it('every movement pattern has 6–20 variants (sheet 28 uniqueness rule)', () => {
    for (const p of Object.keys(PATTERNS) as Pattern[]) {
      const n = byPattern.get(p) ?? 0;
      assert.ok(n >= 6 && n <= 20, `${p}: ${n} variants`);
    }
  });

  it('covers every bible pattern family', () => {
    const families = new Set(exercises.map((e) => e.patternFamily));
    for (const f of PATTERN_FAMILIES) assert.ok(families.has(f), f);
  });

  it('every strength pattern has a home-friendly variant (bodyweight, band, dumbbell, bench)', () => {
    const home = new Set(['bodyweight', 'band', 'dumbbell', 'bench', 'mat', 'kettlebell']);
    for (const p of ['squat', 'hinge', 'lunge', 'push_h', 'push_v', 'pull_h', 'pull_v', 'carry'] as Pattern[]) {
      assert.ok(
        exercises.some((e) => e.pattern === p && e.equipment.every((q) => home.has(q))),
        `${p} has no home-friendly variant`,
      );
    }
  });

  it('bodyweight-only and home-dumbbell kits cover every split slot with ≥ 2 variants (D34)', () => {
    const kits: Record<string, ReadonlySet<string>> = {
      bodyweight: new Set(['bodyweight', 'mat']),
      homeDumbbells: new Set(['bodyweight', 'mat', 'dumbbell', 'bench', 'band']),
    };
    const slots: [string, (e: (typeof exercises)[number]) => boolean][] = [
      ...(['squat', 'hinge', 'lunge', 'push_h', 'push_v', 'pull_h', 'pull_v'] as Pattern[]).map(
        (p) => [p, (e: (typeof exercises)[number]) => e.pattern === p] as [string, (e: (typeof exercises)[number]) => boolean],
      ),
      ...(['side_delts', 'rear_delts', 'biceps', 'triceps', 'chest', 'calves', 'quads', 'hamstrings', 'glutes'] as const).map(
        (m) => [`isolation:${m}`, (e: (typeof exercises)[number]) => e.patternFamily === 'isolation' && e.primaryMuscles[0] === m] as [string, (e: (typeof exercises)[number]) => boolean],
      ),
    ];
    for (const [kit, has] of Object.entries(kits)) {
      const pool = exercises.filter((e) => e.equipment.every((q) => has.has(q)));
      for (const [slot, fits] of slots) {
        const n = pool.filter(fits).length;
        assert.ok(n >= 2, `${kit} ${slot}: ${n} variant(s)`);
      }
    }
  });

  it('has media ids, muscles, equipment and no empty or banned text', () => {
    for (const e of exercises) {
      assert.equal(e.mediaId, `repwise/exercises/${e.id}`);
      assert.ok(e.primaryMuscles.length && e.equipment.length, e.id);
      for (const line of [...e.instructions, ...e.cues, ...e.commonMistakes]) {
        assert.ok(line.trim().length >= 3, `${e.id}: empty line`);
        assert.ok(!BANNED.test(line), `${e.id}: banned wording "${line}"`);
      }
    }
  });
});

describe('recipe QA', () => {
  it('every diet tag has at least 10 recipes', () => {
    for (const t of DIET_TAGS) {
      const n = recipes.filter((r) => r.dietTags.includes(t)).length;
      assert.ok(n >= 10, `${t}: ${n}`);
    }
  });

  it('every cuisine has at least 10 recipes', () => {
    for (const c of CUISINES) {
      const n = recipes.filter((r) => r.cuisine === c).length;
      assert.ok(n >= 10, `${c}: ${n}`);
    }
  });

  it('every meal slot has at least 30 recipes', () => {
    for (const s of Object.keys(MEAL_SLOTS_SANITY) as (keyof typeof MEAL_SLOTS_SANITY)[]) {
      const n = recipes.filter((r) => r.slots.includes(s)).length;
      assert.ok(n >= 30, `${s}: ${n}`);
    }
  });

  it('stored macros, allergens, tags and main protein equal the computed values', () => {
    for (const r of recipes) {
      const d = deriveRecipe(r, foodIndex);
      assert.deepEqual(r.perServing, d.perServing, `${r.id}: stale perServing — run npm run build`);
      assert.deepEqual(r.allergens, d.allergens, `${r.id}: stale allergens`);
      assert.deepEqual(r.dietTags, d.dietTags, `${r.id}: stale dietTags`);
      assert.equal(r.mainProtein, d.mainProtein, `${r.id}: stale mainProtein`);
    }
  });

  it('macros are sane: kcal ≈ 4P + 4C + 9F within 8%', () => {
    for (const r of recipes) {
      const est = atwaterKcal(r.perServing);
      const dev = Math.abs(r.perServing.kcal - est) / est;
      assert.ok(dev <= 0.08, `${r.id}: ${r.perServing.kcal} kcal vs ${est.toFixed(0)} (${(dev * 100).toFixed(1)}%)`);
    }
  });

  it('per-serving energy fits the slot', () => {
    for (const r of recipes) {
      for (const s of r.slots) {
        const [lo, hi] = MEAL_SLOTS_SANITY[s];
        assert.ok(r.perServing.kcal >= lo && r.perServing.kcal <= hi, `${r.id} (${s}): ${r.perServing.kcal} kcal`);
      }
      assert.ok(r.perServing.protein > 0 && r.perServing.carbs >= 0 && r.perServing.fat > 0, r.id);
    }
  });

  it('every ingredient allergen propagates to the recipe', () => {
    for (const r of recipes) {
      for (const i of r.ingredients) {
        for (const a of foodIndex.get(i.foodId)!.allergens) {
          assert.ok(r.allergens.includes(a), `${r.id}: ${i.foodId} brings ${a}`);
        }
      }
    }
  });

  it('diet tags never contradict the ingredients', () => {
    const origins = (r: (typeof recipes)[number]) => r.ingredients.map((i) => foodIndex.get(i.foodId)!.origin);
    for (const r of recipes) {
      const o = origins(r);
      if (r.dietTags.includes('vegan')) assert.ok(o.every((x) => x === 'plant'), `${r.id}: not vegan`);
      if (r.dietTags.includes('vegetarian'))
        assert.ok(o.every((x) => ['plant', 'dairy', 'egg', 'honey'].includes(x)), `${r.id}: not vegetarian`);
      if (r.dietTags.includes('pescatarian'))
        assert.ok(!o.some((x) => ['meat', 'poultry', 'pork'].includes(x)), `${r.id}: not pescatarian`);
      if (r.dietTags.includes('halal_friendly')) assert.ok(!o.includes('pork'), `${r.id}: contains pork`);
      if (r.dietTags.includes('gluten_free')) assert.ok(!r.allergens.includes('gluten'), `${r.id}: gluten`);
      if (r.dietTags.includes('dairy_free')) assert.ok(!r.allergens.includes('milk'), `${r.id}: milk`);
    }
  });

  it('has no empty steps and no banned wording', () => {
    for (const r of recipes) {
      assert.ok(r.steps.length >= 2, r.id);
      for (const s of r.steps) {
        assert.ok(s.trim().length >= 8, `${r.id}: empty step`);
        assert.ok(!BANNED.test(s), `${r.id}: banned wording "${s}"`);
      }
      // mediaId only when a photo exists (docs/MEDIA_STATUS.md); never a dangling placeholder.
      if (r.mediaId !== undefined) assert.equal(r.mediaId, `repwise/recipes/${r.id}`);
    }
  });
});

describe('food QA', () => {
  it('every food cites a USDA FoodData Central record', () => {
    for (const f of foods) {
      assert.match(f.source.dataset, /^USDA FoodData Central/);
      assert.ok(f.source.fdcId > 0, f.id);
    }
  });

  it('macro grams per 100 g never exceed 100 g', () => {
    for (const f of foods) {
      const { protein, carbs, fat } = f.per100g;
      assert.ok(protein + carbs + fat <= 101, `${f.id}: ${protein + carbs + fat} g`);
    }
  });
});
