/**
 * Shared list / card motion (sheet 11): springs (damping 18, stiffness 180), a 20 ms list stagger
 * capped at one screenful, and nothing at all under Reduce Motion. Replaces the per-feature
 * `motion.ts` forks (Today and Eat).
 */
import { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { motion } from '@/theme';

/** Rows past this index enter together (only the first screenful staggers). */
export const STAGGER_CAP = 8;

/** Entrance delay for list item `index`: 20 ms steps, capped. Pure. */
export function staggerDelay(index: number): number {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return Math.min(i, STAGGER_CAP) * motion.listStagger;
}

/** Card / row entrance: fade up on the shared spring, staggered by `index`. */
export function enterAt(index: number, reduceMotion: boolean) {
  if (reduceMotion) return undefined;
  return FadeInDown.delay(staggerDelay(index))
    .springify()
    .damping(motion.spring.damping)
    .stiffness(motion.spring.stiffness);
}

export function exitFade(reduceMotion: boolean) {
  return reduceMotion ? undefined : FadeOut.duration(motion.duration.fast);
}

/** Smooth re-layout when cards appear or leave. Use only on the item that changes. */
export function layoutSpring(reduceMotion: boolean) {
  return reduceMotion
    ? undefined
    : LinearTransition.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness);
}
