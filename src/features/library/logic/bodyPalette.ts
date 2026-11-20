/**
 * Colours of the muscle map, from theme tokens only (no literals). One palette for the exercise
 * hero, the list thumbnail and the W6 recovery heatmap, so the app draws one body in one style.
 *
 * The figure is always a step away from what it sits on (the audit's "outline disappears" bug was
 * a surface figure on a surface card): white on light grey in light mode, a lifted grey on near
 * black in dark mode. Idle muscles are one more step, main muscles are the accent, and the
 * secondary tint is accentSoft pushed toward the accent so it still reads on a white figure.
 */
import type { ColorScheme, ColorTokens } from '@/theme';

import { mixColor } from './color';

/** What the figure is drawn on. */
export type BodyBackdrop = 'bg' | 'surface';

export type BodyPalette = {
  figure: string;
  idle: string;
  primary: string;
  secondary: string;
  /** Soft halo behind the figure. */
  glow: string;
  /** Outline of a selected muscle (heatmap). */
  selected: string;
};

/** How far the secondary tint moves from accentSoft toward the accent. */
export const SECONDARY_MIX = 0.42;
/** Fatigue below this reads as fresh (idle colour). */
export const HEAT_FLOOR = 0.05;

export function bodyPalette(
  c: ColorTokens,
  scheme: ColorScheme,
  backdrop: BodyBackdrop = 'surface',
): BodyPalette {
  const light = scheme === 'light';
  const figure = light
    ? backdrop === 'surface'
      ? c.bg
      : c.surface
    : backdrop === 'surface'
      ? c.surface2
      : c.surface;
  const idle = light
    ? backdrop === 'surface'
      ? c.surface2
      : mixColor(c.surface2, c.textTertiary, 0.12)
    : mixColor(c.surface2, c.textTertiary, backdrop === 'surface' ? 0.24 : 0.14);
  return {
    figure,
    idle,
    primary: c.accent,
    secondary: mixColor(c.accentSoft, c.accent, SECONDARY_MIX),
    glow: c.accent,
    selected: c.textPrimary,
  };
}

/** Heatmap fill for a muscle with `fatigue` 0..1 (engine heatmap). */
export function heatColor(p: BodyPalette, fatigue: number): string {
  const f = Number.isFinite(fatigue) ? Math.min(1, Math.max(0, fatigue)) : 0;
  if (f <= HEAT_FLOOR) return p.idle;
  return mixColor(p.idle, p.primary, 0.25 + f * 0.75);
}

/** Legend stops built from the same maths as the map (audit: the legend must match). */
export function heatLegend(p: BodyPalette): { key: string; label: string; color: string }[] {
  return [
    { key: 'fresh', label: 'Fresh', color: heatColor(p, 0) },
    { key: 'recovering', label: 'Recovering', color: heatColor(p, 0.35) },
    { key: 'worked', label: 'Worked', color: heatColor(p, 1) },
  ];
}
