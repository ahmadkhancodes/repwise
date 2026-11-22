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
const MOTION_USAGE =
  'Repwise reads your step count to show today\'s steps on your home screen. Steps stay on your phone unless you turn on backup.';
/** Android widgets (names match src/widgets/android/widgets.tsx WIDGET_NAMES). */
const INTER = './node_modules/@expo-google-fonts/inter';
const ANDROID_WIDGETS = {
  fonts: [
    `${INTER}/400Regular/Inter_400Regular.ttf`,
    `${INTER}/600SemiBold/Inter_600SemiBold.ttf`,
    `${INTER}/700Bold/Inter_700Bold.ttf`,
  ],
  widgets: [
    {
      name: 'RepwiseToday',
      label: 'Today',
      description: "Today's workout, next meal and calories, with quick log",
      minWidth: '250dp',
      minHeight: '110dp',
      targetCellWidth: 4,
      targetCellHeight: 2,
      resizeMode: 'horizontal|vertical',
      previewImage: './assets/images/icon.png',
      updatePeriodMillis: 1800000,
    },
    {
      name: 'RepwiseMacros',
      label: 'Macros',
      description: 'Calories left and protein, carbs and fat',
      minWidth: '110dp',
      minHeight: '110dp',
      targetCellWidth: 2,
      targetCellHeight: 2,
      resizeMode: 'horizontal|vertical',
      previewImage: './assets/images/icon.png',
      updatePeriodMillis: 1800000,
    },
    {
      name: 'RepwiseStreak',
      label: 'Streak',
      description: 'Weeks in a row with a workout',
      minWidth: '57dp',
      minHeight: '57dp',
      targetCellWidth: 1,
      targetCellHeight: 1,
      resizeMode: 'none',
      previewImage: './assets/images/icon.png',
      updatePeriodMillis: 1800000,
    },
  ],
};
/** Reversed iOS OAuth client id (com.googleusercontent.apps.…), set in EAS env. */
const GOOGLE_IOS_URL_SCHEME = process.env.GOOGLE_IOS_URL_SCHEME;
/**
 * Sentry (sheet 12). The plugin only adds the native build step that uploads source maps; that
 * upload runs only when org, project and SENTRY_AUTH_TOKEN are all set in EAS env. Without them
 * the build still succeeds and crash reporting still works (runtime DSN: EXPO_PUBLIC_SENTRY_DSN).
 */
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const SENTRY_UPLOAD = Boolean(SENTRY_ORG && SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN);

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
      // Sign in with Apple capability (expo-apple-authentication is installed; kept explicit).
      'com.apple.developer.applesignin': ['Default'],
      // N-5 "Rest over" breaks through Focus as a time-sensitive alert (sheet 17 timer channel).
      'com.apple.developer.usernotifications.time-sensitive': true,
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
      // Home dashboard steps tile (D-STEPS): CoreMotion step count, read only, asked from the tile.
      NSMotionUsageDescription: MOTION_USAGE,
      // Notifications have no Info.plist string on iOS; the in-app primer (S06)
      // explains meal and workout reminders before the system prompt.
      // W5 rest-timer Live Activity (targets/widget + modules/repwise-timer).
      NSSupportsLiveActivities: true,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      // Anonymous crash reports (Sentry) and product analytics (PostHog): not linked to the
      // user's identity, never used for tracking. See docs/store/PRIVACY_LABELS.md.
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePerformanceData',
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeProductInteraction',
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
        },
      ],
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
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      // Home dashboard steps tile (D-STEPS, owner 22 Nov): read today's steps from Health Connect,
      // or count with the phone's pedometer while the app is open. Asked from the tile only.
      'android.permission.health.READ_STEPS',
      'android.permission.ACTIVITY_RECOGNITION',
    ],
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
    // Inter is embedded at build time on Android (assets/fonts/<file>.ttf → fontFamily = file name,
    // matching src/theme/tokens.ts), so the first render never waits on runtime font loading
    // (perf audit A7). iOS registers fonts by PostScript name ("Inter-Regular"), not the token
    // names, so iOS keeps the runtime load in app/_layout.tsx (a few ms, behind the splash).
    [
      'expo-font',
      {
        android: {
          fonts: [
            `${INTER}/400Regular/Inter_400Regular.ttf`,
            `${INTER}/500Medium/Inter_500Medium.ttf`,
            `${INTER}/600SemiBold/Inter_600SemiBold.ttf`,
            `${INTER}/700Bold/Inter_700Bold.ttf`,
          ],
        },
      },
    ],
    'expo-updates',
    'expo-sqlite',
    'expo-secure-store',
    // Steps (D-STEPS): CoreMotion string on iOS; Health Connect (Steps READ only) on Android,
    // which needs minSdk 26 (androidx.health.connect:connect-client).
    ['expo-sensors', { motionPermission: MOTION_USAGE }],
    'react-native-health-connect',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    'expo-apple-authentication',
    // Local notifications (sheet 17). Small icon = monochrome adaptive icon, tinted with the accent.
    [
      'expo-notifications',
      { icon: './assets/images/adaptive-icon-monochrome.png', color: colors.light.accent },
    ],
    // Android home-screen widgets (sheet 17 WG-1..3), rendered from the widget snapshot.
    ['react-native-android-widget', ANDROID_WIDGETS],
    // iOS WidgetKit extension + rest-timer Live Activity in targets/widget (App Group snapshot).
    '@bacons/apple-targets',
    [
      '@sentry/react-native/expo',
      {
        ...(SENTRY_ORG ? { organization: SENTRY_ORG } : {}),
        ...(SENTRY_PROJECT ? { project: SENTRY_PROJECT } : {}),
        disableAutoUpload: !SENTRY_UPLOAD,
      },
    ],
    // Google Sign-In needs the reversed iOS client id as a URL scheme; the plugin throws
    // without it, so it is added only when GOOGLE_IOS_URL_SCHEME is set (EAS env).
    ...(GOOGLE_IOS_URL_SCHEME
      ? [
          [
            '@react-native-google-signin/google-signin',
            { iosUrlScheme: GOOGLE_IOS_URL_SCHEME },
          ] as [string, Record<string, string>],
        ]
      : []),
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
