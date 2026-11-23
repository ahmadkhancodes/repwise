import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { track } from '@/services/analytics';
import { enableSteps, readSteps, stepsOptedIn, watchSteps, type StepsSource } from '@/services/steps';

import { saveDailySteps } from '../dashboardRepo';
import type { StepsState } from '../logic/stats';

/** Live pedometer totals are written to SQLite at most this often. */
export const STEPS_SAVE_MS = 15_000;

/** Local midnight of an ISO date ("2026-11-22"). Pure. */
export function startOfLocalDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/**
 * Today's steps for the dashboard tile. Reads on mount, when the date rolls over and whenever
 * the app comes back to the foreground; never asks for permission by itself (`enable` does, from
 * the tile). The stored total for `date` shows at once, so the tile never waits on a sensor.
 */
export function useSteps(date: string, stored: number | null, now: number) {
  const [state, setState] = useState<StepsState>(() =>
    stepsOptedIn() ? { kind: 'on', steps: stored ?? 0 } : { kind: 'off', reason: 'not_asked' },
  );
  const [live, setLive] = useState(false);
  const storedRef = useRef(stored);
  const nowRef = useRef(now);
  useEffect(() => {
    storedRef.current = stored;
    nowRef.current = now;
  }, [stored, now]);

  const refresh = useCallback(async () => {
    const end = new Date(Math.max(nowRef.current, startOfLocalDay(date).getTime()));
    const r = await readSteps(startOfLocalDay(date), end);
    if (!r.ok) {
      setLive(false);
      setState({ kind: 'off', reason: r.reason });
      return;
    }
    if (r.steps == null) {
      // Android without Health Connect: the live pedometer adds to today's stored total.
      setLive(true);
      setState({ kind: 'on', steps: storedRef.current ?? 0 });
      return;
    }
    setLive(false);
    setState({ kind: 'on', steps: r.steps });
    try {
      saveDailySteps(date, r.steps, r.source);
    } catch {
      // history is best effort
    }
  }, [date]);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Live pedometer (Android fallback): base = today's stored total when the watch starts.
  useEffect(() => {
    if (!live) return;
    const base = storedRef.current ?? 0;
    let latest = base;
    let saved = base;
    const save = (source: StepsSource) => {
      if (latest === saved) return;
      saved = latest;
      try {
        saveDailySteps(date, latest, source);
      } catch {
        // best effort
      }
    };
    const off = watchSteps((since) => {
      latest = base + since;
      setState({ kind: 'on', steps: latest });
    });
    const id = setInterval(() => save('pedometer'), STEPS_SAVE_MS);
    return () => {
      off();
      clearInterval(id);
      save('pedometer');
    };
  }, [live, date]);

  const enable = useCallback(async () => {
    const access = await enableSteps();
    track('steps_enabled', { granted: access === 'granted', access });
    await refresh();
    return access;
  }, [refresh]);

  return { state, enable, refresh };
}
