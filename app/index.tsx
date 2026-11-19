import { Redirect } from 'expo-router';

import { isOnboarded } from '@/features/onboarding/actions';
import { resumeHref } from '@/features/onboarding/logic/flow';
import { useOnboarding } from '@/features/onboarding/store';

/** Launch: Home once onboarding is done; otherwise resume onboarding where it was left (F1). */
export default function Index() {
  const state = useOnboarding();
  if (isOnboarded()) return <Redirect href="/today" />;
  return <Redirect href={resumeHref(state) as never} />;
}
