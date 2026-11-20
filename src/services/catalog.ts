/**
 * Content catalogues (@repwise/content): exercises, recipes and foods, read-only and offline.
 *
 * Loading is lazy and incremental (perf audit A4), so the catalogue never sits on the startup path:
 * - The three files are three independent parts. Each is `require`d (parsed) only when something
 *   first reads it: the player and Today read exercises, Eat reads recipes, the food log reads foods.
 * - `lazyCatalog()` returns the catalogue at once; its fields are lazy getters, so
 *   `lazyCatalog().recipeById` parses recipes only (so do `getRecipe` & co). `getCatalog()` keeps its
 *   contract (everything loaded on return). Id maps are built with their part (cheap); the search
 *   index of a part is built on its first search, never on load.
 * - `loadCatalog()` / `warmCatalog()` load the parts one per idle slice (exercises first), so no
 *   single block holds the JS thread for the whole ~1 MB. The warm-up then builds the search indexes,
 *   again one part per idle slice, so the first keystroke in a search is instant.
 * - `useCatalogFor('exercises')` lets a screen render as soon as the parts it reads are in.
 * Only types come from the package entry (an ESLint rule enforces it, perf r2 N1), so neither zod
 * nor the content schemas are evaluated in the app; the JSON is `require`d per part on demand.
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

export type CatalogPart = 'exercises' | 'recipes' | 'foods';
/** Load order: what the first screens need comes first. */
export const CATALOG_PARTS: readonly CatalogPart[] = ['exercises', 'recipes', 'foods'];

type ItemOf = { exercises: Exercise; recipes: Recipe; foods: Food };

const NON_ASCII = /[^\x00-\x7f]/;

/** Lowercase, strip accents and punctuation: "Pull-Up (Wide)" → "pull up wide". */
export function normalise(s: string): string {
  // NFD is the slow step and almost every name is plain ASCII, so it only runs when needed.
  const base = NON_ASCII.test(s) ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function indexed<T>(item: T, name: string, extra: string[]): Indexed<T> {
  const n = normalise(name);
  const hay = [n, ...extra.map(normalise)].join(' ');
  return { item, name: n, words: [...new Set(hay.split(' ').filter(Boolean))], hay };
}

const INDEXERS: { [P in CatalogPart]: (x: ItemOf[P]) => Indexed<ItemOf[P]> } = {
  exercises: (e) =>
    indexed(e, e.name, [...e.aliases, ...e.primaryMuscles, ...e.equipment, e.pattern]),
  recipes: (r) => indexed(r, r.title, [r.cuisine, r.mainProtein, ...r.dietTags]),
  foods: (f) => indexed(f, f.name, [f.category]),
};

export type CatalogSource = { exercises: Exercise[]; recipes: Recipe[]; foods: Food[] };

/** Build lookup maps and the search index eagerly (pure; exported for tests and scripts). */
export function buildCatalog(src: CatalogSource): Catalog {
  return {
    ...src,
    exerciseById: new Map(src.exercises.map((e) => [e.id, e])),
    recipeById: new Map(src.recipes.map((r) => [r.id, r])),
    foodById: new Map(src.foods.map((f) => [f.id, f])),
    index: {
      exercises: src.exercises.map(INDEXERS.exercises),
      recipes: src.recipes.map(INDEXERS.recipes),
      foods: src.foods.map(INDEXERS.foods),
    },
  };
}

/** One static require per file, so Metro bundles each and evaluates it only on first call. */
function readPart<P extends CatalogPart>(part: P): ItemOf[P][] {
  switch (part) {
    case 'exercises':
      return require('@repwise/content/exercises.json') as ItemOf[P][];
    case 'recipes':
      return require('@repwise/content/recipes.json') as ItemOf[P][];
    default:
      return require('@repwise/content/foods.json') as ItemOf[P][];
  }
}

type Part<T> = { list: T[]; byId: Map<string, T>; index: Indexed<T>[] | null };
type Parts = { [P in CatalogPart]?: Part<ItemOf[P]> };

let parts: Parts = {};
let loading: Promise<Catalog> | null = null;
let warming = false;
const listeners = new Set<() => void>();
let notifyQueued = false;
/** Work counters for deterministic performance tests (no wall clock). */
const stats = { parsed: [] as CatalogPart[], indexBuilds: [] as CatalogPart[], scored: 0 };

/** Tell subscribers on a microtask: a lazy getter may run during a render, which must not set state. */
function notify(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const l of [...listeners]) l();
  });
}

