/**
 * Content catalogues (@repwise/content): exercises, recipes and foods, read-only and offline.
 *
 * The JSON is ~800 KB, so it is never parsed on the startup path: `warmCatalog()` loads it after
 * startup when the JS thread is idle, and any lookup before that loads it on demand. Search uses a prebuilt
 * normalised index (name + aliases + key tags) and runs in well under 50 ms for the whole set.
 * Only types come from the package entry, so zod never reaches the app bundle.
 */
import type { Exercise, Food, Recipe } from '@repwise/content';
import { useEffect, useSyncExternalStore } from 'react';

export type { Exercise, Food, Recipe };

type Indexed<T> = { item: T; name: string; words: string[]; hay: string };

export type Catalog = {
  exercises: Exercise[];
  recipes: Recipe[];
  foods: Food[];
  exerciseById: Map<string, Exercise>;
  recipeById: Map<string, Recipe>;
  foodById: Map<string, Food>;
  index: { exercises: Indexed<Exercise>[]; recipes: Indexed<Recipe>[]; foods: Indexed<Food>[] };
};

/** Lowercase, strip accents and punctuation: "Pull-Up (Wide)" → "pull up wide". */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function indexed<T>(item: T, name: string, extra: string[]): Indexed<T> {
  const n = normalise(name);
  const hay = [n, ...extra.map(normalise)].join(' ');
  return { item, name: n, words: [...new Set(hay.split(' ').filter(Boolean))], hay };
}

export type CatalogSource = { exercises: Exercise[]; recipes: Recipe[]; foods: Food[] };

/** Build lookup maps and the search index (pure; exported for tests). */
export function buildCatalog(src: CatalogSource): Catalog {
  return {
    ...src,
    exerciseById: new Map(src.exercises.map((e) => [e.id, e])),
    recipeById: new Map(src.recipes.map((r) => [r.id, r])),
    foodById: new Map(src.foods.map((f) => [f.id, f])),
    index: {
      exercises: src.exercises.map((e) =>
        indexed(e, e.name, [...e.aliases, ...e.primaryMuscles, ...e.equipment, e.pattern]),
      ),
      recipes: src.recipes.map((r) => indexed(r, r.title, [r.cuisine, r.mainProtein, ...r.dietTags])),
      foods: src.foods.map((f) => indexed(f, f.name, [f.category])),
    },
  };
}

function readSource(): CatalogSource {
  return {
    exercises: require('@repwise/content/exercises.json') as Exercise[],
    recipes: require('@repwise/content/recipes.json') as Recipe[],
    foods: require('@repwise/content/foods.json') as Food[],
  };
}

let catalog: Catalog | null = null;
let loading: Promise<Catalog> | null = null;
const listeners = new Set<() => void>();

function set(c: Catalog): Catalog {
  catalog = c;
  for (const l of [...listeners]) l();
  return c;
}

/** Synchronous load (used when a lookup happens before the background warm-up finished). */
export function getCatalog(): Catalog {
  return catalog ?? set(buildCatalog(readSource()));
}

/** Already loaded, or null — never parses. */
export function peekCatalog(): Catalog | null {
  return catalog;
}

/** Run when the JS thread is idle (RN 0.88 removed InteractionManager), else on the next tick. */
function afterIdle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (typeof ric === 'function') ric(fn, { timeout: 2000 });
  else setTimeout(fn, 0);
}

/** Load off the startup path (when idle). Resolves with the catalogue. */
export function loadCatalog(): Promise<Catalog> {
  if (catalog) return Promise.resolve(catalog);
  if (!loading) {
    loading = new Promise<Catalog>((resolve, reject) => {
      afterIdle(() => {
        try {
          resolve(getCatalog());
        } catch (e) {
          reject(e);
        }
      });
    }).finally(() => {
      loading = null;
    });
  }
  return loading;
}

/** Fire-and-forget warm-up from the root layout. */
export function warmCatalog(): void {
  loadCatalog().catch(() => undefined);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Catalogue for screens: null while loading (show a skeleton), then the data. */
export function useCatalog(): Catalog | null {
  const c = useSyncExternalStore(subscribe, peekCatalog, peekCatalog);
  useEffect(() => {
    if (!peekCatalog()) loadCatalog().catch(() => undefined);
  }, []);
  return c;
}

export function getExercise(id: string): Exercise | undefined {
  return getCatalog().exerciseById.get(id);
}
export function getRecipe(id: string): Recipe | undefined {
  return getCatalog().recipeById.get(id);
}
export function getFood(id: string): Food | undefined {
  return getCatalog().foodById.get(id);
}

/**
 * Rank: exact name 100 › name starts with query 80 › every query word starts a name word 60 ›
 * every query word starts any indexed word (aliases, muscles, tags) 40 › substring 20.
 */
export function score(entry: { name: string; words: string[]; hay: string }, q: string, qWords: string[]): number {
  if (entry.name === q) return 100;
  if (entry.name.startsWith(q)) return 80;
  const nameWords = entry.name.split(' ');
  if (qWords.every((w) => nameWords.some((n) => n.startsWith(w)))) return 60;
  if (qWords.every((w) => entry.words.some((n) => n.startsWith(w)))) return 40;
  if (entry.hay.includes(q)) return 20;
  return 0;
}

function search<T>(entries: Indexed<T>[], query: string, limit: number, filter?: (t: T) => boolean): T[] {
  const q = normalise(query);
  const pool = filter ? entries.filter((e) => filter(e.item)) : entries;
  if (!q) return pool.slice(0, limit).map((e) => e.item);
  const qWords = q.split(' ');
  const hits: { e: Indexed<T>; s: number }[] = [];
  for (const e of pool) {
    const s = score(e, q, qWords);
    if (s > 0) hits.push({ e, s });
  }
  hits.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
  return hits.slice(0, limit).map((h) => h.e.item);
}

export type SearchOptions<T> = { limit?: number; filter?: (item: T) => boolean };

export function searchExercises(query: string, o: SearchOptions<Exercise> = {}): Exercise[] {
  return search(getCatalog().index.exercises, query, o.limit ?? 50, o.filter);
}
export function searchRecipes(query: string, o: SearchOptions<Recipe> = {}): Recipe[] {
  return search(getCatalog().index.recipes, query, o.limit ?? 50, o.filter);
}
export function searchFoods(query: string, o: SearchOptions<Food> = {}): Food[] {
  return search(getCatalog().index.foods, query, o.limit ?? 50, o.filter);
}

/** Tests only. */
export function resetCatalogForTests(): void {
  catalog = null;
  loading = null;
  listeners.clear();
}
