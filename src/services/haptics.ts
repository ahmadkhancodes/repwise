import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics per CLAUDE.md: selection on pickers, light on taps, success on the
 * core action. Never on scroll. Android uses the system haptic constants
 * (feel native, respect the user's touch-feedback setting); iOS uses the
 * Taptic Engine generators. Failures are swallowed — haptics are never critical.
 */
function run(p: () => Promise<void>): void {
  p().catch(() => undefined);
}

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
};
