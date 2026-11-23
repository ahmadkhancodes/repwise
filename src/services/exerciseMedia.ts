/**
 * Exercise demo media: animated ExerciseDB V1 GIFs (licensed, D-EXDB-LICENCE), hosted on our own
 * CDN (Vercel Blob today), never bundled in the app (owner override, 22 Nov 2026).
 *
 * - Our engine exercises map to an ExerciseDB id through `packages/content/exercise_media.json`
 *   (built by scripts/media/build-exercisedb-map.mjs, hand-checked; only matches WITH a GIF).
 * - Library-only V1 exercises carry `mediaId = exercisedb/<v1Id>` (set only when V1 has a GIF).
 * - The host is `EXPO_PUBLIC_MEDIA_BASE` (https only), so moving to R2 or another CDN needs no
 *   code change. URL: `<base>/exercisedb/v1/gifs/<v1Id>.gif`.
 * - No GIF (unmapped, custom exercise, bad id) → `gifUrl: null`; the UI shows the muscle map at
 *   once and makes no request. A GIF that fails to load falls back the same way (component onError).
 *
 * Pure apart from `prefetchExerciseMedia`, which warms the expo-image memory-disk cache.
 */
import type { Muscle } from '@repwise/content';

/** Our Vercel Blob store (store `repwise-exercise-media`). */
export const DEFAULT_MEDIA_BASE = 'https://ed8eoellocipjc1f.public.blob.vercel-storage.com';
export const GIF_PATH = 'exercisedb/v1/gifs';
const OUR_PREFIX = 'repwise/exercises/';
const EXDB_PREFIX = 'exercisedb/';
const V1_ID = /^[A-Za-z0-9]{3,16}$/;

type MediaMap = Readonly<Record<string, string | null>>;
let mapCache: MediaMap | null = null;

/** Engine id → V1 id. Required lazily so the map stays off the first-frame import chain. */
function mediaMap(): MediaMap {
  if (!mapCache) {
    const raw = require('@repwise/content/exercise_media.json') as { exercises: MediaMap };
    mapCache = raw.exercises;
  }
  return mapCache;
}

/** Base URL from config: https only, no trailing slash; anything else → our default host. */
export function mediaBase(env: string | undefined = process.env.EXPO_PUBLIC_MEDIA_BASE): string {
  const v = env?.trim().replace(/\/+$/, '');
  return v && /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~/-]*)?$/i.test(v)
    ? v
    : DEFAULT_MEDIA_BASE;
}

export function isV1Id(id: string | null | undefined): id is string {
  return typeof id === 'string' && V1_ID.test(id);
}

/** `<base>/exercisedb/v1/gifs/<id>.gif`, or null for an unsafe id (no URL injection). */
export function gifUrlFor(v1Id: string | null | undefined, base: string = mediaBase()): string | null {
  return isV1Id(v1Id) ? `${base}/${GIF_PATH}/${v1Id}.gif` : null;
}

/** V1 id for an engine exercise id (null when there is no honest match with a GIF). */
export function v1IdForExercise(exerciseId: string, map: MediaMap = mediaMap()): string | null {
  const v = Object.hasOwn(map, exerciseId) ? map[exerciseId] : null;
  return isV1Id(v) ? v : null;
}

/** V1 id behind a LibraryItem/content `mediaId` (`repwise/exercises/<id>` or `exercisedb/<v1Id>`). */
export function v1IdForMediaId(
  mediaId: string | null | undefined,
  map?: MediaMap,
): string | null {
  if (!mediaId) return null;
  if (mediaId.startsWith(EXDB_PREFIX)) {
    const id = mediaId.slice(EXDB_PREFIX.length);
    return isV1Id(id) ? id : null;
  }
  if (mediaId.startsWith(OUR_PREFIX)) return v1IdForExercise(mediaId.slice(OUR_PREFIX.length), map);
  return null;
}

/** GIF URL for a `mediaId` (what lists, the detail page and the player hold). */
export function gifForMediaId(mediaId: string | null | undefined, base?: string): string | null {
  return gifUrlFor(v1IdForMediaId(mediaId), base);
}

export type ExerciseMediaInfo = {
  gifUrl: string | null;
  muscles: { primary: readonly Muscle[]; secondary: readonly Muscle[] };
};

/**
 * Everything the UI needs to show an exercise: the GIF (or null → muscle map) and the muscles for
 * the "Muscles worked" map. Engine ids and `exercisedb-<v1Id>` library ids are both accepted.
 */
export function mediaFor(
  exercise: {
    id: string;
    primaryMuscles?: readonly Muscle[];
    secondaryMuscles?: readonly Muscle[];
  },
  base?: string,
): ExerciseMediaInfo {
  const v1 = exercise.id.startsWith('exercisedb-')
    ? exercise.id.slice('exercisedb-'.length)
    : v1IdForExercise(exercise.id);
  return {
    gifUrl: gifUrlFor(v1, base),
    muscles: {
      primary: exercise.primaryMuscles ?? [],
      secondary: exercise.secondaryMuscles ?? [],
    },
  };
}

/** Unique GIF URLs for a list of engine exercise ids (today's + tomorrow's sessions). */
export function gifUrlsForExercises(ids: Iterable<string>, base?: string): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const url = mediaFor({ id }, base).gifUrl;
    if (url) out.add(url);
  }
  return [...out];
}

const prefetched = new Set<string>();

/**
 * Warm the expo-image memory-disk cache so the player never waits on a GIF. Fire-and-forget:
 * never throws, never blocks; each URL is requested once per app run.
 */
export async function prefetchExerciseMedia(ids: Iterable<string>): Promise<number> {
  const urls = gifUrlsForExercises(ids).filter((u) => !prefetched.has(u));
  if (!urls.length) return 0;
  urls.forEach((u) => prefetched.add(u));
  try {
    // Required on use, so expo-image stays off the first-frame import chain.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('expo-image') as typeof import('expo-image');
    await Image.prefetch(urls, 'memory-disk');
  } catch {
    // Offline or no native module: the hero falls back to the muscle map.
    urls.forEach((u) => prefetched.delete(u));
  }
  return urls.length;
}

/** Test hook. */
export function __resetExerciseMediaForTests(): void {
  prefetched.clear();
  mapCache = null;
}
