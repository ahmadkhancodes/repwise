import { Redirect } from 'expo-router';

import { isOnboarded } from '@/features/onboarding/actions';
import { resumeHref } from '@/features/onboarding/logic/flow';
import { useOnboarding } from '@/features/onboarding/store';

/** Launch: Home once onboarding is done; otherwise resume onboarding where it was left (F1). */
export default function Index() {
  // Only the fields resumeHref reads (perf audit A13): no re-render on every answer.
  const phase = useOnboarding((s) => s.phase);
  const step = useOnboarding((s) => s.step);
  const goal = useOnboarding((s) => s.answers.goal);
  if (isOnboarded()) return <Redirect href="/today" />;
  return <Redirect href={resumeHref({ phase, step, answers: { goal } }) as never} />;
}
