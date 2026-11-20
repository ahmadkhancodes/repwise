/**
 * Automated content QA added with the 600-recipe expansion (docs/CONTENT_QA.md):
 * allergen keyword mapping, food-level macro sanity, orphan foods, near-duplicates and catalogue balance.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALLERGENS, atwaterKcal, foods, recipes, type Allergen, type Food } from './helpers';

/**
 * Words that imply an allergen when they appear in a food's id, name or USDA description.
 * `not` lists look-alikes that must not trigger the rule (coconut is not a tree nut under EU FIC,
 * buckwheat is not wheat, plant "milks" are not dairy, peanut butter is not butter, and so on).
 */
const ALLERGEN_KEYWORDS: Record<Allergen, { words: RegExp; not?: RegExp }> = {
  celery: { words: /\bcelery\b|\bstock\b|\bbroth\b/ },
  gluten: {
    words: /\bwheat\b|\bbarley\b|\brye\b|\boat(s|cakes)?\b|\bbulgur\b|\bcouscous\b|\bsemolina\b|\bseitan\b|\bgluten\b|\bbread(crumbs)?\b|\bbagels?\b|\bmuffins?\b|\bnaan\b|\bpita\b|\bchapati\b|\bpasta\b|\bnoodles\b|\bsoba\b|\bgranola\b|\bsoy sauce\b|\bshoyu\b|\bteriyaki\b|\bhoisin\b|\btortillas?\b/,
    not: /\bbuckwheat groats\b|\brice noodles\b|\btortillas?[^.]*\bcorn\b/,
  },
  crustaceans: { words: /\bprawns?\b|\bshrimp\b|\bcrab\b|\bcrustaceans\b|\blobster\b/ },
  eggs: { words: /\beggs?\b|\bmayonnaise\b/ },
  fish: {
    words: /\bfish\b|\bsalmon\b|\btuna\b|\bcod\b|\bhaddock\b|\bmackerel\b|\bsardines?\b|\btilapia\b|\btrout\b|\bsea bass\b|\banchov\w+\b|\bworcestershire\b/,
  },
  lupin: { words: /\blupin\b/ },
  milk: {
    words: /\bmilk\b|\bcheese\b|\bcheddar\b|\bfeta\b|\bmozzarella\b|\bparmesan\b|\bpaneer\b|\bricotta\b|\byogurt\b|\bkefir\b|\bcream\b|\bbutter\b|\bghee\b|\bwhey\b/,
    not: /\b(almond|soy|coconut) ?milk\b|\bsoymilk\b|\bsoy yogurt\b|\b(peanut|almond|sesame) butter\b|\bbutternut\b/,
  },
  molluscs: { words: /\bmussels?\b|\bsquid\b|\boysters?\b|\bmollusks\b|\bclams?\b/ },
  mustard: { words: /\bmustard\b/ },
  nuts: {
    words: /\balmonds?\b|\bwalnuts?\b|\bcashews?\b|\bpistachios?\b|\bhazelnuts?\b|\bpecans?\b|\bmacadamias?\b|\bpine nuts\b|\bpesto\b/,
  },
  peanuts: { words: /\bpeanuts?\b/ },
  sesame: { words: /\bsesame\b|\btahini\b|\bhummus\b/ },
  soybeans: { words: /\bsoy\b|\bsoya\b|\bsoymilk\b|\btofu\b|\btempeh\b|\bedamame\b|\bmiso\b/ },
  sulphites: { words: /\bvinegar\b|\bsulfured\b|\bsun-dried\b/ },
};

/**
 * Allergens a food carries that no keyword explains: conservative flags for composite products
 * (see SOURCES.md and docs/CONTENT_QA.md). A new entry here needs a reason.
 */
const COMPOSITE_FLAGS: Record<string, Allergen[]> = {
  'curry-powder': ['mustard'], // blends often contain mustard
  'dark-chocolate': ['milk', 'soybeans'], // may contain milk; soy lecithin
  'beef-jerky': ['gluten', 'soybeans'], // soy sauce marinade
  granola: ['nuts'], // USDA homemade granola includes almonds
  kimchi: ['crustaceans', 'fish'], // fish sauce and salted shrimp
  ketchup: ['celery'], // spice extracts
  miso: ['gluten'], // barley miso
  naan: ['eggs', 'milk'], // enriched dough
  'english-muffin': ['milk'],
  'oyster-sauce': ['gluten', 'soybeans'],
  hoisin: ['sesame', 'soybeans'], // fermented soybean paste, sesame
  worcestershire: ['gluten'], // barley malt vinegar
  sriracha: ['sulphites'],
  'mustard-greens': ['mustard'],
  oatcakes: ['gluten'], // rye crispbread record
  tvp: ['soybeans'],
  pesto: ['milk'], // hard cheese
  teriyaki: ['soybeans'], // soy sauce base
  mayonnaise: ['mustard'], // common ingredient
};

const text = (f: Food) => `${f.id.replace(/-/g, ' ')} | ${f.name} | ${f.source.description}`.toLowerCase();

