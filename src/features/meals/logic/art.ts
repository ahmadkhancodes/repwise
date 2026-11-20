/**
 * Recipe art: the designed placeholder every recipe shows until its photo exists (Cloudinary is
 * blocked, docs/MEDIA_STATUS.md). A recipe maps to a food-category glyph (from its main protein,
 * title keywords and meal slot) and a soft tint family (from its cuisine, else its slot). Colours
 * are derived from theme tokens only (no hex in features). Pure, deterministic, unit-tested.
 */
import type { ColorTokens } from '@/theme';

export type ArtGlyph =
  | 'drumstick'
  | 'beef'
  | 'fish'
  | 'shrimp'
  | 'egg'
  | 'milk'
  | 'bean'
  | 'sprout'
  | 'nut'
  | 'wheat'
  | 'croissant'
  | 'salad'
  | 'soup'
  | 'pot'
  | 'sandwich'
  | 'shake'
  | 'apple'
  | 'plate';

/** Tint families, each backed by one colour token. */
export type ArtTint = 'warm' | 'fresh' | 'cool' | 'berry';

export const TINT_TOKEN: Record<ArtTint, keyof ColorTokens> = {
  warm: 'warning',
  fresh: 'accent',
  cool: 'macroProtein',
  berry: 'macroFat',
};

export type RecipeArtInput = {
  title?: string | null;
  cuisine?: string | null;
  /** The recipe's slots; the first one is used when `slot` is not given. */
  slots?: readonly string[] | null;
  /** The meal slot it is shown in (wins over `slots`). */
  slot?: string | null;
  mainProtein?: string | null;
  mediaId?: string | null;
};

export type RecipeArt = {
  glyph: ArtGlyph;
  tint: ArtTint;
  /** Spoken description, e.g. "Chicken dish". */
  label: string;
  mediaId: string | null;
};

/** Title keywords beat the protein (a lentil soup reads as soup, not beans). First match wins. */
const KEYWORDS: [RegExp, ArtGlyph][] = [
  [/\b(smoothie|shake|lassi)\b/i, 'shake'],
  [/\b(soup|broth|ramen|pho|shorba)\b/i, 'soup'],
  [/\b(curry|karahi|dal|daal|stew|tagine|chilli|chili|korma|masala|biryani|haleem|nihari)\b/i, 'pot'],
  [/\bsalad\b/i, 'salad'],
  [/\b(wrap|sandwich|toastie|toast|bagel|burger|pitta|pita|taco|burrito|quesadilla|paratha roll)\b/i, 'sandwich'],
  [/\b(oat|oats|porridge|granola|muesli|pancakes?|overnight)\b/i, 'wheat'],
  [/\b(omelette|omelet|frittata|shakshuka|scrambled)\b/i, 'egg'],
];

const PROTEIN_GLYPH: Record<string, ArtGlyph> = {
  chicken: 'drumstick',
  turkey: 'drumstick',
  beef: 'beef',
  lamb: 'beef',
  goat: 'beef',
  pork: 'beef',
  fish: 'fish',
  shellfish: 'shrimp',
  eggs: 'egg',
  dairy: 'milk',
  legumes: 'bean',
  soy: 'sprout',
  nuts_seeds: 'nut',
  grains: 'wheat',
};

const SLOT_GLYPH: Record<string, ArtGlyph> = {
  breakfast: 'croissant',
  lunch: 'salad',
  dinner: 'plate',
  snack: 'apple',
};

const CUISINE_TINT: Record<string, ArtTint> = {
  pakistani: 'warm',
  indian: 'warm',
  middle_eastern: 'warm',
  gulf: 'warm',
  north_african: 'warm',
  mexican: 'warm',
  mediterranean: 'fresh',
  italian: 'fresh',
  southeast_asian: 'fresh',
  east_asian: 'berry',
  american: 'cool',
  british: 'cool',
};

const SLOT_TINT: Record<string, ArtTint> = {
  breakfast: 'warm',
  lunch: 'fresh',
  dinner: 'cool',
  snack: 'berry',
};

