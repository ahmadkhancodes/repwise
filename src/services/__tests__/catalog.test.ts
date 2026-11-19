import {
  getCatalog,
  getExercise,
  getFood,
  getRecipe,
  loadCatalog,
  normalise,
  peekCatalog,
  resetCatalogForTests,
  searchExercises,
  searchFoods,
  searchRecipes,
} from '@/services/catalog';

beforeEach(() => resetCatalogForTests());

describe('catalog', () => {
  it('is not parsed at import time; loadCatalog loads when idle', async () => {
    expect(peekCatalog()).toBeNull();
    const c = await loadCatalog();
    expect(c.exercises.length).toBeGreaterThan(200);
    expect(c.recipes.length).toBeGreaterThan(200);
    expect(c.foods.length).toBeGreaterThan(200);
    expect(peekCatalog()).toBe(c);
  });

  it('looks up by id', () => {
    const e = getCatalog().exercises[0]!;
    expect(getExercise(e.id)).toBe(e);
    const r = getCatalog().recipes[0]!;
    expect(getRecipe(r.id)).toBe(r);
    const f = getCatalog().foods[0]!;
    expect(getFood(f.id)).toBe(f);
    expect(getExercise('nope')).toBeUndefined();
  });

  it('normalises accents and punctuation', () => {
    expect(normalise('  Pull-Up (Wide) ')).toBe('pull up wide');
    expect(normalise('Crème Brûlée')).toBe('creme brulee');
  });

  it('ranks name matches first and supports word prefixes', () => {
    const squat = searchExercises('squat');
    expect(squat.length).toBeGreaterThan(3);
    expect(normalise(squat[0]!.name)).toContain('squat');
    const db = searchExercises('db bench');
    expect(Array.isArray(db)).toBe(true);
    expect(
      searchRecipes('chicken').every((r) =>
        normalise(`${r.title} ${r.mainProtein} ${r.cuisine} ${r.dietTags.join(' ')}`).includes(
          'chicken',
        ),
      ),
    ).toBe(true);
    expect(searchFoods('oat')[0]!.name.toLowerCase()).toContain('oat');
    expect(searchExercises('zzzzqqq')).toEqual([]);
  });

  it('filters and limits', () => {
    const r = searchRecipes('', { limit: 5, filter: (x) => x.dietTags.includes('vegan') });
    expect(r).toHaveLength(5);
    expect(r.every((x) => x.dietTags.includes('vegan'))).toBe(true);
  });

  it('searches the whole catalogue in under 50 ms', () => {
    getCatalog(); // index built once
    const queries = [
      'squat',
      'bench press',
      'row',
      'chicken rice',
      'greek yogurt',
      'lunge',
      'curl',
      'paneer',
    ];
    for (const q of queries) {
      const t0 = performance.now();
      searchExercises(q);
      searchRecipes(q);
      searchFoods(q);
      expect(performance.now() - t0).toBeLessThan(50);
    }
  });
});
