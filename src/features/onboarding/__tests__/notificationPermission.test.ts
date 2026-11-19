import { PermissionsAndroid, Platform } from 'react-native';

import {
  getNotificationPermission,
  requestNotificationPermission,
  setNotificationsModuleForTests,
} from '../notificationPermission';

afterEach(() => {
  jest.restoreAllMocks();
  setNotificationsModuleForTests(undefined);
});

describe('with expo-notifications', () => {
  it('reads and requests through expo-notifications', async () => {
    const expo = {
      getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
      requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    };
    setNotificationsModuleForTests(expo);
    expect(await getNotificationPermission()).toBe('undetermined');
    expect(await requestNotificationPermission()).toBe('granted');
    expect(expo.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('reports a permanent denial and never throws', async () => {
    setNotificationsModuleForTests({
      getPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
      requestPermissionsAsync: async () => {
        throw new Error('boom');
      },
    });
    expect(await getNotificationPermission()).toBe('denied');
    expect(await requestNotificationPermission()).toBe('denied');
  });
});

describe(`without expo-notifications (${Platform.OS})`, () => {
  it('falls back to the platform', async () => {
    setNotificationsModuleForTests(null);
    if (Platform.OS === 'android') {
      const version = jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
      const req = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');
      expect(await getNotificationPermission()).toBe('undetermined');
      expect(await requestNotificationPermission()).toBe('denied');
      expect(req).toHaveBeenCalledWith('android.permission.POST_NOTIFICATIONS');
      version.mockReturnValue(30);
      expect(await requestNotificationPermission()).toBe('granted'); // < Android 13: no prompt
    } else {
      expect(await getNotificationPermission()).toBe('unavailable');
      expect(await requestNotificationPermission()).toBe('unavailable');
    }
  });
});
