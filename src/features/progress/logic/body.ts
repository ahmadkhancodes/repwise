/**
 * Body weight + measurements (S30, RW-38). The 7-day moving average is the engine's
 * `weightTrend`; this module only picks rows, applies the time range and converts units.
 */
import { addDays, weightTrend, type ISODate } from './engine';
import { displayLength, displayWeight, type UnitSystem } from './units';

export type BodyRow = {
  id: string;
  date: string;
  weightKg: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
  bodyFatPct: number | null;
  updatedAt?: number;
};

export type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL';
export const RANGES: readonly Range[] = ['1M', '3M', '6M', '1Y', 'ALL'];
const RANGE_DAYS: Record<Exclude<Range, 'ALL'>, number> = {
  '1M': 30,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
};

/** Free users see 30 days of history (RW-50: "Free 30 days; Pro"). */
export const FREE_RANGE: Range = '1M';

/** First date inside a range ending today (inclusive), or null for all time. */
export function rangeStart(range: Range, today: ISODate): ISODate | null {
  return range === 'ALL' ? null : addDays(today, -(RANGE_DAYS[range] - 1));
}

export function inRange(date: string, range: Range, today: ISODate): boolean {
  const from = rangeStart(range, today);
  return date <= today && (from == null || date >= from);
}

/** One weigh-in per date: the latest-edited row wins (two entries the same day → the newest). */
export function dailyWeights(rows: readonly BodyRow[]): { date: ISODate; kg: number }[] {
  const byDate = new Map<string, { kg: number; at: number }>();
  for (const r of rows) {
    if (r.weightKg == null || !(r.weightKg > 0)) continue;
    const prev = byDate.get(r.date);
    const at = r.updatedAt ?? 0;
    if (!prev || at >= prev.at) byDate.set(r.date, { kg: r.weightKg, at });
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, kg: v.kg }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export type WeightPoint = { date: ISODate; value: number; avg: number };

export type WeightSeries = {
  points: WeightPoint[];
  /** Latest 7-day average (display units) — the number we lead with, calmer than one weigh-in. */
  current: number | null;
  latest: number | null;
  /** Average now − average at range start (display units); null with < 2 points. */
  change: number | null;
};

/** Raw weigh-ins + moving average in display units, limited to the range (average uses all data). */
export function weightSeries(
  rows: readonly BodyRow[],
  range: Range,
  today: ISODate,
  units: UnitSystem,
): WeightSeries {
  const daily = dailyWeights(rows);
  const trend = weightTrend(daily);
  const points = daily
    .map((d, i) => ({
      date: d.date,
      value: displayWeight(d.kg, units),
      avg: displayWeight(trend[i]!.avgKg, units),
    }))
    .filter((p) => inRange(p.date, range, today));
  const last = points[points.length - 1];
  const first = points[0];
  return {
    points,
    current: last ? last.avg : null,
    latest: last ? last.value : null,
    change:
      points.length >= 2 && first && last ? Math.round((last.avg - first.avg) * 10) / 10 : null,
  };
}

export type MeasureKey =
  'waistCm' | 'hipsCm' | 'chestCm' | 'armCm' | 'thighCm' | 'neckCm' | 'bodyFatPct';

export const MEASURES: readonly { key: MeasureKey; label: string; kind: 'length' | 'percent' }[] = [
  { key: 'waistCm', label: 'Waist', kind: 'length' },
  { key: 'hipsCm', label: 'Hips', kind: 'length' },
  { key: 'chestCm', label: 'Chest', kind: 'length' },
  { key: 'armCm', label: 'Arm', kind: 'length' },
  { key: 'thighCm', label: 'Thigh', kind: 'length' },
  { key: 'neckCm', label: 'Neck', kind: 'length' },
  { key: 'bodyFatPct', label: 'Body fat', kind: 'percent' },
];

export type MeasureSeries = {
  key: MeasureKey;
  label: string;
  kind: 'length' | 'percent';
  points: { date: ISODate; value: number }[];
  latest: number | null;
  change: number | null;
};

/** One series per measurement that has data in range (display units), in MEASURES order. */
export function measurementSeries(
  rows: readonly BodyRow[],
  range: Range,
  today: ISODate,
  units: UnitSystem,
): MeasureSeries[] {
  const sorted = [...rows].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.updatedAt ?? 0) - (b.updatedAt ?? 0),
  );
  return MEASURES.map(({ key, label, kind }) => {
    const byDate = new Map<string, number>();
    for (const r of sorted) {
      const v = r[key];
      if (v != null && v > 0 && inRange(r.date, range, today)) byDate.set(r.date, v);
    }
    const points = [...byDate.entries()].map(([date, v]) => ({
      date,
      value: kind === 'percent' ? Math.round(v * 10) / 10 : displayLength(v, units),
    }));
    const first = points[0];
    const last = points[points.length - 1];
    return {
      key,
      label,
      kind,
      points,
      latest: last ? last.value : null,
      change:
        points.length >= 2 && first && last
          ? Math.round((last.value - first.value) * 10) / 10
          : null,
    };
  }).filter((s) => s.points.length > 0);
}
