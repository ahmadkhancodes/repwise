/** Per-device daily water goal (MMKV); the schema has no column for it yet. */
import { kv } from '@/services/storage';

import { DEFAULT_WATER_GOAL_ML, clampWaterGoal } from './logic/water';

const KEY = 'water.goal.ml';

export function getWaterGoal(): number {
  try {
    const v = Number(kv.getString(KEY));
    return Number.isFinite(v) && v > 0 ? clampWaterGoal(v) : DEFAULT_WATER_GOAL_ML;
  } catch {
    return DEFAULT_WATER_GOAL_ML;
  }
}

export function setWaterGoal(ml: number): number {
  const v = clampWaterGoal(ml);
  kv.set(KEY, String(v));
  return v;
}