function part<P extends CatalogPart>(p: P): Part<ItemOf[P]> {
  const have = parts[p] as Part<ItemOf[P]> | undefined;
  if (have) return have;
  const list = readPart(p);
  const made: Part<ItemOf[P]> = {
    list,
    byId: new Map(list.map((x) => [(x as { id: string }).id, x])),
    index: null,
  };
  (parts as Record<CatalogPart, unknown>)[p] = made;
  stats.parsed.push(p);
  notify();
  return made;
}

function indexOf<P extends CatalogPart>(p: P): Indexed<ItemOf[P]>[] {
  const pt = part(p);
  if (!pt.index) {
    pt.index = pt.list.map(INDEXERS[p] as (x: ItemOf[P]) => Indexed<ItemOf[P]>);
    stats.indexBuilds.push(p);
  }
  return pt.index;
}

/** The one catalogue object: every field loads only its own part, on first read. */
const facade: Catalog = {
  get exercises() {
    return part('exercises').list;
  },
  get recipes() {
    return part('recipes').list;
  },
  get foods() {
    return part('foods').list;
  },
  get exerciseById() {
    return part('exercises').byId;
  },
  get recipeById() {
    return part('recipes').byId;
  },
  get foodById() {
    return part('foods').byId;
  },
  index: {
    get exercises() {
      return indexOf('exercises');
    },
    get recipes() {
      return indexOf('recipes');
    },
    get foods() {
      return indexOf('foods');
    },
  },
};

export function isCatalogPartLoaded(p: CatalogPart): boolean {
  return parts[p] != null;
}

function allLoaded(want: readonly CatalogPart[]): boolean {
  return want.every((p) => parts[p] != null);
}

/**
 * The catalogue, loaded synchronously (when a read happens before the idle warm-up finished).
 * Parses the parts not yet loaded but never builds a search index (that waits for a first search).
 * Prefer `lazyCatalog()` when only one part is read.
 */
export function getCatalog(): Catalog {
  for (const p of CATALOG_PARTS) part(p);
  return facade;
}

/**
 * The catalogue without loading anything: each field parses only its own part on first read, e.g.
 * `lazyCatalog().recipeById` never touches exercises or foods.
 */
export function lazyCatalog(): Catalog {
  return facade;
}

/** Already fully loaded, or null — never parses. */
export function peekCatalog(): Catalog | null {
  return allLoaded(CATALOG_PARTS) ? facade : null;
}

/** The catalogue once the given parts are loaded (reading those fields is then free), else null. */
export function peekCatalogFor(want: readonly CatalogPart[]): Catalog | null {
  return allLoaded(want) ? facade : null;
}

/** Bumped by resetCatalogForTests; idle-slice chains started before a reset stop. */
let generation = 0;

/** Run when the JS thread is idle (RN 0.88 removed InteractionManager), else on the next tick. */
function afterIdle(fn: () => void): void {
  const ric = (
    globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }
  ).requestIdleCallback;
  if (typeof ric === 'function') ric(fn, { timeout: 2000 });
  else setTimeout(fn, 0);
}

/** Run `steps` one per idle slice, so the JS thread can paint and handle taps in between. */
function inSlices(steps: (() => void)[]): Promise<void> {
  const gen = generation;
  return new Promise<void>((resolve, reject) => {
    const next = (i: number) => {
      if (i >= steps.length) return resolve();
      afterIdle(() => {
        // A reset (tests) drops chains started before it, so they cannot load into the new state.
        if (gen !== generation) return resolve();
        try {
          steps[i]!();
        } catch (e) {
          reject(e);
          return;
        }
        next(i + 1);
      });
    };
    next(0);
  });
}

/** Load the given parts off the startup path, one idle slice each. Resolves with the catalogue. */
export function loadCatalogParts(want: readonly CatalogPart[]): Promise<Catalog> {
  const missing = CATALOG_PARTS.filter((p) => want.includes(p) && parts[p] == null);
  if (missing.length === 0) return Promise.resolve(facade);
  return inSlices(missing.map((p) => () => void part(p))).then(() => facade);
}

/** Load every part off the startup path (one idle slice per part). Resolves with the catalogue. */
export function loadCatalog(): Promise<Catalog> {
  if (peekCatalog()) return Promise.resolve(facade);
  if (!loading) {
    const p: Promise<Catalog> = loadCatalogParts(CATALOG_PARTS).finally(() => {
      if (loading === p) loading = null;
    });
    loading = p;
  }
  return loading;
}

/**
 * Fire-and-forget warm-up after startup: the parts, then their search indexes, one idle slice
 * each (never one long block).
 */
