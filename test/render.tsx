import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeScope, type ColorScheme } from '@/theme';

export const SCHEMES: ColorScheme[] = ['light', 'dark'];

/** Render inside providers with a forced light/dark scheme. */
export function renderThemed(
  ui: ReactElement,
  scheme: ColorScheme = 'light',
  options?: RenderOptions,
) {
  return render(
    <SafeAreaProvider>
      <ThemeScope scheme={scheme}>{ui}</ThemeScope>
    </SafeAreaProvider>,
    options,
  );
}

/** Flatten a style prop (arrays / falsy entries) into one object. */
export function flat(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}
