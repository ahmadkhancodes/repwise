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
    Skia: { Path: { Make: () => ({}) }, PathBuilder: { Make: () => builder } },
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
