import { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { motion } from '@/theme';

/** Card entrance: spring (damping 18, stiffness 180) with a 20 ms list stagger (sheet 11). */
export function enterAt(index: number, reduceMotion: boolean) {
  if (reduceMotion) return undefined;
  return FadeInDown.delay(index * motion.listStagger * 3)
    .springify()
    .damping(motion.spring.damping)
    .stiffness(motion.spring.stiffness);
}

export function exitFade(reduceMotion: boolean) {
  return reduceMotion ? undefined : FadeOut.duration(motion.duration.fast);
}

/** Smooth re-layout when cards appear or leave. */
export function layoutSpring(reduceMotion: boolean) {
  return reduceMotion
    ? undefined
    : LinearTransition.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness);
}
