/**
 * Wrapped story colours (W8, Spotify-style): calm token backgrounds rotate card by card, and the
 * text colour is whichever of black / white (the inverse pair) reads best on it. Pure, so a test
 * proves every card in both themes clears WCAG AA (4.5:1) for its text.
 */
import type { ColorToken, ColorTokens } from '@/theme';
import { contrastRatio } from '@/theme/contrast';

/** Background rotation: accent, protein blue, fat violet, then the inverse slab. */
export const STORY_BACKGROUNDS: readonly ColorToken[] = [
  'accent',
  'macroProtein',
  'macroFat',
  'inverse',
];

export type StoryColors = { bg: string; fg: string; bgToken: ColorToken };

export function storyColors(c: ColorTokens, index: number): StoryColors {
  const n = STORY_BACKGROUNDS.length;
  const bgToken = STORY_BACKGROUNDS[((index % n) + n) % n]!;
  const bg = c[bgToken];
  const fg =
    contrastRatio(c.inverse, bg) >= contrastRatio(c.onInverse, bg) ? c.inverse : c.onInverse;
  return { bg, fg, bgToken };
}
