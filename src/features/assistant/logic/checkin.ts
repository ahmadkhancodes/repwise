/**
 * Weekly check-in (S28, RW-42, flow F4). Pure. Calorie maths comes from the engine
 * (`weeklyAdjustment`, `bmrMifflin`, `calorieFloor`, `weightTrend`); this module only gathers the
 * inputs, picks the volume step from the user's own answers and writes the copy.
 */
import {
  addDays,
  asGoal,
  asSex,
  bmrMifflin,
  calorieFloor,
  daysBetween,
  kgToLb,
  lbToKg,
  startOfWeek,
  weeklyAdjustment,
  weightTrend,
  type Goal,
  type ISODate,
  type WeeklyAdjustment,
  type WeighIn,
} from '@/features/today/logic/engine';

export type Energy = 'low' | 'ok' | 'great';
export type Sleep = 'poor' | 'ok' | 'good';
export type VolumeStep = 'progress' | 'hold' | 'deload';

export const ENERGY_OPTIONS: { value: Energy; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'ok', label: 'OK' },
  { value: 'great', label: 'Great' },
];
export const SLEEP_OPTIONS: { value: Sleep; label: string }[] = [
  { value: 'poor', label: 'Poor' },
  { value: 'ok', label: 'OK' },
  { value: 'good', label: 'Good' },
];

export type Adherence = {
  workoutsDone: number;
  workoutsPlanned: number;
  mealsEaten: number;
  mealsPlanned: number;
};

/** Share 0..1, or null when nothing was planned. */
export function share(done: number, planned: number): number | null {
  return planned > 0 ? Math.min(1, done / planned) : null;
}

/** Workouts and meals in the 7 days ending on `onDate` (inclusive). */
export function weeklyAdherence(
  onDate: ISODate,
  sessions: { date: string | null; status: string | null }[],
  meals: { date: string; status: string }[],
): Adherence {
  const inWeek = (d: string | null) => {
    if (!d) return false;
    const ago = daysBetween(d, onDate);
    return ago >= 0 && ago <= 6;
  };
  const ws = sessions.filter((s) => inWeek(s.date) && s.status !== 'skipped');
  const ms = meals.filter((m) => inWeek(m.date) && m.status !== 'skipped');
  return {
    workoutsDone: ws.filter((s) => s.status === 'done').length,
    workoutsPlanned: ws.length,
    mealsEaten: ms.filter((m) => m.status === 'eaten').length,
    mealsPlanned: ms.length,
  };
}

/**
 * Next week's training volume from the user's own answers:
 * - deload (−40%, engine rule) when a lighter week was requested, or energy is low AND sleep poor;
 * - hold when under 70% of workouts were done, or energy was low;
 * - progress (+1 set per muscle group, the engine's weekly step) otherwise.
 */
export function volumeStep(input: {
  workoutShare: number | null;
  energy: Energy;
  sleep: Sleep;
  deloadRequested: boolean;
}): VolumeStep {
  if (input.deloadRequested || (input.energy === 'low' && input.sleep === 'poor')) return 'deload';
  if (input.energy === 'low' || (input.workoutShare != null && input.workoutShare < 0.7)) return 'hold';
  return 'progress';
}

export const VOLUME_COPY: Record<VolumeStep, { title: string; detail: string }> = {
  progress: { title: '+1 set per muscle', detail: 'You trained well, so volume steps up.' },
  hold: { title: 'Same volume', detail: 'Same sets as this week while you settle in.' },
  deload: { title: 'Lighter week', detail: 'About 40% fewer sets, same exercises.' },
};

/** Calorie floor from the engine (BMR × 1.1, min 1,200 women / 1,500 men); 1,200 if unknown. */
export function floorFor(
  profile: { sex: string | null; weightKg: number | null; heightCm: number | null; birthYear: number | null },
  onDate: ISODate,
): number {
  const sex = asSex(profile.sex);
  const age = profile.birthYear ? Number(onDate.slice(0, 4)) - profile.birthYear : 0;
  if (!sex || !profile.weightKg || !profile.heightCm || age <= 0) return sex === 'male' ? 1500 : 1200;
  return calorieFloor(bmrMifflin({ sex, weightKg: profile.weightKg, heightCm: profile.heightCm, age }), sex);
}

