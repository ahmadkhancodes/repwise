import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export default function ProgressLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.colors.bg },
        animationDuration: t.motion.duration.base,
      }}
    >
      <Stack.Screen name="log" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
