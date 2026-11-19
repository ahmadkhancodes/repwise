import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadCatalog, peekCatalog, type Catalog } from '@/services/catalog';

import { fromCatalog, fromCustom, type LibraryItem } from '../logic/libraryItem';
import { mergeRecent } from '../logic/recent';
import { useLibraryPrefs } from '../prefs';
import { useCustomExercisesLive, useRecentlyLogged } from '../repo';

/**
 * Catalogue with a visible error + retry (useCatalog swallows load errors). Loads off the startup
 * path (idle callback) the first time; instant once warmed by the root layout.
 */
export function useCatalogState(): { catalog: Catalog | null; error: boolean; retry: () => void } {
  const [catalog, setCatalog] = useState<Catalog | null>(peekCatalog);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (catalog) return;
    let live = true;
    loadCatalog()
      .then((c) => {
        if (live) setCatalog(c);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [catalog, attempt]);
  const retry = useCallback(() => {
    setError(false);
    setAttempt((a) => a + 1);
  }, []);
  return { catalog, error: error && !catalog, retry };
}

export function useCustomItems(): { items: LibraryItem[]; error?: Error } {
  const { data, error } = useCustomExercisesLive();
  const items = useMemo(() => data.map(fromCustom), [data]);
  return { items, error };
}

/** Look up any exercise id in the catalogue or the user's own exercises. */
export function resolveItem(
  id: string,
  catalog: Catalog | null,
  customs: readonly LibraryItem[],
): LibraryItem | undefined {
  const ex = catalog?.exerciseById.get(id);
  return ex ? fromCatalog(ex) : customs.find((c) => c.id === id);
}

/** Favourites and recently used, resolved to items (unknown/deleted ids are skipped). */
export function useShelves(catalog: Catalog | null, customs: readonly LibraryItem[]) {
  const favouriteIds = useLibraryPrefs((s) => s.favourites);
  const viewed = useLibraryPrefs((s) => s.viewed);
  const logged = useRecentlyLogged();
  return useMemo(() => {
    const resolve = (ids: string[]) =>
      ids.map((id) => resolveItem(id, catalog, customs)).filter((x): x is LibraryItem => !!x);
    return {
      favourites: resolve(favouriteIds),
      recent: resolve(mergeRecent(logged, viewed, 10)),
    };
  }, [catalog, customs, favouriteIds, viewed, logged]);
}
