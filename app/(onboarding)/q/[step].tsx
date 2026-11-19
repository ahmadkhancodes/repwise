import { useLocalSearchParams } from 'expo-router';

import { stepFromParam } from '@/features/onboarding/logic/flow';
import { QuizScreen } from '@/features/onboarding/screens/QuizScreen';

export default function QuizRoute() {
  const { step } = useLocalSearchParams<{ step: string }>();
  const id = stepFromParam(step);
  return <QuizScreen key={id} step={id} />;
}
