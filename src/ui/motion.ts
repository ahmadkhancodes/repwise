/**
 * Reduce-motion safety for Reanimated layout animations (`entering`, `exiting`, `layout`).
 *
 * Under iOS Reduce Motion / Android "Remove animations", Reanimated still applies an entering
 * animation's initial values (opacity 0, an offset, scale 0) and then skips the animation. With a
 * `.delay(…)` or a spring this left content invisible on device (Maestro on Android with animations
 * off: QuizFrame options, the resume banner). The rule for the whole app: every layout animation
 * goes through {@link motionSafe} / {@link useMotionSafe} (or the list helpers in `listMotion.ts`,
 * which use it), so under reduced motion views render in their final state at once.
 * A Jest guard (`src/ui/__tests__/motionGuard.test.ts`) keeps every `entering=` on this path.
 */
import { useCallback } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/** Any Reanimated layout animation builder (FadeIn, ZoomIn.springify(), LinearTransition…). */
type LayoutAnimation = object;

/** The animation, or nothing under reduced motion (the view then renders final at once). Pure. */
export function motionSafe<T extends LayoutAnimation>(
  animation: T | null | undefined,
  reducedMotion: boolean,
): T | undefined {
  return reducedMotion || !animation ? undefined : animation;
}

/**
 * Hook form for components: `const safe = useMotionSafe();` then
 * `<Animated.View entering={safe(FadeInDown.delay(80).springify())}>`.
 */
export function useMotionSafe(): <T extends LayoutAnimation>(
  animation: T | null | undefined,
) => T | undefined {
  const reduced = useReducedMotion();
  return useCallback(
    <T extends LayoutAnimation>(animation: T | null | undefined) => motionSafe(animation, reduced),
    [reduced],
  );
}
