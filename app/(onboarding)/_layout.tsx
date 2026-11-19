import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/** Onboarding stack (S02–S07): slide between questions, iOS back swipe, no headers. */
export default function OnboardingLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: t.motion.duration.base,
        gestureEnabled: true,
        contentStyle: { backgroundColor: t.colors.bg },
      }}
    >
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="q/[step]" />
      <Stack.Screen name="notify" />
      {/* The reveal cannot be swiped back into the quiz. */}
      <Stack.Screen name="plan" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
