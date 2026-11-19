import { router } from 'expo-router';
import { Settings, Sun } from 'lucide-react-native';

import { EmptyState, IconButton, Screen } from '@/ui';

/** S11 Today — placeholder until the planner lands. */
export function TodayScreen() {
  return (
    <Screen
      title="Today"
      edges={['top']}
      testID="screen-today"
      headerRight={
        <IconButton
          icon={Settings}
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          testID="open-settings"
        />
      }
    >
      <EmptyState
        icon={Sun}
        title="Your day starts here"
        body="Today's workout and meals will show up here once your plan is ready."
        actionLabel="See Repwise Pro"
        onAction={() => router.push('/paywall')}
        testID="today-empty"
      />
    </Screen>
  );
}
