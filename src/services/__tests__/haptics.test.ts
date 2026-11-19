import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

import { haptics, REST_END_GAP_MS, REST_END_PATTERN } from '../haptics';

describe(`haptics on ${Platform.OS}`, () => {
  beforeEach(() => jest.clearAllMocks());

  it('light tap', () => {
    haptics.light();
    if (Platform.OS === 'android') {
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
        Haptics.AndroidHaptics.Virtual_Key,
      );
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
    } else {
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
      expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    }
  });

  it('selection', () => {
    haptics.selection();
    if (Platform.OS === 'android') {
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
        Haptics.AndroidHaptics.Segment_Tick,
      );
    } else {
      expect(Haptics.selectionAsync).toHaveBeenCalled();
    }
  });

  it('success', () => {
    haptics.success();
    if (Platform.OS === 'android') {
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
        Haptics.AndroidHaptics.Confirm,
      );
    } else {
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    }
  });

  it('restEnd is a strong triple (vibration waveform / three heavy impacts)', () => {
    jest.useFakeTimers();
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    haptics.restEnd();
    jest.advanceTimersByTime(REST_END_GAP_MS * 3);
    if (Platform.OS === 'android') {
      expect(vibrate).toHaveBeenCalledWith(REST_END_PATTERN);
      expect(REST_END_PATTERN.filter((_, i) => i % 2 === 1)).toHaveLength(3);
    } else {
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(3);
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
      expect(vibrate).not.toHaveBeenCalled();
    }
    vibrate.mockRestore();
    jest.useRealTimers();
  });

  it('never throws when the device has no haptics', async () => {
    jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error('no engine'));
    jest.mocked(Haptics.performAndroidHapticsAsync).mockRejectedValueOnce(new Error('no engine'));
    expect(() => haptics.light()).not.toThrow();
    await Promise.resolve();
  });
});
