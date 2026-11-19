/**
 * Repwise design tokens — the single source of truth for colour, type, spacing,
 * radius, sizing and motion. Values come from build bible sheet 11 (light AND
 * dark). Deviations are logged in docs/DECISIONS.md (D4–D6):
 *  - textTertiary darkened in both themes so it passes WCAG AA (4.5:1).
 *  - added on* foreground tokens, accentText, success, scrim and ripple.
 *  - screen padding 20 (sheet 10 + CLAUDE.md), motion springs from CLAUDE.md.
 *
 * Nothing outside src/theme may contain a hex colour (enforced by ESLint).
 */

import palette from './colors.json';

export type ColorScheme = 'light' | 'dark';

export type ColorTokens = {
  /** Screen background */
  bg: string;
  /** Cards, inputs */
  surface: string;
  /** Pressed, segmented track */
  surface2: string;
  /** Dividers */
  border: string;
  /** Titles, numbers */
  textPrimary: string;
  /** Body */
  textSecondary: string;
  /** Hints (still AA on bg + surface) */
  textTertiary: string;
  /** Primary CTA fill for 'Start workout' / 'Start trial', progress, PR */
  accent: string;
  /** Text/icons placed on accent */
  onAccent: string;
  /** Accent used as text on bg / accentSoft (AA safe) */
  accentText: string;
  /** Selected chips */
  accentSoft: string;
  /** Uber-style primary buttons: black in light, white in dark */
  inverse: string;
  /** Text/icons placed on inverse */
  onInverse: string;
  success: string;
  warning: string;
  /** Destructive only */
  danger: string;
  /** Text/icons placed on danger */
  onDanger: string;
  macroProtein: string;
  macroCarb: string;
  macroFat: string;
  /** Sheet backdrop */
  scrim: string;
  /** Android ripple / pressed overlay */
  ripple: string;
};

/**
 * Raw values live in colors.json so app.config.ts (plain Node) can read the
 * same source for splash/icon backgrounds. The type below checks every key.
 */
export const colors: Record<ColorScheme, ColorTokens> = palette;

export type ColorToken = keyof ColorTokens;

/** Inter families loaded in app/_layout.tsx. Never pair with fontWeight (Android drops custom fonts). */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type TypeVariant =
  'display' | 'title1' | 'title2' | 'headline' | 'body' | 'callout' | 'caption';

export type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  /** Cap for very large text so 130% scale still fits; undefined = uncapped. */
  maxFontSizeMultiplier?: number;
};

export const typography: Record<TypeVariant, TypeStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 44, maxFontSizeMultiplier: 1.3 },
  title1: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, maxFontSizeMultiplier: 1.3 },
  title2: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, maxFontSizeMultiplier: 1.5 },
  headline: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
};

/** Spacing scale (sheet 11 + CLAUDE.md union). */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
  /** Screen side padding (sheet 10: 20px). */
  screen: 20,
  /** Card inner padding (sheet 11). */
  card: 16,
} as const;

/** Uber-style tight radii (sheet 11). */
export const radius = {
  button: 8,
  input: 8,
  card: 12,
  sheet: 16,
  pill: 999,
} as const;

export const sizes = {
  /** Minimum touch target (48dp). */
  touch: 48,
  /** Primary / secondary / destructive button height (sheet 11). */
  button: 56,
  /** List row minimum height. */
  row: 56,
  icon: 24,
  iconSmall: 16,
  iconStroke: 1.75,
  hairline: 1,
  ring: 120,
  ringStroke: 10,
  /** Wheel picker row height at 100% font scale. */
  wheelRow: 44,
} as const;

export const motion = {
  duration: { fast: 180, base: 220, slow: 280 },
  spring: { damping: 18, stiffness: 180, mass: 1 },
  pressScale: 0.98,
  listStagger: 20,
  toastMs: 3000,
} as const;

export type Theme = {
  scheme: ColorScheme;
  colors: ColorTokens;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  sizes: typeof sizes;
  motion: typeof motion;
};

export function buildTheme(scheme: ColorScheme): Theme {
  return { scheme, colors: colors[scheme], typography, spacing, radius, sizes, motion };
}

export const themes: Record<ColorScheme, Theme> = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
};
