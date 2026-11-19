import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '@/db/DatabaseProvider';
import { startBackgroundServices } from '@/services/bootstrap';
import { withCrashReporting } from '@/services/crash';
import { startNotifications } from '@/services/notifications';
import { startObservability } from '@/services/observability';
import { useTheme } from '@/theme';
import { ToastHost } from '@/ui';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
// Sentry + PostHog + review prompt; each is a no-op without its key.
startObservability();

function RootLayout() {
  const t = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const ready = fontsLoaded || Boolean(fontError); // never block launch on a font error
  const [dbSettled, setDbSettled] = useState(false);
  const onDbSettled = useCallback((ok: boolean) => {
    setDbSettled(true);
    // Auth restore, then billing + sync, and the catalogue warm-up start once local data is ready.
    if (ok) {
      startBackgroundServices();
      // Schedule + widget snapshot from local data; handles a notification tap that launched the app.
      startNotifications();
    }
  }, []);

  useEffect(() => {
    // Root view colour behind screens/keyboard, so dark mode never flashes white.
    SystemUI.setBackgroundColorAsync(t.colors.bg).catch(() => undefined);
  }, [t.colors.bg]);

  useEffect(() => {
    if (ready && dbSettled) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready, dbSettled]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
          <DatabaseProvider onSettled={onDbSettled}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: t.colors.bg },
                animationDuration: t.motion.duration.base,
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
              <Stack.Screen name="settings" />
              <Stack.Screen name="dev/ui" />
            </Stack>
          </DatabaseProvider>
          <ToastHost />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default withCrashReporting(RootLayout);
