import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { haptics } from '../haptics';

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

  it('never throws when the device has no haptics', async () => {
    jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error('no engine'));
    jest.mocked(Haptics.performAndroidHapticsAsync).mockRejectedValueOnce(new Error('no engine'));
    expect(() => haptics.light()).not.toThrow();
    await Promise.resolve();
  });
});
