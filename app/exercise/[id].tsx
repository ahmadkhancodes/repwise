import { useLocalSearchParams } from 'expo-router';

import { ExerciseDetailScreen } from '@/features/library/screens/ExerciseDetailScreen';

/** S19 Exercise detail (sheet 10 lists /library/[id]; the route lives at /exercise/[id]). */
export default function ExerciseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseDetailScreen id={String(id ?? '')} />;
}
