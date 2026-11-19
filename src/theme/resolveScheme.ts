import type { ColorScheme } from './tokens';
import type { ThemePreference } from './themeStore';

/** Pure: the user override wins; otherwise follow the system; unknown system → light. */
export function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined,
): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}
