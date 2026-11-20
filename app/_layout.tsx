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
import { startEarlyObservability, startObservability } from '@/services/observability';
import { markFirstFrame, markStartup } from '@/services/startupTrace';
import { useTheme } from '@/theme';
// Direct import, not the '@/ui' barrel: the root must not evaluate Skia, sheets and pickers.
import { ToastHost } from '@/ui/Toast';

/*
 * Module load stays tiny (perf audit A7/A8): hold the splash, start crash reporting (so a startup
 * crash is caught) with a buffer for early analytics events. PostHog, review, billing, sync and the
 * catalogue warm-up all start after the first screen.
 */
markStartup('layout');
SplashScreen.preventAutoHideAsync().catch(() => undefined);
startEarlyObservability();

/** After the first screen: analytics client and review prompt (none of it is user-visible). */
const OBSERVABILITY_DELAY_MS = 1200;

const FONT_MAP = { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold };

function RootLayout() {
  const t = useTheme();
  // Android embeds Inter at build time (app.config.ts), so this is `true` on the first render and
  // nothing waits. iOS (and older binaries reached by an OTA update) load at runtime, behind the
  // splash; never block launch on a font error.
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  const ready = fontsLoaded || Boolean(fontError);
  const [dbSettled, setDbSettled] = useState(false);
  const onDbSettled = useCallback((ok: boolean) => {
    markStartup('db');
    setDbSettled(true);
    // Schedule + widget snapshot from local data; handles a notification tap that launched the app.
    // Auth restore now; billing, sync and the catalogue warm-up after the first screen.
    if (ok) {
      startBackgroundServices();
      startNotifications();
    }
  }, []);

  useEffect(() => {
    if (ready) markStartup('fonts');
  }, [ready]);

  useEffect(() => {
    // Root view colour behind screens/keyboard, so dark mode never flashes white.
    SystemUI.setBackgroundColorAsync(t.colors.bg).catch(() => undefined);
  }, [t.colors.bg]);

  useEffect(() => {
    if (!ready || !dbSettled) return;
    SplashScreen.hideAsync().catch(() => undefined);
    markFirstFrame();
    const timer = setTimeout(() => {
      try {
        startObservability();
      } catch {
        // observability must never break the app
      }
    }, OBSERVABILITY_DELAY_MS);
    return () => clearTimeout(timer);
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
                // Screens under the player (tabs) do not re-render while covered (perf r2 A2).
                freezeOnBlur: true,
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
