/**
 * One shape for the library: catalogue exercises (@repwise/content) and the user's own exercises
 * (SQLite `exercises` table) both become a LibraryItem, so lists, search and the detail screen
 * never branch on where an exercise came from.
 */
import type { Equipment, Exercise, Level, Muscle, PatternFamily } from '@repwise/content';

import { normalise, score } from '@/services/catalog';

import { matchesFilters, type LibraryFilters } from './filters';
import { EQUIPMENT_LABEL, LEVELS, MUSCLE_LABEL, PATTERN_LABEL } from './labels';

export type LibraryItem = {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment[];
  patternFamily: PatternFamily | null;
  level: Level | null;
  /** Cloudinary public id (catalogue only). */
  mediaId: string | null;
  instructions: string[];
  cues: string[];
  commonMistakes: string[];
  alternatives: string[];
  unilateral: boolean;
  custom: boolean;
};

/** The columns of a custom exercise row this module reads (see src/db/schema.ts `exercises`). */
export type CustomExerciseRow = {
  id: string;
  name: string;
  primaryMuscles: string[] | null;
  secondary: string[] | null;
  equipment: string[] | null;
  pattern: string | null;
  difficulty: number | null;
  steps: string[] | null;
  tips: string[] | null;
};

const cache = new WeakMap<Exercise, LibraryItem>();

export function fromCatalog(ex: Exercise): LibraryItem {
  const hit = cache.get(ex);
  if (hit) return hit;
  const item: LibraryItem = {
    id: ex.id,
    name: ex.name,
    aliases: ex.aliases,
    primaryMuscles: ex.primaryMuscles,
    secondaryMuscles: ex.secondaryMuscles,
    equipment: ex.equipment,
    patternFamily: ex.patternFamily,
    level: ex.level,
    mediaId: ex.mediaId,
    instructions: ex.instructions,
    cues: ex.cues,
    commonMistakes: ex.commonMistakes,
    alternatives: ex.alternatives,
    unilateral: ex.unilateral,
    custom: false,
  };
  cache.set(ex, item);
  return item;
}

const isMuscle = (m: string): m is Muscle => m in MUSCLE_LABEL;
const isEquipment = (e: string): e is Equipment => e in EQUIPMENT_LABEL;
const isPattern = (p: string | null): p is PatternFamily => p != null && p in PATTERN_LABEL;

/** difficulty 1–3 ↔ level (sheet 29 `difficulty`, content `level`). */
export function levelFromDifficulty(d: number | null | undefined): Level | null {
  return d != null && d >= 1 && d <= 3 ? (LEVELS[d - 1] ?? null) : null;
}
export function difficultyFromLevel(l: Level | null): number | null {
  return l ? LEVELS.indexOf(l) + 1 : null;
}

/** Unknown values (e.g. synced from a newer app version) are dropped, never shown raw. */
export function fromCustom(row: CustomExerciseRow): LibraryItem {
  const primary = (row.primaryMuscles ?? []).filter(isMuscle);
  return {
    id: row.id,
    name: row.name,
    aliases: [],
    primaryMuscles: primary,
    secondaryMuscles: (row.secondary ?? []).filter(isMuscle).filter((m) => !primary.includes(m)),
    equipment: (row.equipment ?? []).filter(isEquipment),
    patternFamily: isPattern(row.pattern) ? row.pattern : null,
    level: levelFromDifficulty(row.difficulty),
    mediaId: null,
    instructions: row.steps ?? [],
    cues: row.tips ?? [],
    commonMistakes: [],
    alternatives: [],
    unilateral: false,
    custom: true,
  };
}

/** "Quads · Barbell" */
export function itemSubtitle(item: Pick<LibraryItem, 'primaryMuscles' | 'equipment'>): string {
  const muscle = item.primaryMuscles[0] ? MUSCLE_LABEL[item.primaryMuscles[0]] : null;
  const kit = item.equipment.find((e) => e !== 'bench' && e !== 'squat_rack') ?? item.equipment[0];
  return [muscle, kit ? EQUIPMENT_LABEL[kit] : null].filter(Boolean).join(' · ');
}

export type CatalogSearch = (
  query: string,
  o: { limit?: number; filter?: (e: Exercise) => boolean },
) => Exercise[];

/**
 * Library search (S18): the user's own exercises that match come first (ranked with the same
 * scorer as the catalogue), then catalogue hits from the indexed catalogue search.
 */
export function searchLibrary(
  searchCatalog: CatalogSearch,
  customs: readonly LibraryItem[],
  query: string,
  filters: LibraryFilters,
  limit = 500,
): LibraryItem[] {
  const q = normalise(query);
  const qWords = q.split(' ');
  const mine = customs
    .filter((c) => matchesFilters(c, filters))
    .map((c) => {
      const name = normalise(c.name);
      const extra = [...c.primaryMuscles, ...c.equipment].map(normalise);
      const hay = [name, ...extra].join(' ');
      const entry = { name, words: hay.split(' ').filter(Boolean), hay };
      return { c, s: q ? score(entry, q, qWords) : 1 };
    })
    .filter((h) => h.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .map((h) => h.c);
  const catalog = searchCatalog(query, {
    limit,
    filter: (e) => matchesFilters(e, filters),
  }).map(fromCatalog);
  return [...mine, ...(q ? catalog : sortByName(catalog))].slice(0, limit);
}

/** Alphabetical when there is no query (the catalogue JSON is grouped by pattern). */
export function sortByName(items: LibraryItem[]): LibraryItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}
