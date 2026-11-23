import { useEffect, useState } from 'react';

import {
  exerciseDbItems,
  isExerciseDbItemId,
  type ExerciseDbRaw,
} from '../logic/exerciseDb';
import { indexItem, type IndexedItem, type LibraryItem } from '../logic/libraryItem';

export type ExerciseDbCatalog = {
  items: LibraryItem[];
  indexed: IndexedItem[];
  byId: Map<string, LibraryItem>;
};

let cache: ExerciseDbCatalog | null = null;

/**
 * The browse-only ExerciseDB V1 exercises (~1,300 after removing the ones behind our catalogue).
 * The 1.3 MB JSON is `require`d only here, on first use (never on the first-frame path), parsed
 * once and kept for the app run. Offline: it ships with the app; only the GIFs come from the CDN.
 */
export function loadExerciseDb(): ExerciseDbCatalog {
  if (cache) return cache;
  const raws = require('@repwise/content/exercisedb_v1.json') as ExerciseDbRaw[];
  const map = (require('@repwise/content/exercise_media.json') as {
    exercises: Record<string, string | null>;
  }).exercises;
  const covered = new Set(Object.values(map).filter((v): v is string => Boolean(v)));
  const items = exerciseDbItems(raws, covered);
  cache = { items, indexed: items.map(indexItem), byId: new Map(items.map((i) => [i.id, i])) };
  return cache;
}

export function peekExerciseDb(): ExerciseDbCatalog | null {
  return cache;
}

/**
 * The V1 catalogue for a screen. Loaded when the JS thread is idle (the list paints first with our own
 * exercises); `needNow` (a deep link to a V1 exercise) loads it at once.
 */
export function useExerciseDb(needNow = false): ExerciseDbCatalog | null {
  const [db, setDb] = useState<ExerciseDbCatalog | null>(() =>
    cache ?? (needNow ? safeLoad() : null),
  );
  useEffect(() => {
    if (db) return;
    let live = true;
    afterIdle(() => {
      if (live) setDb(safeLoad());
    });
    return () => {
      live = false;
    };
  }, [db]);
  return db;
}

/** When the JS thread is idle (RN 0.88 has no InteractionManager), else on the next tick. */
function afterIdle(fn: () => void): void {
  const ric = (
    globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }
  ).requestIdleCallback;
  if (typeof ric === 'function') ric(fn, { timeout: 1500 });
  else setTimeout(fn, 0);
}

function safeLoad(): ExerciseDbCatalog | null {
  try {
    return loadExerciseDb();
  } catch {
    return null;
  }
}

export { isExerciseDbItemId };

/** Test hook. */
export function __resetExerciseDbForTests(): void {
  cache = null;
}
