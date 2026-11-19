import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/** Workout stack (P8): player, exercise, summary, tools, routine builder, exercise picker. */
export default function WorkoutLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.colors.bg },
        animationDuration: t.motion.duration.base,
      }}
    >
      <Stack.Screen name="[sessionId]/summary" options={{ gestureEnabled: false }} />
      <Stack.Screen name="pick" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
