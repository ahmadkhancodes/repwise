/**
 * Exercise hero (S19 / S14) maths and copy, pure so they are unit-tested: where the figure sits,
 * what the overlays say and what a screen reader hears.
 */
import type { Equipment, Level, Muscle, PatternFamily } from '@repwise/content';

import { VIEW_H, VIEW_W, type BodyView } from './bodyMap';
import { mainEquipment } from './glyphs';
import { EQUIPMENT_LABEL, LEVEL_LABEL, MUSCLE_LABEL, PATTERN_LABEL } from './labels';

/** What the hero needs to know about an exercise (a content Exercise or a LibraryItem fits). */
export type HeroExercise = {
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
  equipment?: readonly Equipment[];
  patternFamily?: PatternFamily | null;
  level?: Level | null;
};

/** Figure position in the hero: centred a little right so the left third holds the overlays. */
export const HERO_FIGURE_X = 0.64;

export type HeroLayout = {
  width: number;
  height: number;
  /** Uniform figure scale (view units → px). */
  scale: number;
  /** Top-left of the figure in px. */
  x: number;
  y: number;
  /** Centre of the figure (glow, flip pivot). */
  cx: number;
  cy: number;
  /** Width the left overlays may use without touching the figure. */
  textWidth: number;
};

export function heroLayout(width: number, aspectRatio: number, pad: number): HeroLayout {
  const w = Math.max(0, width);
  const height = aspectRatio > 0 ? w / aspectRatio : 0;
  const scale = Math.max(0, Math.min((height - pad * 2) / VIEW_H, (w * 0.5) / VIEW_W));
  const figW = VIEW_W * scale;
  const figH = VIEW_H * scale;
  const cx = Math.min(w * HERO_FIGURE_X, w - pad - figW / 2);
  const x = cx - figW / 2;
  const y = (height - figH) / 2;
  return {
    width: w,
    height,
    scale,
    x,
    y,
    cx,
    cy: y + figH * 0.38,
    textWidth: Math.max(0, x - pad * 1.5),
  };
}

export type HeroOverlay = {
  level: string | null;
  pattern: string | null;
  equipment: string | null;
  equipmentKey: Equipment | null;
};

export function heroOverlay(e: HeroExercise | null | undefined): HeroOverlay {
  const kit = e?.equipment ? mainEquipment(e.equipment) : null;
  return {
    level: e?.level ? LEVEL_LABEL[e.level] : null,
    pattern: e?.patternFamily ? PATTERN_LABEL[e.patternFamily] : null,
    equipment: kit ? EQUIPMENT_LABEL[kit] : null,
    equipmentKey: kit,
  };
}

/** "Barbell back squat. Front view. Main: Quads, Glutes. Also: Hamstrings. Barbell, Squat, Intermediate." */
export function heroLabel(
  name: string,
  e: HeroExercise | null | undefined,
  view: BodyView,
  showingDemo: boolean,
): string {
  const parts = [showingDemo ? `${name} demonstration` : name];
  if (e) {
    parts.push(`${view === 'front' ? 'Front' : 'Back'} view`);
    if (e.primaryMuscles.length)
      parts.push(`Main: ${e.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')}`);
    if (e.secondaryMuscles.length)
      parts.push(`Also: ${e.secondaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')}`);
    const o = heroOverlay(e);
    const meta = [o.equipment, o.pattern, o.level].filter(Boolean).join(', ');
    if (meta) parts.push(meta);
  }
  return `${parts.join('. ')}.`;
}