/** Weigh-ins of the last 14 days; today's entry (if any) replaces a stored one for today. */
export function weighInsFor(
  onDate: ISODate,
  stored: { date: string; weightKg: number | null }[],
  todayKg: number | null,
): WeighIn[] {
  const from = addDays(onDate, -13);
  const byDate = new Map<string, number>();
  for (const s of stored) {
    if (s.weightKg != null && s.date >= from && s.date <= onDate) byDate.set(s.date, s.weightKg);
  }
  if (todayKg != null) byDate.set(onDate, todayKg);
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, kg]) => ({ date, kg }));
}

export type CheckinResult = {
  goal: Goal;
  adjustment: WeeklyAdjustment;
  before: { kcal: number };
  after: { kcal: number };
  volume: VolumeStep;
  trend: { date: ISODate; avgKg: number }[];
  adherence: Adherence;
  summary: string;
};

export function computeCheckin(input: {
  onDate: ISODate;
  goal: string | null;
  currentKcal: number;
  floor: number;
  weighIns: WeighIn[];
  adherence: Adherence;
  energy: Energy;
  sleep: Sleep;
  deloadRequested: boolean;
}): CheckinResult {
  const goal = asGoal(input.goal);
  const adjustment = weeklyAdjustment({
    weights: input.weighIns,
    goal,
    onDate: input.onDate,
    currentKcal: input.currentKcal,
    floor: input.floor,
  });
  const volume = volumeStep({
    workoutShare: share(input.adherence.workoutsDone, input.adherence.workoutsPlanned),
    energy: input.energy,
    sleep: input.sleep,
    deloadRequested: input.deloadRequested,
  });
  return {
    goal,
    adjustment,
    before: { kcal: input.currentKcal },
    after: { kcal: adjustment.newKcal },
    volume,
    trend: weightTrend(input.weighIns),
    adherence: input.adherence,
    summary: summaryCopy(adjustment, input.adherence, input.energy),
  };
}

function fmtKg(kg: number): string {
  const v = Math.round(Math.abs(kg) * 10) / 10;
  return `${v.toFixed(1)} kg`;
}

/** Rules-only weekly summary (the Worker's checkin_summary may reword it later). */
export function summaryCopy(adj: WeeklyAdjustment, a: Adherence, energy: Energy): string {
  const parts: string[] = [];
  if (adj.trendKgPerWeek == null) {
    parts.push('Not enough weigh-ins yet to read a trend, so calories stay the same.');
  } else {
    const t = adj.trendKgPerWeek;
    const moved = Math.abs(t) < 0.05 ? 'Your weight held steady' : `Your 7-day average ${t < 0 ? 'fell' : 'rose'} ${fmtKg(t)}`;
    const verdict =
      adj.reason === 'on_track'
        ? 'right on track for your goal.'
        : adj.reason === 'floor'
          ? 'calories are already at your safe minimum, so they stay put.'
          : adj.deltaKcal < 0
            ? `so calories ease down ${Math.abs(adj.deltaKcal)} kcal.`
            : `so calories go up ${adj.deltaKcal} kcal.`;
    parts.push(`${moved}, ${verdict}`);
  }
  if (a.workoutsPlanned > 0) parts.push(`${a.workoutsDone} of ${a.workoutsPlanned} workouts done.`);
  if (energy === 'low') parts.push('Energy was low, so training stays gentle.');
  return parts.join(' ');
}

/** Analytics bucket for checkin_done (sheet 23): never the exact numbers. */
export function kcalChangeBucket(delta: number): string {
  if (delta <= -150) return 'down_150_200';
  if (delta < 0) return 'down_50_100';
  if (delta === 0) return 'none';
  if (delta < 150) return 'up_50_100';
  return 'up_150_200';
}

/** "−150 kcal" / "+100 kcal" / "No change". */
export function deltaLabel(delta: number): string {
  if (delta === 0) return 'No change';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)} kcal`;
}

export const CHECKIN_STEPS = ['weigh', 'feel', 'week', 'adjust'] as const;
export type CheckinStep = (typeof CHECKIN_STEPS)[number];

/** Monday the new targets apply from: today if it is Monday, else next Monday. */
export function appliesFrom(today: ISODate): ISODate {
  const monday = startOfWeek(today);
  return monday === today ? today : addDays(monday, 7);
}

/** Weight shown to the user: kg to 0.1, or lb to 0.1 for imperial profiles (engine conversion). */
export function displayWeight(kg: number, imperial: boolean): number {
  return Math.round((imperial ? kgToLb(kg) : kg) * 10) / 10;
}

export function toKg(value: number, imperial: boolean): number {
  return Math.round((imperial ? lbToKg(value) : value) * 100) / 100;
}
