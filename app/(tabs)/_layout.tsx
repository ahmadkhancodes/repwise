import { Tabs } from 'expo-router/js-tabs';
import { BookOpen, ChartLine, Dumbbell, Sun, Utensils, type LucideIcon } from 'lucide-react-native';

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';

const TABS: { name: string; title: string; icon: LucideIcon }[] = [
  { name: 'today', title: 'Today', icon: Sun },
  { name: 'train', title: 'Train', icon: Dumbbell },
  { name: 'eat', title: 'Eat', icon: Utensils },
  { name: 'progress', title: 'Progress', icon: ChartLine },
  { name: 'library', title: 'Library', icon: BookOpen },
];

/** Five tabs per sheet 10 / 13: today, train, eat, progress, library. */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      // Selection tick on a tab switch (sheet 11 pickers; P2-24). Fires on commit (tabPress).
      screenListeners={{ tabPress: () => haptics.selection() }}
      screenOptions={{
        headerShown: false,
        // Backstop for the live-query focus gate (perf audit r2 A2/N4): a tab in the background
        // does not render at all until it is focused again.
        freezeOnBlur: true,
        tabBarActiveTintColor: t.colors.textPrimary,
        tabBarInactiveTintColor: t.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: t.colors.bg,
          borderTopColor: t.colors.border,
          borderTopWidth: t.sizes.hairline,
        },
        tabBarLabelStyle: {
          fontFamily: t.typography.caption.fontFamily,
          fontSize: t.typography.caption.fontSize,
        },
        tabBarItemStyle: { minHeight: t.sizes.touch },
        sceneStyle: { backgroundColor: t.colors.bg },
      }}
    >
      {TABS.map(({ name, title, icon: Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAccessibilityLabel: title,
            tabBarButtonTestID: `tab-${name}`,
            tabBarIcon: ({ color }) => (
              <Icon color={color} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
