import { useLocalSearchParams } from 'expo-router';

import { WorkoutPlayerScreen } from '@/features/workout/screens/WorkoutPlayerScreen';

export default function WorkoutRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <WorkoutPlayerScreen sessionId={String(sessionId)} />;
}
