/**
 * Notification permission for the S06 primer. Asked ONLY from the primer (sheet 17), never at launch.
 *
 * Uses `expo-notifications` when it is installed (it is in the stack; the notifications slice adds
 * it). Until then: Android 13+ asks for POST_NOTIFICATIONS through React Native's PermissionsAndroid,
 * Android < 13 needs no runtime permission, and iOS reports 'unavailable' (the flow continues).
 */
import { PermissionsAndroid, Platform } from 'react-native';

export type PermissionResult = 'granted' | 'denied' | 'unavailable';

type ExpoNotifications = {
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestPermissionsAsync(opts?: unknown): Promise<{ granted: boolean }>;
};

let override: ExpoNotifications | null | undefined;

/** Tests only: pretend expo-notifications is (or is not, with null) installed; undefined = real. */
export function setNotificationsModuleForTests(mod: ExpoNotifications | null | undefined): void {
  override = mod;
}

function loadExpoNotifications(): ExpoNotifications | null {
  if (override !== undefined) return override;
  try {
    // Optional dependency: Metro treats a require inside try/catch as optional.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as ExpoNotifications;
  } catch {
    return null;
  }
}

const ANDROID_13 = 33;

/** Current state without prompting (to skip the primer when already decided). */
export async function getNotificationPermission(): Promise<PermissionResult | 'undetermined'> {
  try {
    const n = loadExpoNotifications();
    if (n) {
      const s = await n.getPermissionsAsync();
      if (s.granted) return 'granted';
      return s.canAskAgain === false ? 'denied' : 'undetermined';
    }
    if (Platform.OS === 'android') {
      if (Number(Platform.Version) < ANDROID_13) return 'granted';
      const ok = await PermissionsAndroid.check('android.permission.POST_NOTIFICATIONS');
      return ok ? 'granted' : 'undetermined';
    }
    return 'unavailable';
  } catch {
    return 'undetermined';
  }
}

/** Show the system prompt. Never throws. */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  try {
    const n = loadExpoNotifications();
    if (n) {
      const r = await n.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
      return r.granted ? 'granted' : 'denied';
    }
    if (Platform.OS === 'android') {
      if (Number(Platform.Version) < ANDROID_13) return 'granted';
      const r = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
      return r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
    }
    return 'unavailable';
  } catch {
    return 'denied';
  }
}
