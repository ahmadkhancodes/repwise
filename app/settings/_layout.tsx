import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export default function SettingsLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animationDuration: t.motion.duration.base,
        contentStyle: { backgroundColor: t.colors.bg },
      }}
    />
  );
}
