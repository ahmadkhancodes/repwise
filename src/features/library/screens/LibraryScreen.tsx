import { BookOpen } from 'lucide-react-native';

import { EmptyState, Screen } from '@/ui';

/** S18 Exercise library — placeholder. */
export function LibraryScreen() {
  return (
    <Screen title="Library" edges={['top']} testID="screen-library">
      <EmptyState
        icon={BookOpen}
        title="Exercise library"
        body="Search every exercise with clear demos and steps."
      />
    </Screen>
  );
}
