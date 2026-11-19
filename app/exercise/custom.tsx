import { useLocalSearchParams } from 'expo-router';

import { CustomExerciseScreen } from '@/features/library/screens/CustomExerciseScreen';

/** RW-28 create (/exercise/custom) or edit (/exercise/custom?id=<uuid>) a custom exercise. */
export default function CustomExerciseRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CustomExerciseScreen id={id ? String(id) : undefined} />;
}
