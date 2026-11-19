import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/**
 * Haptics per CLAUDE.md: selection on pickers, light on taps, success on the
 * core action. Never on scroll. Android uses the system haptic constants
 * (feel native, respect the user's touch-feedback setting); iOS uses the
 * Taptic Engine generators. Failures are swallowed — haptics are never critical.
 *
 * Timing rule (DS upgrade): callers fire on press-OUT / commit (onPress, value committed),
 * never on press-in or scroll. Success toasts buzz once unless `silent` (no double buzz).
 */
function run(p: () => Promise<void>): void {
  p().catch(() => undefined);
}

/** Android rest-end waveform: three strong pulses, the last one longest (ms: wait, on, off…). */
export const REST_END_PATTERN = [0, 250, 120, 250, 120, 400];
/** Gap between the three iOS rest-end pulses (ms). */
export const REST_END_GAP_MS = 150;

export const haptics = {
  /** Light tap on buttons, rows, cards, set ticks. */
  light(): void {
    if (Platform.OS === 'android') {
      run(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key));
    } else if (Platform.OS === 'ios') {
      run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    }
  },
  /** Pickers, chips, segmented, steppers. */
  selection(): void {
    if (Platform.OS === 'android') {
      run(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick));
    } else if (Platform.OS === 'ios') {
      run(() => Haptics.selectionAsync());
    }
  },
  /** Core action done: workout finish, PR, purchase. */
  success(): void {
    if (Platform.OS === 'android') {
      run(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm));
    } else if (Platform.OS === 'ios') {
      run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    }
  },
  /**
   * Rest over: a strong, distinct triple that is felt with the phone on a bench or in a pocket.
   * Reserved for rest end (do not reuse for taps). Android: vibration waveform; iOS: three heavy
   * impacts 150 ms apart.
   */
  restEnd(): void {
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate(REST_END_PATTERN);
      } catch {
        // no vibrator — never critical
      }
    } else if (Platform.OS === 'ios') {
      for (let i = 0; i < 3; i++) {
        setTimeout(
          () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
          i * REST_END_GAP_MS,
        );
      }
    }
  },
};
