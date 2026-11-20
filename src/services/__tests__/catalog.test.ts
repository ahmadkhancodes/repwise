import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  buildCatalog,
  catalogStatsForTests,
  getCatalog,
  getExercise,
  getFood,
  getRecipe,
  isCatalogPartLoaded,
  lazyCatalog,
  loadCatalog,
  loadCatalogParts,
  normalise,
  peekCatalog,
  peekCatalogFor,
  resetCatalogForTests,
  searchExercises,
  searchFoods,
  searchRecipes,
  useCatalog,
  useCatalogFor,
  warmCatalog,
} from '@/services/catalog';

beforeEach(() => resetCatalogForTests());

describe('catalog', () => {
  it('is not parsed at import time; loadCatalog loads when idle', async () => {
    expect(peekCatalog()).toBeNull();
    expect(catalogStatsForTests().parsed).toEqual([]);
    const c = await loadCatalog();
    expect(c.exercises.length).toBeGreaterThan(200);
    expect(c.recipes.length).toBeGreaterThan(200);
    expect(c.foods.length).toBeGreaterThan(200);
    expect(peekCatalog()).toBe(c);
  });

  it('loads parts incrementally, exercises first, and never builds a search index on load', async () => {
    await loadCatalog();
    const s = catalogStatsForTests();
    expect(s.parsed).toEqual(['exercises', 'recipes', 'foods']);
    expect(s.indexBuilds).toEqual([]);
  });

  it('getCatalog() loads every part synchronously but builds no search index', () => {
    const c = getCatalog();
    expect(peekCatalog()).toBe(c);
    expect(catalogStatsForTests().parsed).toEqual(['exercises', 'recipes', 'foods']);
    expect(catalogStatsForTests().indexBuilds).toEqual([]);
  });

  it('lazyCatalog() parses only the part whose field is read', () => {
    const c = lazyCatalog();
    expect(catalogStatsForTests().parsed).toEqual([]);
    expect(c.recipeById.size).toBeGreaterThan(200);
    expect(catalogStatsForTests().parsed).toEqual(['recipes']);
    expect(isCatalogPartLoaded('exercises')).toBe(false);
    expect(isCatalogPartLoaded('foods')).toBe(false);
    expect(peekCatalog()).toBeNull(); // not every part yet
    expect(peekCatalogFor(['recipes'])).toBe(c);
    // A notification rebuild (getRecipe) never pays for exercises or foods.
    getRecipe(c.recipes[0]!.id);
    expect(catalogStatsForTests().parsed).toEqual(['recipes']);
  });

  it('loadCatalogParts loads only what it is asked for', async () => {
    await loadCatalogParts(['exercises']);
    expect(catalogStatsForTests().parsed).toEqual(['exercises']);
    expect(peekCatalogFor(['exercises'])).not.toBeNull();
    expect(peekCatalogFor(['exercises', 'recipes'])).toBeNull();
    await loadCatalogParts(['exercises']); // already in: no work
    expect(catalogStatsForTests().parsed).toEqual(['exercises']);
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
    expect(normalise('Açaí bowl')).toBe('acai bowl');
    expect(normalise('ALREADY ascii')).toBe('already ascii');
  });

  it('the lazy catalogue indexes exactly like the eager buildCatalog', () => {
    const c = getCatalog();
    const eager = buildCatalog({ exercises: c.exercises, recipes: c.recipes, foods: c.foods });
    expect(c.index.exercises).toEqual(eager.index.exercises);
    expect(c.index.recipes).toEqual(eager.index.recipes);
    expect(c.index.foods).toEqual(eager.index.foods);
    expect(eager.exerciseById.get(c.exercises[0]!.id)).toBe(c.exercises[0]);
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

  it('search is one linear pass over a once-built index (deterministic work, not wall clock)', () => {
    const c = getCatalog();
    const n = c.exercises.length + c.recipes.length + c.foods.length;
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
      searchExercises(q);
      searchRecipes(q);
      searchFoods(q);
    }
    const s = catalogStatsForTests();
    // Each index is built once, on its first search, and never again.
    expect(s.indexBuilds).toEqual(['exercises', 'recipes', 'foods']);
    // Every query scores each entry exactly once: no re-indexing, no quadratic work.
    expect(s.scored).toBe(n * queries.length);
  });

  it('warmCatalog loads every part, then builds the indexes, in idle slices', async () => {
    warmCatalog();
    warmCatalog(); // idempotent while running
    expect(catalogStatsForTests().parsed).toEqual([]); // nothing on the calling tick
    await waitFor(() => expect(catalogStatsForTests().indexBuilds).toHaveLength(3));
    expect(catalogStatsForTests().parsed).toEqual(['exercises', 'recipes', 'foods']);
  });

  it('useCatalogFor resolves when only its parts are in; useCatalog waits for all', async () => {
    expect(peekCatalogFor(['exercises'])).toBeNull();
    const parts = await renderHook(() => useCatalogFor('exercises'));
    await waitFor(() => expect(parts.result.current).not.toBeNull());
    expect(isCatalogPartLoaded('recipes')).toBe(false);

    expect(peekCatalog()).toBeNull();
    const all = await renderHook(() => useCatalog());
    await waitFor(() => expect(all.result.current).not.toBeNull());
    expect(peekCatalog()).toBe(all.result.current);
  });

  it('a screen that needs exercises gets them on the next macrotask, even when idle never comes (r2 N19)', async () => {
    const g = globalThis as { requestIdleCallback?: unknown };
    const saved = g.requestIdleCallback;
    // Start from an empty catalogue; the reset also stops idle loads queued by earlier tests.
    resetCatalogForTests();
    g.requestIdleCallback = () => undefined; // a busy startup: no idle slice
    try {
      const h = await renderHook(() => useCatalogFor('exercises'));
      expect(h.result.current).toBeNull();
      // Not idle-sliced: it arrives although requestIdleCallback never calls back.
      await waitFor(() => expect(h.result.current).not.toBeNull());
      expect(isCatalogPartLoaded('recipes')).toBe(false);
      // Recipes are not urgent: they still wait for an idle slice.
      const r = await renderHook(() => useCatalogFor('recipes'));
      await act(() => new Promise<void>((res) => setTimeout(res, 5)));
      expect(r.result.current).toBeNull();
    } finally {
      g.requestIdleCallback = saved;
    }
  });

  it('re-renders subscribers when a lazy read loads a part', async () => {
    const h = await renderHook(() => useCatalogFor('foods'));
    await act(async () => {
      getFood('x'); // synchronous load from elsewhere (e.g. a service)
    });
    expect(h.result.current).not.toBeNull();
  });
});