const GLYPH_LABEL: Record<ArtGlyph, string> = {
  drumstick: 'Chicken dish',
  beef: 'Meat dish',
  fish: 'Fish dish',
  shrimp: 'Seafood dish',
  egg: 'Egg dish',
  milk: 'Dairy dish',
  bean: 'Bean dish',
  sprout: 'Plant-based dish',
  nut: 'Nuts and seeds',
  wheat: 'Grain dish',
  croissant: 'Breakfast',
  salad: 'Salad',
  soup: 'Soup',
  pot: 'Curry or stew',
  sandwich: 'Wrap or sandwich',
  shake: 'Smoothie or shake',
  apple: 'Snack',
  plate: 'Meal',
};

/** Glyph + tint for a recipe (or a bare meal slot when the recipe is unknown). Pure. */
export function recipeArt(input: RecipeArtInput): RecipeArt {
  const slot = input.slot ?? input.slots?.[0] ?? null;
  const title = input.title ?? '';
  const keyword = KEYWORDS.find(([re]) => re.test(title))?.[1];
  const glyph: ArtGlyph =
    keyword ??
    (input.mainProtein ? PROTEIN_GLYPH[input.mainProtein] : undefined) ??
    (slot ? SLOT_GLYPH[slot] : undefined) ??
    'plate';
  const tint: ArtTint =
    (input.cuisine ? CUISINE_TINT[input.cuisine] : undefined) ??
    (slot ? SLOT_TINT[slot] : undefined) ??
    'fresh';
  return { glyph, tint, label: GLYPH_LABEL[glyph], mediaId: input.mediaId ?? null };
}

// ---------------------------------------------------------------------------
// Colour: soft gradients derived from tokens
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` blended over `b` at `amount` (0 → b, 1 → a). Falls back to `b` for non-hex input. Pure. */
export function mixColor(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return b;
  const k = Math.max(0, Math.min(1, amount));
  const out = ca.map((v, i) => Math.round(v * k + cb[i]! * (1 - k)));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * Gradient stops and glyph colour for a tint. Light: a pastel wash over `surface`; dark: a deep
 * tinted surface. The glyph is the tint colour pulled toward textPrimary so it reads as ink.
 */
export function artPalette(
  tint: ArtTint,
  colors: Pick<ColorTokens, 'surface' | 'textPrimary'> & Partial<ColorTokens>,
  scheme: 'light' | 'dark',
): { from: string; to: string; glyph: string } {
  const base = colors[TINT_TOKEN[tint]] ?? colors.textPrimary;
  const strong = scheme === 'light' ? 0.24 : 0.3;
  const soft = scheme === 'light' ? 0.07 : 0.1;
  return {
    from: mixColor(base, colors.surface, strong),
    to: mixColor(base, colors.surface, soft),
    glyph: mixColor(colors.textPrimary, base, scheme === 'light' ? 0.25 : 0.1),
  };
}

// ---------------------------------------------------------------------------
// Photo slot (real image once uploaded)
// ---------------------------------------------------------------------------

export const RECIPE_THUMB_TRANSFORM = 'c_fill,g_auto,h_192,w_192,q_auto,f_webp';
export const RECIPE_HERO_TRANSFORM = 'c_fill,g_auto,h_600,w_960,q_auto,f_webp';

/**
 * Cloudinary URL for a recipe photo, or null (the art placeholder shows and nothing is requested)
 * when there is no cloud name or the id is not `repwise/recipes/<id>`.
 */
export function recipeImageUrl(
  mediaId: string | null | undefined,
  size: 'thumb' | 'hero',
  cloud: string | null,
): string | null {
  if (!cloud || !/^[a-z0-9_-]+$/i.test(cloud)) return null;
  if (!mediaId || !/^repwise\/recipes\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mediaId)) return null;
  const tx = size === 'hero' ? RECIPE_HERO_TRANSFORM : RECIPE_THUMB_TRANSFORM;
  return `https://res.cloudinary.com/${cloud}/image/upload/${tx}/${mediaId}.webp`;
}
