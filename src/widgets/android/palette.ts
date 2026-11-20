import type { HexColor } from 'react-native-android-widget';

import { colors, fonts, radius, spacing, typography, type ColorScheme, type ColorToken } from '@/theme';

/** Theme tokens as the widget library's colour type (the same values as the app, light + dark). */
export function widgetColor(scheme: ColorScheme, token: ColorToken): HexColor {
  return colors[scheme][token] as HexColor;
}

export type WidgetPalette = {
  bg: HexColor;
  surface: HexColor;
  surface2: HexColor;
  text: HexColor;
  text2: HexColor;
  border: HexColor;
  accent: HexColor;
  accentText: HexColor;
  onAccent: HexColor;
  inverse: HexColor;
  onInverse: HexColor;
  protein: HexColor;
  carb: HexColor;
  fat: HexColor;
};

export function palette(scheme: ColorScheme): WidgetPalette {
  const c = (t: ColorToken) => widgetColor(scheme, t);
  return {
    bg: c('bg'),
    surface: c('surface'),
    surface2: c('surface2'),
    text: c('textPrimary'),
    text2: c('textSecondary'),
    border: c('border'),
    accent: c('accent'),
    accentText: c('accentText'),
    onAccent: c('onAccent'),
    inverse: c('inverse'),
    onInverse: c('onInverse'),
    protein: c('macroProtein'),
    carb: c('macroCarb'),
    fat: c('macroFat'),
  };
}

/** Inter is bundled into the widget via the config plugin's `fonts` list (app.config.ts). */
export const WIDGET_FONTS = {
  regular: fonts.regular,
  semibold: fonts.semibold,
  bold: fonts.bold,
} as const;

/** Widget metrics, all from the design tokens (sheet 11). */
export const WIDGET_METRICS = {
  pad: spacing.md,
  padCompact: spacing.sm,
  gap: spacing.xs,
  sm: spacing.sm,
  gapSmall: spacing.xxs,
  radius: radius.sheet,
  innerRadius: radius.card,
  pill: radius.pill,
  /** Pill buttons: 40dp visual height inside a larger tap row (widgets have no hit slop). */
  pillPadV: spacing.sm - spacing.xxs / 2,
  pillPadH: spacing.md,
  label: typography.caption.fontSize,
  small: typography.caption.fontSize,
  callout: typography.callout.fontSize,
  headline: typography.headline.fontSize,
  number: typography.title2.fontSize,
  big: typography.title1.fontSize,
} as const;

/**
 * Two concentric rings in one SVG: kcal outside, protein inside (sheet 17 "protein/kcal ring").
 */
export function dualRingSvg(
  outer: number,
  inner: number,
  size: number,
  stroke: number,
  colorsIn: { outer: string; inner: string; track: string },
): string {
  const half = size / 2;
  const arc = (p: number, r: number, color: string) => {
    const v = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
    const c = 2 * Math.PI * r;
    return (
      `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="${colorsIn.track}" stroke-width="${stroke}"/>` +
      (v > 0
        ? `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" ` +
          `stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${half} ${half})"/>`
        : '')
    );
  };
  const r1 = (size - stroke) / 2;
  const r2 = r1 - stroke - stroke / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    arc(outer, r1, colorsIn.outer) +
    (r2 > stroke ? arc(inner, r2, colorsIn.inner) : '') +
    `</svg>`
  );
}

/**
 * A progress ring as an SVG string (widgets cannot run Skia). `progress` 0–1, starts at 12 o'clock.
 */
export function ringSvg(progress: number, size: number, stroke: number, color: string, track: string): string {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (c * p).toFixed(2);
  const half = size / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>` +
    (p > 0
      ? `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" ` +
        `stroke-linecap="round" stroke-dasharray="${dash} ${c.toFixed(2)}" transform="rotate(-90 ${half} ${half})"/>`
      : '') +
    `</svg>`
  );
}
