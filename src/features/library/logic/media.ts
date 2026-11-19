/**
 * Cloudinary delivery URLs for exercise media (sheet 29, packages/content/MEDIA.md).
 *
 * Masters are uploaded as video (`repwise/exercises/<id>`). expo-image cannot play MP4, so the
 * app asks Cloudinary for:
 *  - thumb  (lists, 160 px square): first frame `so_0`, WebP, ≈ 6–15 KB
 *  - poster (detail/player, 480 px): first frame `so_0`, WebP, ≈ 20–40 KB → painted first
 *  - loop   (detail/player, 480 px): animated WebP (`fl_awebp,fl_animated`), 15 fps, ≤ 8 s,
 *    infinite loop (`e_loop`) → swapped in over the poster when it arrives
 *
 * Explicit `f_webp` instead of `f_auto`: f_auto picks a format from the Accept header, which the
 * native image loaders do not send reliably (it could return AVIF or MP4). Animated WebP decodes
 * on both platforms (SDWebImage on iOS, Glide on Android).
 *
 * First frame < 300 ms on 4G: lists only ever load the ≤ 15 KB thumb; detail shows the poster
 * (one ~30 KB request, or the disk cache) and never waits for the loop.
 *
 * No cloud name configured (EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME) → null: the UI shows the offline
 * placeholder and makes no request. Media are not uploaded yet, so the placeholder is also what
 * any 404 falls back to.
 */

export type MediaUrls = { thumb: string; poster: string; loop: string };

export const THUMB_TRANSFORM = 'so_0,w_160,h_160,c_fill,q_auto,f_webp';
export const POSTER_TRANSFORM = 'so_0,w_480,c_limit,q_auto,f_webp';
export const LOOP_TRANSFORM = 'w_480,c_limit,q_auto,fps_15,du_8,e_loop/f_webp,fl_awebp,fl_animated';

export function cloudName(): string | null {
  const v = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return v && /^[a-z0-9_-]+$/i.test(v) ? v : null;
}

/** Public ids are `repwise/<folder>/<kebab-id>`; anything else is rejected (no URL injection). */
export function isSafePublicId(id: string): boolean {
  return /^[a-z0-9]+(?:[/_-][a-z0-9]+)*$/.test(id);
}

export function exerciseMediaUrls(
  mediaId: string | null | undefined,
  cloud: string | null = cloudName(),
): MediaUrls | null {
  if (!cloud || !mediaId || !isSafePublicId(mediaId)) return null;
  const base = `https://res.cloudinary.com/${cloud}/video/upload`;
  return {
    thumb: `${base}/${THUMB_TRANSFORM}/${mediaId}.webp`,
    poster: `${base}/${POSTER_TRANSFORM}/${mediaId}.webp`,
    loop: `${base}/${LOOP_TRANSFORM}/${mediaId}.webp`,
  };
}
