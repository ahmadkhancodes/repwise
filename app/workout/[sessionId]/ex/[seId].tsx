import { useLocalSearchParams } from 'expo-router';

import { ExerciseScreen } from '@/features/workout/screens/ExerciseScreen';

export default function WorkoutExerciseRoute() {
  const { sessionId, seId } = useLocalSearchParams<{ sessionId: string; seId: string }>();
  return <ExerciseScreen sessionId={String(sessionId)} seId={String(seId)} />;
}