describe('allergen keyword mapping', () => {
  it('every allergen has a keyword rule', () => {
    for (const a of ALLERGENS) assert.ok(ALLERGEN_KEYWORDS[a], a);
  });

  it('a food whose name or USDA description matches a keyword carries that allergen', () => {
    const missing: string[] = [];
    for (const f of foods) {
      const t = text(f);
      for (const a of ALLERGENS) {
        const rule = ALLERGEN_KEYWORDS[a];
        const cleaned = rule.not ? t.replace(new RegExp(rule.not.source, 'g'), ' ') : t;
        if (rule.words.test(cleaned) && !f.allergens.includes(a)) missing.push(`${f.id}: ${a}`);
      }
    }
    assert.deepEqual(missing, [], 'foods that match an allergen keyword but are not flagged');
  });

  it('every allergen flag is explained by a keyword or a documented composite flag', () => {
    const unexplained: string[] = [];
    for (const f of foods) {
      const t = text(f);
      for (const a of f.allergens) {
        if (!ALLERGEN_KEYWORDS[a].words.test(t) && !(COMPOSITE_FLAGS[f.id] ?? []).includes(a)) unexplained.push(`${f.id}: ${a}`);
      }
    }
    assert.deepEqual(unexplained, [], 'add a keyword or a COMPOSITE_FLAGS entry with a reason');
    for (const id of Object.keys(COMPOSITE_FLAGS)) assert.ok(foods.some((f) => f.id === id), `stale COMPOSITE_FLAGS entry ${id}`);
  });

  it('animal-origin foods never count as plant', () => {
    const animal = /\b(chicken|turkey|beef|lamb|goat|pork|ham|bacon|fish|salmon|tuna|prawns?|shrimp|crab|eggs?|milk|cheese|yogurt|honey|ghee|butter)\b/;
    const plantLookalike = /\b(almond|soy|coconut) ?milk\b|\bsoymilk\b|\bsoy yogurt\b|\b(peanut|almond|sesame) butter\b|\bbutternut\b|\beggplant\b/g;
    for (const f of foods) {
      if (f.origin !== 'plant') continue;
      const t = `${f.name} | ${f.source.description}`.toLowerCase().replace(plantLookalike, ' ');
      assert.ok(!animal.test(t), `${f.id}: origin is plant but the name suggests an animal product`);
    }
  });
});

describe('food macro sanity', () => {
  /** Acetic acid carries energy that protein, carbohydrate and fat do not account for. */
  const VINEGARS = new Set(['vinegar-balsamic', 'vinegar-cider', 'vinegar-red-wine']);

  it('kcal ≈ 4P + 4C + 9F per 100 g (25%, or 50% for very high-fibre foods)', () => {
    for (const f of foods) {
      if (VINEGARS.has(f.id)) continue;
      const est = atwaterKcal(f.per100g);
      const diff = Math.abs(f.per100g.kcal - est);
      const tolerance = Math.max(12, est * (f.per100g.fibre >= 20 ? 0.5 : 0.25));
      assert.ok(diff <= tolerance, `${f.id}: ${f.per100g.kcal} kcal vs ${est.toFixed(0)} from macros`);
    }
  });

  it('fibre never exceeds carbohydrate (USDA carbohydrate by difference includes fibre)', () => {
    for (const f of foods) assert.ok(f.per100g.fibre <= f.per100g.carbs + 0.05, f.id);
  });

  it('no two foods cite the same USDA record', () => {
    const seen = new Map<number, string>();
    for (const f of foods) {
      assert.ok(!seen.has(f.source.fdcId), `${f.id} and ${seen.get(f.source.fdcId)} share FDC ${f.source.fdcId}`);
      seen.set(f.source.fdcId, f.id);
    }
  });
});

describe('orphans and duplicates', () => {
  it('no orphan foods: every food is used by at least one recipe', () => {
    const used = new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.foodId)));
    const orphans = foods.filter((f) => !used.has(f.id)).map((f) => f.id);
    assert.deepEqual(orphans, []);
  });

  it('no two recipes share a title or an identical ingredient list', () => {
    const titles = new Map<string, string>();
    const sets = new Map<string, string>();
    for (const r of recipes) {
      const t = r.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      assert.ok(!titles.has(t), `${r.id} and ${titles.get(t)} share a title`);
      titles.set(t, r.id);
      const s = r.ingredients.map((i) => i.foodId).sort().join(',');
      assert.ok(!sets.has(s), `${r.id} and ${sets.get(s)} use the same ingredients`);
      sets.set(s, r.id);
    }
  });

  it('salt stays sensible: at most 3 g added salt per serving', () => {
    for (const r of recipes) {
      const salt = r.ingredients.find((i) => i.foodId === 'salt')?.grams ?? 0;
      assert.ok(salt / r.servings <= 3, `${r.id}: ${(salt / r.servings).toFixed(1)} g salt per serving`);
    }
  });
});

describe('catalogue balance (sheet 29: 600 recipes at launch)', () => {
  const count = (p: (r: (typeof recipes)[number]) => boolean) => recipes.filter(p).length;

  it('has at least 600 recipes', () => {
    assert.ok(recipes.length >= 600, `recipes: ${recipes.length}`);
  });

  it('has strong Pakistani/Indian and Arab coverage', () => {
    assert.ok(count((r) => r.cuisine === 'pakistani') >= 70);
    assert.ok(count((r) => r.cuisine === 'indian') >= 60);
    assert.ok(count((r) => ['middle_eastern', 'gulf', 'north_african'].includes(r.cuisine)) >= 110);
    assert.ok(count((r) => ['mediterranean', 'italian'].includes(r.cuisine)) >= 70);
  });

  it('balances slots, budget, quick, batch and vegetarian recipes', () => {
    assert.ok(count((r) => r.slots.includes('breakfast')) >= 100, 'breakfast');
    assert.ok(count((r) => r.slots.includes('snack')) >= 70, 'snack');
    assert.ok(count((r) => r.costTier === 1) >= 300, 'budget');
    assert.ok(count((r) => r.prepMin + r.cookMin <= 15) >= 120, 'quick');
    assert.ok(count((r) => r.servings >= 4) >= 30, 'meal prep');
    assert.ok(count((r) => r.dietTags.includes('vegetarian')) >= 250, 'vegetarian');
    assert.ok(count((r) => r.dietTags.includes('high_protein')) >= 300, 'high protein');
  });
});
