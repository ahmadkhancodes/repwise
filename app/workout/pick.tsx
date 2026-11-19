import { useLocalSearchParams } from 'expo-router';

import { ExercisePickerScreen } from '@/features/workout/screens/ExercisePickerScreen';

export default function PickExerciseRoute() {
  const { session, routine } = useLocalSearchParams<{ session?: string; routine?: string }>();
  return <ExercisePickerScreen sessionId={session} routineId={routine} />;
}
