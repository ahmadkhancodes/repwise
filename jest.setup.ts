/* eslint-disable @typescript-eslint/no-require-imports */
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// Reanimated 4 + the native jest presets resolve initializers.native.js, which
// registers a CSS handler that JSReanimated (used under Jest) cannot provide.
jest.mock('react-native-reanimated/src/initializers', () => ({
  initializeReanimatedModule: () => undefined,
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  AndroidHaptics: { Virtual_Key: 'virtual-key', Segment_Tick: 'segment-tick', Confirm: 'confirm' },
}));

// Lightweight Skia stand-in: Canvas renders a View, drawings render nothing.
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const builder = { addArc: () => builder, addCircle: () => builder, build: () => ({}) };
  return {
    Canvas: ({ children, ...props }: { children?: unknown }) =>
      React.createElement(View, { ...props, testID: 'skia-canvas' }, children),
    Path: () => null,
    Circle: () => null,
    Group: () => null,
    // Charts / body map / share images (progress feature).
    Rect: () => null,
    RoundedRect: () => null,
    Line: () => null,
    BlurMask: () => null,
    DashPathEffect: () => null,
    vec: (x: number, y: number) => ({ x, y }),
    ImageFormat: { PNG: 4, JPEG: 3 },
    makeImageFromView: jest.fn(async () => ({ encodeToBase64: () => 'iVBORw0KGgo=' })),
    Skia: {
      Path: { Make: () => ({}), MakeFromSVGString: () => ({}) },
      PathBuilder: { Make: () => builder },
    },
  };
});

// MMKV is a Nitro (JSI) module; tests use an in-memory store with the same API.
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => {
    const m = new Map<string, string>();
    return {
      getString: (k: string) => m.get(k),
      set: (k: string, v: unknown) => m.set(k, String(v)),
      remove: (k: string) => m.delete(k),
      clearAll: () => m.clear(),
    };
  },
}));

// expo-sqlite → real SQLite in memory via node:sqlite (see test/mocks/expoSqlite.ts).
jest.mock('expo-sqlite', () => require('./test/mocks/expoSqlite'));

// expo-crypto → Node crypto.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');
  return {
    getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
    digestStringAsync: async (_alg: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data).digest('hex'),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  };
});

// expo-secure-store → in-memory map (reset with __reset in tests).
jest.mock('expo-secure-store', () => {
  const m = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => m.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      m.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      m.delete(k);
    }),
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    __reset: () => m.clear(),
  };
});

jest.mock('expo-apple-authentication', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    isAvailableAsync: jest.fn(async () => true),
    signInAsync: jest.fn(async () => ({ identityToken: 'apple-id-token', user: 'apple-user' })),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: ({ onPress, ...rest }: { onPress: () => void }) =>
      React.createElement(Pressable, {
        ...rest,
        onPress,
        accessibilityRole: 'button',
        accessibilityLabel: 'Continue with Apple',
        testID: 'apple-sign-in',
      }),
  };
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ type: 'success', data: { idToken: 'google-id-token' } })),
    signOut: jest.fn(async () => null),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isErrorWithCode: (e: unknown) => typeof e === 'object' && e !== null && 'code' in e,
}));

// Native notification + widget modules (src/services/notifications.ts, src/widgets): in-memory doubles.
jest.mock('expo-notifications', () => require('./test/mocks/expoNotifications'));
jest.mock('react-native-android-widget', () => require('./test/mocks/androidWidget'));
jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: Object.assign(
    jest
      .fn()
      .mockImplementation(() => ({ set: jest.fn(), get: jest.fn(() => null), remove: jest.fn() })),
    { reloadWidget: jest.fn(), reloadControls: jest.fn() },
  ),
}));