export function warmCatalog(): void {
  if (warming) return;
  warming = true;
  loadCatalog()
    .then(() => inSlices(CATALOG_PARTS.map((p) => () => void indexOf(p))))
    .catch(() => undefined)
    .finally(() => {
      warming = false;
    });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Parts a screen cannot render without (names in the workout player): when a mounted screen asks
 * for one, it loads on the next macrotask (about 10–30 ms for exercises), not in an idle slice that
 * a busy startup can push back by up to 2 s (perf audit r2 N19: a notification tap into the
 * player showed a skeleton). Recipes and foods (the large parts) stay idle-sliced.
 */
export const URGENT_PARTS: readonly CatalogPart[] = ['exercises'];

/**
 * Catalogue for screens that read only some parts: null until those parts are loaded (show a
 * skeleton), then the catalogue. E.g. the player: `useCatalogFor('exercises')`.
 */
export function useCatalogFor(...want: CatalogPart[]): Catalog | null {
  const key = want.join(',');
  const snap = () => peekCatalogFor(want);
  const c = useSyncExternalStore(subscribe, snap, snap);
  useEffect(() => {
    const ps = key.split(',') as CatalogPart[];
    if (peekCatalogFor(ps)) return;
    const urgent = ps.filter((p) => URGENT_PARTS.includes(p) && parts[p] == null);
    const timer =
      urgent.length > 0
        ? setTimeout(() => {
            try {
              for (const p of urgent) part(p);
            } catch {
              // the idle load below retries and reports
            }
          }, 0)
        : null;
    loadCatalogParts(ps).catch(() => undefined);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [key]);
  return c;
}

/** Catalogue for screens: null while loading (show a skeleton), then the data. */
export function useCatalog(): Catalog | null {
  return useCatalogFor(...CATALOG_PARTS);
}

export function getExercise(id: string): Exercise | undefined {
  return part('exercises').byId.get(id);
}
export function getRecipe(id: string): Recipe | undefined {
  return part('recipes').byId.get(id);
}
export function getFood(id: string): Food | undefined {
  return part('foods').byId.get(id);
}

/**
 * Rank: exact name 100 › name starts with query 80 › every query word starts a name word 60 ›
 * every query word starts any indexed word (aliases, muscles, tags) 40 › substring 20.
 */
export function score(
  entry: { name: string; words: string[]; hay: string },
  q: string,
  qWords: string[],
): number {
  if (entry.name === q) return 100;
  if (entry.name.startsWith(q)) return 80;
  const nameWords = entry.name.split(' ');
  if (qWords.every((w) => nameWords.some((n) => n.startsWith(w)))) return 60;
  if (qWords.every((w) => entry.words.some((n) => n.startsWith(w)))) return 40;
  if (entry.hay.includes(q)) return 20;
  return 0;
}

function search<T>(
  entries: Indexed<T>[],
  query: string,
  limit: number,
  filter?: (t: T) => boolean,
): T[] {
  const q = normalise(query);
  const pool = filter ? entries.filter((e) => filter(e.item)) : entries;
  if (!q) return pool.slice(0, limit).map((e) => e.item);
  const qWords = q.split(' ');
  const hits: { e: Indexed<T>; s: number }[] = [];
  for (const e of pool) {
    const s = score(e, q, qWords);
    if (s > 0) hits.push({ e, s });
  }
  stats.scored += pool.length;
  hits.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
  return hits.slice(0, limit).map((h) => h.e.item);
}

export type SearchOptions<T> = { limit?: number; filter?: (item: T) => boolean };

export function searchExercises(query: string, o: SearchOptions<Exercise> = {}): Exercise[] {
  return search(indexOf('exercises'), query, o.limit ?? 50, o.filter);
}
export function searchRecipes(query: string, o: SearchOptions<Recipe> = {}): Recipe[] {
  return search(indexOf('recipes'), query, o.limit ?? 50, o.filter);
}
export function searchFoods(query: string, o: SearchOptions<Food> = {}): Food[] {
  return search(indexOf('foods'), query, o.limit ?? 50, o.filter);
}

/** Tests only: what has been parsed / indexed / scored since the last reset. */
export function catalogStatsForTests(): {
  parsed: CatalogPart[];
  indexBuilds: CatalogPart[];
  scored: number;
} {
  return { parsed: [...stats.parsed], indexBuilds: [...stats.indexBuilds], scored: stats.scored };
}

/** Tests only. */
export function resetCatalogForTests(): void {
  generation += 1;
  parts = {};
  loading = null;
  warming = false;
  listeners.clear();
  stats.parsed = [];
  stats.indexBuilds = [];
  stats.scored = 0;
}
