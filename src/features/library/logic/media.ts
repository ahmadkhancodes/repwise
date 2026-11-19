/**
 * Cloudinary delivery URLs for exercise media (sheet 29, packages/content/MEDIA.md).
 *
 * Masters are two still IMAGES per exercise (start and end frame, from free-exercise-db,
 * Unlicense; see docs/MEDIA_STATUS.md):
 *  - `repwise/exercises/<id>`      start frame
 *  - `repwise/exercises/<id>-end`  end frame
 *
 * The app asks Cloudinary for:
 *  - thumb  (lists, 160 px square): start frame, `c_fill,g_auto` keeps the athlete in frame, WebP ≈ 6–12 KB
 *  - poster (detail/player, 480 px): start frame, WebP ≈ 20–35 KB → painted first
 *  - frames ([start, end], 480 px): the "loop" is a client-side 2-frame crossfade driven by
 *    `crossfadeOpacity()`; `loop` itself is the start frame so a renderer that only knows
 *    `loop` still shows a correct still image.
 *
 * Explicit `f_webp` instead of `f_auto`: f_auto picks a format from the Accept header, which the
 * native image loaders do not send reliably. WebP decodes on both platforms.
 *
 * First frame < 300 ms on 4G: lists only ever load the thumb; detail shows the poster
 * (one ~30 KB request, or the disk cache). The end frame is prefetched by the same cache.
 *
 * Returns null — the UI shows the offline placeholder and makes NO request — when:
 *  - no cloud name is configured (EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME), or
 *  - the public id is unsafe, or
 *  - the exercise has no licensed demo (`exerciseHasMedia`, packages/content/media/exercises-with-media.json),
 *    so the ~100 exercises without one never trigger a 404. Any other failure (e.g. not uploaded
 *    yet) falls back to the placeholder through the component's onError.
 */
import { exerciseHasMedia } from '@repwise/content';

export type MediaUrls = {
  thumb: string;
  poster: string;
  /** Still start frame (kept for renderers that do not crossfade). */
  loop: string;
  /** [start, end] at poster size, for the 2-frame crossfade. */
  frames: readonly [string, string];
};

export const THUMB_TRANSFORM = 'c_fill,g_auto,h_160,w_160,q_auto,f_webp';
export const POSTER_TRANSFORM = 'c_limit,w_480,q_auto,f_webp';
export const END_SUFFIX = '-end';
const EXERCISE_PREFIX = 'repwise/exercises/';

export function cloudName(): string | null {
  const v = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return v && /^[a-z0-9_-]+$/i.test(v) ? v : null;
}

/** Public ids are `repwise/<folder>/<kebab-id>`; anything else is rejected (no URL injection). */
export function isSafePublicId(id: string): boolean {
  return /^[a-z0-9]+(?:[/_-][a-z0-9]+)*$/.test(id);
}

/** Default check: `repwise/exercises/<id>` has a licensed demo. */
export function isExerciseMediaLive(mediaId: string): boolean {
  return mediaId.startsWith(EXERCISE_PREFIX) && exerciseHasMedia(mediaId.slice(EXERCISE_PREFIX.length));
}

export function exerciseMediaUrls(
  mediaId: string | null | undefined,
  cloud: string | null = cloudName(),
  isLive: (mediaId: string) => boolean = isExerciseMediaLive,
): MediaUrls | null {
  if (!cloud || !mediaId || !isSafePublicId(mediaId) || !isLive(mediaId)) return null;
  const base = `https://res.cloudinary.com/${cloud}/image/upload`;
  const poster = `${base}/${POSTER_TRANSFORM}/${mediaId}.webp`;
  const end = `${base}/${POSTER_TRANSFORM}/${mediaId}${END_SUFFIX}.webp`;
  return {
    thumb: `${base}/${THUMB_TRANSFORM}/${mediaId}.webp`,
    poster,
    loop: poster,
    frames: [poster, end],
  };
}

/** Timing of the 2-frame demo loop: slower than UI motion so it reads as movement, not a flicker. */
export const CROSSFADE = { holdMs: 900, fadeMs: 600 } as const;

/**
 * Opacity (0–1) of the END frame layered over the start frame, `elapsedMs` into the loop:
 * hold start → fade in end → hold end → fade back to start, repeating.
 * Pure and deterministic so the renderer (Reanimated or a timer) stays trivial.
 */
export function crossfadeOpacity(
  elapsedMs: number,
  { holdMs, fadeMs }: { holdMs: number; fadeMs: number } = CROSSFADE,
): number {
  const cycle = 2 * (holdMs + fadeMs);
  if (!Number.isFinite(elapsedMs) || cycle <= 0) return 0;
  const t = ((elapsedMs % cycle) + cycle) % cycle;
  if (t < holdMs) return 0;
  if (t < holdMs + fadeMs) return fadeMs === 0 ? 1 : (t - holdMs) / fadeMs;
  if (t < 2 * holdMs + fadeMs) return 1;
  return fadeMs === 0 ? 0 : 1 - (t - 2 * holdMs - fadeMs) / fadeMs;
}
