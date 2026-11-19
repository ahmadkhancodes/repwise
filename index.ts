/**
 * App entry. Expo Router first, then the Android widget task handler (react-native-android-widget),
 * which must be registered at module load so widgets render even when the app is not running.
 */
import 'expo-router/entry';

import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from '@/widgets/android/widgetTaskHandler';

if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
