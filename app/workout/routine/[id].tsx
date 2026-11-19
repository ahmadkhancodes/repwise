import { useLocalSearchParams } from 'expo-router';

import { RoutineBuilderScreen } from '@/features/workout/screens/RoutineBuilderScreen';

export default function RoutineRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RoutineBuilderScreen routineId={String(id)} />;
}
