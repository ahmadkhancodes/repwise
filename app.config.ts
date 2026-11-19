import type { ConfigContext, ExpoConfig } from 'expo/config';

// Plain JSON so Node can load it here; src/theme/tokens.ts types the same file.
import colors from './src/theme/colors.json';

/**
 * Repwise app config — iOS AND Android (owner override, 19 Nov 2026).
 * EAS project id comes from the environment (set by `eas init` / EAS env) so
 * this file never needs a secret. See docs/DECISIONS.md (app-shell decisions).
 */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;
const BUNDLE_ID = 'com.client.repwise';
const APP_GROUP = 'group.com.client.repwise';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Repwise',
  slug: 'repwise',
  scheme: 'repwise',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  // Light AND dark (sheet 11): follow the system, user override in Settings.
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    ...(EAS_PROJECT_ID ? { url: `https://u.expo.dev/${EAS_PROJECT_ID}` } : {}),
    // Never block launch on the network: start from the cached bundle, fetch in the background.
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
    entitlements: {
      // Shared container for the WidgetKit widget + Live Activity timer.
      'com.apple.security.application-groups': [APP_GROUP],
      // Sign in with Apple capability, set explicitly: `usesAppleSignIn` only adds it
      // once expo-apple-authentication is installed (auth task, see DECISIONS).
      'com.apple.developer.applesignin': ['Default'],
    },
    infoPlist: {
      NSCameraUsageDescription:
        'Repwise uses the camera only when you choose to take a progress photo. Photos stay on your phone unless you turn on backup.',
      NSPhotoLibraryUsageDescription:
        'Repwise opens your photo library only when you pick a progress photo to add. Photos stay on your phone unless you turn on backup.',
      NSPhotoLibraryAddUsageDescription:
        'Repwise saves a progress photo or comparison image to your library only when you tap Save.',
      NSFaceIDUsageDescription:
        'Repwise uses Face ID only if you turn on App lock, to keep your workouts and meals private.',
      // Notifications have no Info.plist string on iOS; the in-app primer (S06)
      // explains meal and workout reminders before the system prompt.
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          // MMKV / NSUserDefaults for app settings (theme, flags).
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          // File timestamps inside the app container (SQLite, cached media).
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          // React Native core: elapsed time for animations and timers.
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          // Check free space before saving photos / offline media.
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      monochromeImage: './assets/images/adaptive-icon-monochrome.png',
      backgroundColor: colors.light.inverse,
    },
    permissions: ['android.permission.POST_NOTIFICATIONS'],
    // Nothing else (sheet 13): no location, contacts, mic, ad ID or overlays.
    blockedPermissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_CONTACTS',
      'android.permission.READ_PHONE_STATE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VIDEO',
      'com.google.android.gms.permission.AD_ID',
    ],
  },
  web: { favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-updates',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: colors.light.bg,
        dark: { image: './assets/images/splash-icon-dark.png', backgroundColor: colors.dark.bg },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
