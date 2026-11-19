import { useLocalSearchParams } from 'expo-router';

import { SummaryScreen } from '@/features/workout/screens/SummaryScreen';

export default function WorkoutSummaryRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <SummaryScreen sessionId={String(sessionId)} />;
}
