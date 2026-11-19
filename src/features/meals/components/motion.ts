import { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { motion } from '@/theme';

/** List entry: spring (damping 18 / stiffness 180) with the 20 ms stagger from sheet 11. */
export function enterAt(index: number, reduceMotion: boolean | null | undefined) {
  if (reduceMotion) return undefined;
  return FadeInDown.springify()
    .damping(motion.spring.damping)
    .stiffness(motion.spring.stiffness)
    .delay(index * motion.listStagger);
}

/** Re-layout when items change (swap, tick, delete). */
export function layoutSpring(reduceMotion: boolean | null | undefined) {
  if (reduceMotion) return undefined;
  return LinearTransition.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness);
}
