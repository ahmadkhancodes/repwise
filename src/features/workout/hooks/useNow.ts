import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Current time, re-rendering every `intervalMs` while `active` (and on return to foreground). */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => {
      clearTimeout(first);
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs, active]);
  return now;
}
