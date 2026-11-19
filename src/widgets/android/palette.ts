import type { HexColor } from 'react-native-android-widget';

import { colors, fonts, type ColorScheme, type ColorToken } from '@/theme';

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
  accent: HexColor;
  onAccent: HexColor;
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
    accent: c('accent'),
    onAccent: c('onAccent'),
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
