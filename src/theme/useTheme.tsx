import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { resolveScheme } from './resolveScheme';
import { useThemeStore } from './themeStore';
import { themes, type ColorScheme, type Theme } from './tokens';

const ScopeContext = createContext<ColorScheme | null>(null);

/**
 * Forces a scheme for a subtree (used by /dev/ui to show light and dark side by
 * side, and by tests). Normal screens never need it.
 */
export function ThemeScope({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  return <ScopeContext.Provider value={scheme}>{children}</ScopeContext.Provider>;
}

/** Current theme: ThemeScope override → user preference (MMKV) → system setting. */
export function useTheme(): Theme {
  const scoped = useContext(ScopeContext);
  const preference = useThemeStore((s) => s.preference);
  const system = useColorScheme();
  return themes[scoped ?? resolveScheme(preference, system)];
}
