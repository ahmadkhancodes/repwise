# Media pipeline (Cloudinary) — plan

Implements build bible sheet 29 ("Exercise media pipeline"). **No media files live in this repo.** Every `mediaId` in `exercises.json` and `recipes.json` is a placeholder Cloudinary public id until licensed assets are uploaded.

## Naming

| Asset | Cloudinary public id | Resource type |
|---|---|---|
| Exercise demo loop | `repwise/exercises/<exercise-id>` | video (MP4 master; GIF sources are converted on upload) |
| Exercise poster | derived from the video (no separate upload) | image transform |
| Recipe photo | `repwise/recipes/<recipe-id>` | image |

- The public id equals the content id, so renaming an exercise is not allowed: `id` is stable forever.
- Folders: `repwise/exercises/`, `repwise/recipes/`. Tags: `licence:<code>`, `source:<set>`, `pattern:<pattern>` or `cuisine:<cuisine>`.
- Context metadata on every asset: `licence`, `source_url`, `attribution` (if CC-BY), `reviewed_dark_mode=true|false`.

## Upload

1. An ingest script maps each licensed source file to an exercise id. Unmatched files are rejected, never guessed.
2. Upload with `public_id = <id>`, `overwrite = false` and `invalidate = true` only for intentional replacements.
3. GIF sources are uploaded as video (`resource_type: video`) so Cloudinary can serve MP4/WebM, which are 5–10× smaller than GIF.
4. The licence for each set is recorded in SOURCES.md before anything is uploaded.

## Delivery transforms

| Use | URL transform | Target |
|---|---|---|
| Player card loop (480 px) | `video/upload/f_auto:video,q_auto,w_480,c_limit,ac_none,du_8/repwise/exercises/<id>` | ≤ 300 KB, no audio, ≤ 8 s loop |
| List poster (first frame) | `video/upload/so_0,f_auto,q_auto,w_160,h_160,c_fill/repwise/exercises/<id>.jpg` | ≤ 15 KB |
| Detail poster | `video/upload/so_0,f_auto,q_auto,w_480,c_limit/repwise/exercises/<id>.jpg` | ≤ 40 KB |
| Recipe card | `image/upload/f_auto,q_auto,w_400,ar_4:3,c_fill,g_auto/repwise/recipes/<id>` | ≤ 40 KB |
| Recipe hero | `image/upload/f_auto,q_auto,w_1080,ar_16:9,c_fill,g_auto/repwise/recipes/<id>` | ≤ 150 KB |

- `f_auto` picks animated WebP/AVIF or MP4/WebM per device; `q_auto` picks quality.
- Light/dark: source loops are shot or exported on a transparent or neutral mid-grey background. If a source has a white background, add `e_make_transparent` at ingest (not at delivery) and review it in both themes.
- Use named transformations (`t_ex_loop`, `t_ex_poster`, `t_ex_thumb`, `t_rcp_card`, `t_rcp_hero`) so URLs stay short and changes need no app update.

## First frame under 300 ms

The poster frame must be on screen in under 300 ms on a mid-range Android over 4G:

1. Lists render only the poster (`so_0` JPEG/WebP thumbnail, ≤ 15 KB) — never the loop.
2. The detail and player screens show the poster immediately as `placeholder`, then swap in the loop when it is ready (`expo-image` `placeholder` + `transition={180}`).
3. Today's session media is prefetched on Wi-Fi after the plan syncs (`Image.prefetch(urls, 'disk')`), so the player opens from disk cache.
4. Loops are capped at 480 px wide and 8 s, with no audio, keeping first bytes small.
5. Each content record can carry a tiny blurhash later (`blurhash` field, optional) so a placeholder paints at 0 ms with no network at all.

## Caching (expo-image)

- `cachePolicy="memory-disk"` everywhere; `recyclingKey={id}` in FlashList rows.
- URLs are immutable (versioned by Cloudinary's `v<timestamp>` segment), so the disk cache never needs manual busting.
- The workout player never blocks on media: with no network and no cache, it shows the exercise name, steps and an icon tile.
- Prefetch budget: today's session plus tomorrow's (about 20 assets, under 6 MB) on Wi-Fi only.

## QA (sheet 29)

- Every exercise has media before it can be in a generated plan (the planner filters out records whose asset is missing once media is live).
- Dark-mode check of every GIF/photo (`reviewed_dark_mode=true` before publish).
- Licence recorded for every asset; any CC-BY set adds its credit to Settings → About → Attributions.
