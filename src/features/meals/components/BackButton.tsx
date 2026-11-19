import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';

import { IconButton } from '@/ui';

/** Header back (or close) button; falls back to the Eat tab when opened from a deep link. */
export function BackButton({ close = false, testID = 'back' }: { close?: boolean; testID?: string }) {
  return (
    <IconButton
      icon={close ? X : ChevronLeft}
      accessibilityLabel={close ? 'Close' : 'Back'}
      testID={testID}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/eat'))}
    />
  );
}
