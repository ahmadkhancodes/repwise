/** Per-device daily steps goal (MMKV, default 8,000; edited in Settings → Activity). */
import { create } from 'zustand';

import { kv } from '@/services/storage';

import { clampStepsGoal, DEFAULT_STEPS_GOAL } from './logic/stats';

const KEY = 'steps.goal';

export function getStepsGoal(): number {
  try {
    const raw = kv.getString(KEY);
    return raw ? clampStepsGoal(Number(raw)) : DEFAULT_STEPS_GOAL;
  } catch {
    return DEFAULT_STEPS_GOAL;
  }
}

export const useStepsGoal = create<{ goal: number }>(() => ({ goal: getStepsGoal() }));

export function setStepsGoal(goal: number): number {
  const v = clampStepsGoal(goal);
  try {
    kv.set(KEY, String(v));
  } catch {
    // the in-memory value still applies this session
  }
  useStepsGoal.setState({ goal: v });
  return v;
}
