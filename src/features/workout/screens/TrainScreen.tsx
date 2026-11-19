import { Dumbbell } from 'lucide-react-native';

import { EmptyState, Screen } from '@/ui';

/** S08 Training plan (week) — placeholder. */
export function TrainScreen() {
  return (
    <Screen title="Train" edges={['top']} testID="screen-train">
      <EmptyState
        icon={Dumbbell}
        title="No training plan yet"
        body="Your weekly sessions will show up here."
      />
    </Screen>
  );
}
