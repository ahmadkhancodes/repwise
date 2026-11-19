/**
 * Auto-fit for big numbers (rings, timers, hero totals) so they never overflow at 130% font.
 * We size the number ourselves (instead of relying on adjustsFontSizeToFit, which TextInput and
 * animated text do not support): estimate the rendered width of Inter Bold with tabular figures,
 * then shrink to the box. The estimate errs wide, so the real text always fits. Pure.
 */

import { spacing } from '@/theme/tokens';

/** Advance width per glyph as a fraction of the font size (Inter Bold, tabular, rounded up). */
const ADVANCE = { digit: 0.64, narrow: 0.32, space: 0.28, other: 0.66 } as const;

/** Estimated width (dp) of `text` at `fontSize` with `letterSpacing`. */
export function estimateTextWidth(text: string, fontSize: number, letterSpacing = 0): number {
  let em = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') em += ADVANCE.digit;
    else if (ch === ',' || ch === '.' || ch === ':' || ch === "'") em += ADVANCE.narrow;
    else if (ch === ' ') em += ADVANCE.space;
    else em += ADVANCE.other;
  }
  const chars = [...text].length;
  return em * fontSize + Math.max(0, chars - 1) * letterSpacing;
}

export type FitInput = {
  text: string;
  /** Box width the text must fit in (dp). */
  maxWidth: number;
  /** Token font size at 100%. */
  fontSize: number;
  /** OS font scale (PixelRatio.getFontScale()). */
  fontScale?: number;
  /** Token cap on font scaling (maxFontSizeMultiplier). */
  maxMultiplier?: number;
  letterSpacing?: number;
  /** Never shrink below this fraction of the token size (stays legible). */
  minScale?: number;
};

/**
 * Final font size in dp (render with allowFontScaling={false}): the user's scaled size, capped
 * by the token multiplier, shrunk to fit `maxWidth`, never below `minScale` of the token size.
 */
export function fitFontSize({
  text,
  maxWidth,
  fontSize,
  fontScale = 1,
  maxMultiplier,
  letterSpacing = 0,
  minScale = 0.4,
}: FitInput): number {
  const scale = maxMultiplier ? Math.min(fontScale, maxMultiplier) : fontScale;
  const wanted = fontSize * Math.max(scale, 0.1);
  const floor = fontSize * minScale;
  if (!text || !(maxWidth > 0)) return Math.max(floor, wanted);
  const width = estimateTextWidth(text, wanted, letterSpacing * (wanted / fontSize));
  if (width <= maxWidth) return wanted;
  const fitted = Math.floor(wanted * (maxWidth / width) * 10) / 10;
  return Math.max(floor, fitted);
}

/** Usable text width inside a ring: inner diameter minus breathing room on both sides. */
export function ringInnerWidth(
  size: number,
  strokeWidth: number,
  padding: number = spacing.xs,
): number {
  return Math.max(0, size - strokeWidth * 2 - padding * 2);
}
