import { Redirect } from 'expo-router';

import { UiGallery } from '@/ui/gallery/UiGallery';

/** Hidden design-system gallery. Dev builds always; other builds only with EXPO_PUBLIC_SHOW_DEV_UI=1. */
export default function DevUiRoute() {
  if (!__DEV__ && process.env.EXPO_PUBLIC_SHOW_DEV_UI !== '1') return <Redirect href="/today" />;
  return <UiGallery />;
}
