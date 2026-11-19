import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveRecipe, indexFoods, proteinSourceOf, type Food } from '../src/index';

const src = { dataset: 'USDA FoodData Central — test', fdcId: 1, description: 'x', licence: 'Public domain (CC0 1.0)' as const };
const fixture: Food[] = [
  { id: 'chicken', name: 'Chicken', category: 'poultry', origin: 'poultry', per100g: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, fibre: 0 }, allergens: [], source: src },
  { id: 'rice', name: 'Rice', category: 'grains', origin: 'plant', per100g: { kcal: 365, protein: 7.1, carbs: 80, fat: 0.7, fibre: 1.3 }, allergens: [], source: src },
  { id: 'soy', name: 'Soy sauce', category: 'condiments', origin: 'plant', per100g: { kcal: 53, protein: 8.1, carbs: 4.9, fat: 0.6, fibre: 0.8 }, allergens: ['soybeans', 'gluten'], source: src },
  { id: 'bacon', name: 'Bacon', category: 'meat', origin: 'pork', per100g: { kcal: 417, protein: 13, carbs: 1.4, fat: 40, fibre: 0 }, allergens: [], source: src },
  { id: 'tofu', name: 'Tofu', category: 'plant_protein', origin: 'plant', per100g: { kcal: 144, protein: 17.3, carbs: 2.8, fat: 8.7, fibre: 2.3 }, allergens: ['soybeans'], source: src },
];
const idx = indexFoods(fixture);

describe('deriveRecipe', () => {
  it('computes per-serving macros from grams', () => {
    const d = deriveRecipe({ servings: 2, slots: ['lunch'], ingredients: [{ foodId: 'chicken', grams: 200 }, { foodId: 'rice', grams: 100 }] }, idx);
    assert.deepEqual(d.perServing, { kcal: 303, protein: 26.1, carbs: 40, fat: 3, fibre: 0.7 });
    assert.equal(d.mainProtein, 'chicken');
    assert.ok(d.dietTags.includes('halal_friendly') && !d.dietTags.includes('vegetarian'));
  });

  it('propagates allergens in EU-14 order and drops gluten_free', () => {
    const d = deriveRecipe({ servings: 1, slots: ['dinner'], ingredients: [{ foodId: 'rice', grams: 80 }, { foodId: 'soy', grams: 15 }] }, idx);
    assert.deepEqual(d.allergens, ['gluten', 'soybeans']);
    assert.ok(d.dietTags.includes('vegan') && !d.dietTags.includes('gluten_free'));
  });

  it('pork removes halal_friendly; low-carb and high-protein follow the thresholds', () => {
    const d = deriveRecipe({ servings: 1, slots: ['breakfast'], ingredients: [{ foodId: 'chicken', grams: 150 }, { foodId: 'bacon', grams: 20 }] }, idx);
    assert.ok(!d.dietTags.includes('halal_friendly'));
    assert.ok(d.dietTags.includes('low_carb') && d.dietTags.includes('high_protein'));
  });

  it('throws on unknown food ids', () => {
    assert.throws(() => deriveRecipe({ servings: 1, slots: ['snack'], ingredients: [{ foodId: 'nope', grams: 1 }] }, idx));
  });

  it('maps soy foods to the soy protein family', () => {
    assert.equal(proteinSourceOf(fixture[4]!), 'soy');
  });
});
