import { router } from 'expo-router';
import { SearchX } from 'lucide-react-native';

import { EmptyState, Screen } from '@/ui';

export default function NotFound() {
  return (
    <Screen scroll={false}>
      <EmptyState
        icon={SearchX}
        title="This page doesn't exist"
        body="The link may be old. Your data is safe."
        actionLabel="Go to Today"
        onAction={() => router.replace('/today')}
      />
    </Screen>
  );
}
