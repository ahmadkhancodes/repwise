import { router, type Href } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';

import { IconButton } from './IconButton';

export type BackButtonProps = {
  /** X instead of a chevron (modals). */
  close?: boolean;
  /**
   * Where to go when there is nothing to go back to: the screen was opened from a notification
   * or deep link (/checkin, /today/card), so `router.back()` alone would do nothing.
   */
  fallback?: Href;
  testID?: string;
};

/** Go back, or replace with `fallback` when the stack is empty. Pure navigation, no UI. */
export function goBack(fallback: Href = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * The one header back / close button (UI audit P2-3): 48dp, labelled, and never a no-op after a
 * deep link.
 */
export function BackButton({ close = false, fallback = '/', testID = 'back' }: BackButtonProps) {
  return (
    <IconButton
      icon={close ? X : ChevronLeft}
      accessibilityLabel={close ? 'Close' : 'Back'}
      testID={testID}
      onPress={() => goBack(fallback)}
    />
  );
}
