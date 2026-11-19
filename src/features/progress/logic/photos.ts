/**
 * Progress photos (S33): pure helpers for file names, grouping and the compare pair.
 * Files live in the app's private document directory (never the public gallery unless the
 * user exports them through the share sheet).
 */
import type { ISODate } from './engine';
import { monthName, monthOf } from './dates';

export type PhotoLike = {
  id: string;
  date: string;
  localUri: string | null;
  pose: string | null;
  createdAt: number;
};

export const PHOTO_DIR = 'progress-photos';
export const POSES = ['front', 'side', 'back'] as const;
export type Pose = (typeof POSES)[number];

/** Stable private file name for a photo row. */
export function photoFileName(id: string, ext = 'jpg'): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return `${safe}.${e === 'jpeg' ? 'jpg' : e}`;
}

/** Extension from a picker uri ("…/IMG_1.HEIC" → "heic"), default jpg. */
export function extensionOf(uri: string): string {
  const m = /\.([a-zA-Z0-9]{2,5})(?:\?.*)?$/.exec(uri);
  return m?.[1]?.toLowerCase() ?? 'jpg';
}

/** Newest first, grouped by month ("November 2026"). */
export function groupByMonth<T extends PhotoLike>(
  photos: readonly T[],
): { title: string; data: T[] }[] {
  const sorted = [...photos].sort((a, b) =>
    a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
  );
  const groups = new Map<string, T[]>();
  for (const p of sorted) {
    const { year, month } = monthOf(p.date);
    const title = `${monthName(month)} ${year}`;
    groups.set(title, [...(groups.get(title) ?? []), p]);
  }
  return [...groups.entries()].map(([title, data]) => ({ title, data }));
}

/**
 * Default compare pair: the first and the latest photo — of the same pose when the latest has a
 * pose and an earlier one shares it. Older photo first. Null with < 2 photos.
 */
export function defaultComparePair<T extends PhotoLike>(photos: readonly T[]): [T, T] | null {
  if (photos.length < 2) return null;
  const sorted = [...photos].sort((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
  );
  const latest = sorted[sorted.length - 1]!;
  const samePose = latest.pose
    ? sorted.find((p) => p.id !== latest.id && p.pose === latest.pose)
    : undefined;
  const first = samePose ?? sorted[0]!;
  return first.id === latest.id ? null : [first, latest];
}

/** Order any two picked photos oldest → newest. */
export function orderPair<T extends PhotoLike>(a: T, b: T): [T, T] {
  return a.date < b.date || (a.date === b.date && a.createdAt <= b.createdAt) ? [a, b] : [b, a];
}

/** Days between two photo dates, for the "42 days apart" caption. */
export function daysApart(a: ISODate, b: ISODate): number {
  const t = (d: string) =>
    Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round(Math.abs(t(b) - t(a)) / 86_400_000);
}
