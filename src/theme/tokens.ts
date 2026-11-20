/**
 * Repwise design tokens — the single source of truth for colour, type, spacing,
 * radius, sizing and motion. Values come from build bible sheet 11 (light AND
 * dark). Deviations are logged in docs/DECISIONS.md (D4–D6):
 *  - textTertiary darkened in both themes so it passes WCAG AA (4.5:1).
 *  - added on* foreground tokens, accentText, success, scrim and ripple.
 *  - screen padding 20 (sheet 10 + CLAUDE.md), motion springs from CLAUDE.md.
 *  - DS upgrade (feat/ds): borderStrong, accent/dangerOnInverse, hero type, gym hit sizes;
 *    light textTertiary/danger/macroCarb darkened so every pair in
 *    __tests__/contrast.test.ts passes in both themes.
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
  /**
   * Outlines of UNSELECTED interactive controls (tick, checkbox, radio, switch-off, stepper
   * edges). ≥ 3:1 on bg, surface AND surface2 in both themes (WCAG 1.4.11). Never for dividers.
   */
  borderStrong: string;
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
  /** Accent glyphs on an inverse surface (toast icon, rest bar) — ≥ 4.5:1 in both themes. */
  accentOnInverse: string;
  /** Danger glyphs on an inverse surface (toast icon) — ≥ 4.5:1 in both themes. */
  dangerOnInverse: string;
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
  | 'hero'
  | 'display'
  | 'title1'
  | 'title2'
  | 'headline'
  | 'body'
  | 'callout'
  | 'caption'
  | 'eyebrow';

export type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  /** Cap for very large text so 130% scale still fits; undefined = uncapped. */
  maxFontSizeMultiplier?: number;
  /** Tight tracking for big numerals (negative = tighter). */
  letterSpacing?: number;
  /** Always render with tabular figures (numbers that tick). */
  tabular?: boolean;
  /** Rendered uppercase by style (the source text stays sentence case for screen readers). */
  uppercase?: boolean;
};

export const typography: Record<TypeVariant, TypeStyle> = {
  /**
   * Hero numbers: rest timer, kcal reveal, PR moment, summary total. Glanceable at 1 m.
   * Always tabular + tight. Pair with fitFontSize (src/ui/fit.ts) inside rings so it never
   * overflows at 130% font.
   */
  hero: {
    fontFamily: fonts.bold,
    fontSize: 72,
    lineHeight: 76,
    maxFontSizeMultiplier: 1.3,
    letterSpacing: -2,
    tabular: true,
  },
  display: {
    fontFamily: fonts.bold,
    fontSize: 40,
    lineHeight: 44,
    maxFontSizeMultiplier: 1.3,
    letterSpacing: -0.5,
  },
  title1: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, maxFontSizeMultiplier: 1.3 },
  title2: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, maxFontSizeMultiplier: 1.5 },
  headline: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  /**
   * Section kicker above a title ("Up next", "Your plan is ready"): caption size, semibold,
   * uppercase by style with open tracking. Write the text in sentence case.
   */
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    uppercase: true,
  },
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
  /** Gym target (sweaty hands, one thumb): set check, stepper ±, rest controls. */
  hitGym: 56,
  /** Gym primary target: "Log set", hero tick hit box, bench-mode controls. */
  hitGymLarge: 64,
  /** Primary / secondary / destructive button height (sheet 11). */
  button: 56,
  /** List row minimum height. */
  row: 56,
  icon: 24,
  iconMedium: 20,
  iconSmall: 16,
  iconStroke: 1.75,
  /** Check marks inside filled ticks / day dots (replaces 2.5 literals). */
  iconStrokeBold: 2.5,
  hairline: 1,
  /** Control outlines (tick, switch-off, selected card). */
  borderThick: 2,
  ring: 120,
  /** BigTimer / kcal-reveal ring. Fits a 360dp screen with screen padding. */
  ringHero: 240,
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
