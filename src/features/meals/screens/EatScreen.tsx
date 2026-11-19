import { Utensils } from 'lucide-react-native';
import { useState } from 'react';

import { EmptyState, Screen, Segmented } from '@/ui';

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;

/** S21 Meal plan (day/week) — placeholder. */
export function EatScreen() {
  const [view, setView] = useState<(typeof VIEWS)[number]['value']>('day');
  return (
    <Screen title="Eat" edges={['top']} testID="screen-eat">
      <Segmented
        options={VIEWS}
        value={view}
        onChange={setView}
        accessibilityLabel="Meal plan view"
      />
      <EmptyState
        icon={Utensils}
        title="No meal plan yet"
        body={
          view === 'day'
            ? "Today's meals will show up here."
            : "This week's meals will show up here."
        }
      />
    </Screen>
  );
}
