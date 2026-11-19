/**
 * Meal taste signals (RW-33 "more like this" / "never show again") and per-device grocery ticks.
 * Kept in MMKV for now: the schema has no column for them (listed as a schema need). They are
 * preferences, so losing them on a reinstall never loses logged data.
 */
import { kv } from '@/services/storage';

import type { MealSignals } from './logic/plan';

const SIGNALS_KEY = 'meals.signals.v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = kv.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getSignals(): MealSignals {
  const s = readJson<Partial<MealSignals>>(SIGNALS_KEY, {});
  return { neverShow: s.neverShow ?? [], moreLike: s.moreLike ?? [] };
}

function saveSignals(s: MealSignals): void {
  kv.set(SIGNALS_KEY, JSON.stringify(s));
}

export function addNeverShow(recipeId: string): void {
  const s = getSignals();
  if (!s.neverShow.includes(recipeId)) s.neverShow.push(recipeId);
  s.moreLike = s.moreLike.filter((id) => id !== recipeId);
  saveSignals(s);
}

export function addMoreLike(recipeId: string): void {
  const s = getSignals();
  if (!s.moreLike.includes(recipeId)) s.moreLike.push(recipeId);
  s.neverShow = s.neverShow.filter((id) => id !== recipeId);
  saveSignals(s);
}

const groceryKey = (weekStart: string) => `grocery.checked.${weekStart}`;

export function getGroceryChecked(weekStart: string): string[] {
  return readJson<string[]>(groceryKey(weekStart), []);
}

export function setGroceryChecked(weekStart: string, ids: readonly string[]): void {
  kv.set(groceryKey(weekStart), JSON.stringify(ids));
}
