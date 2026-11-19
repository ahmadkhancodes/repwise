/**
 * "Recently used" (S18): exercises logged in workouts, plus exercises opened in the library, newest
 * first, without duplicates. Viewed entries are capped so the stored list stays tiny.
 */
export type RecentEntry = { id: string; at: number };

export const VIEWED_CAP = 20;

export function mergeRecent(
  logged: readonly RecentEntry[],
  viewed: readonly RecentEntry[],
  limit = 10,
): string[] {
  const best = new Map<string, number>();
  for (const e of [...logged, ...viewed]) {
    const prev = best.get(e.id);
    if (prev == null || e.at > prev) best.set(e.id, e.at);
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

/** Record a view: move to the front, drop the oldest beyond the cap. */
export function pushViewed(list: readonly RecentEntry[], id: string, at: number): RecentEntry[] {
  return [{ id, at }, ...list.filter((e) => e.id !== id)].slice(0, VIEWED_CAP);
}
