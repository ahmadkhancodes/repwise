import { ChartLine } from 'lucide-react-native';

import { EmptyState, Screen } from '@/ui';

/** S29 Progress home — placeholder. */
export function ProgressScreen() {
  return (
    <Screen title="Progress" edges={['top']} testID="screen-progress">
      <EmptyState
        icon={ChartLine}
        title="Nothing to show yet"
        body="Finish a workout or log a meal and your progress starts here."
      />
    </Screen>
  );
}
