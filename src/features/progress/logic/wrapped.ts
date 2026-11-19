/**
 * Monthly Wrapped (S34, W8): a Spotify-style recap of one calendar month. Every number is
 * computed here from local data — the story cards only display it.
 */
import { startOfWeek, type EngineExercise, type ISODate, type Muscle } from './engine';
import { inMonth, monthName, type MonthKey } from './dates';
import { weeklyMuscleVolume } from './muscles';
import { personalRecords, type PersonalRecord } from './strength';
import { weekStreak } from './streak';
import {
  doneSessions,
  isWorkSet,
  sessionDate,
  sessionMinutes,
  tonnage,
  type LoggedSet,
  type SessionLike,
} from './workouts';

export type WrappedInput = {
  sessions: readonly SessionLike[];
  sets: readonly LoggedSet[];
  exById: ReadonlyMap<string, EngineExercise>;
  /** Dates with any food log or eaten meal. */
  mealsLogged: number;
  loggedDates: readonly string[];
  /** Today (local): the streak of the running month is measured up to today, not month end. */
  today: ISODate;
};

export type Wrapped = {
  month: MonthKey;
  title: string;
  workouts: number;
  minutes: number;
  sets: number;
  volumeKg: number;
  activeDays: number;
  prs: PersonalRecord[];
  topPr: PersonalRecord | null;
  topMuscle: { muscle: Muscle; sets: number } | null;
  favouriteExerciseId: string | null;
  /** Week streak as it stood at the end of the month. */
  streakWeeks: number;
  mealsLogged: number;
  /** Grand pianos (~400 kg) lifted — a playful way to read the volume. */
  pianos: number;
};

const PIANO_KG = 400;

function lastDayOf(key: MonthKey): ISODate {
  const d = new Date(Date.UTC(key.year, key.month, 0)).getUTCDate();
  return `${key.year}-${String(key.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function monthlyWrapped(input: WrappedInput, month: MonthKey): Wrapped {
  const sessions = doneSessions(input.sessions).filter((s) => {
    const d = sessionDate(s);
    return d != null && inMonth(d, month);
  });
  const ids = new Set(sessions.map((s) => (s as SessionLike & { id: string }).id));
  const sets = input.sets.filter((s) => ids.has(s.sessionId) && inMonth(s.date, month));
  const work = sets.filter(isWorkSet);
  const volumeKg = Math.round(tonnage(sets));

  // PRs are judged against ALL earlier history, then kept if they happened this month.
  const prs = personalRecords(input.sets.filter((s) => s.date <= lastDayOf(month))).filter((p) =>
    inMonth(p.date, month),
  );
  const topPr =
    prs.reduce<PersonalRecord | null>(
      (best, p) => (p.kind === 'weight' && (!best || p.valueKg > best.valueKg) ? p : best),
      null,
    ) ??
    prs[0] ??
    null;

  // Most-trained muscle: engine set credit over the month's sets (one bucket per week, summed).
  const mondays = [...new Set(work.map((s) => startOfWeek(s.date)))];
  const totals = new Map<Muscle, number>();
  for (const w of weeklyMuscleVolume(work, input.exById, mondays)) {
    for (const [m, n] of Object.entries(w.byMuscle) as [Muscle, number][])
      totals.set(m, (totals.get(m) ?? 0) + n);
  }
  let topMuscle: Wrapped['topMuscle'] = null;
  for (const [muscle, n] of totals)
    if (n > 0 && (!topMuscle || n > topMuscle.sets)) topMuscle = { muscle, sets: n };

  const count = new Map<string, number>();
  for (const s of work) count.set(s.exerciseId, (count.get(s.exerciseId) ?? 0) + 1);
  let favouriteExerciseId: string | null = null;
  let favN = 0;
  for (const [id, n] of count) if (n > favN) [favouriteExerciseId, favN] = [id, n];

  const workoutDates = doneSessions(input.sessions)
    .map(sessionDate)
    .filter((d): d is string => d != null);
  const activeDays = new Set(
    [...sessions.map(sessionDate), ...input.loggedDates.filter((d) => inMonth(d, month))].filter(
      Boolean,
    ),
  ).size;

  return {
    month,
    title: `Your ${monthName(month.month)}`,
    workouts: sessions.length,
    minutes: sessions.reduce((a, s) => a + sessionMinutes(s), 0),
    sets: work.length,
    volumeKg,
    activeDays,
    prs,
    topPr,
    topMuscle,
    favouriteExerciseId,
    streakWeeks: weekStreak(
      workoutDates,
      input.today < lastDayOf(month) ? input.today : lastDayOf(month),
    ).current,
    mealsLogged: input.mealsLogged,
    pianos: Math.round((volumeKg / PIANO_KG) * 10) / 10,
  };
}

/** Nothing to celebrate yet: no workouts and nothing logged. */
export function isEmptyWrapped(w: Wrapped): boolean {
  return w.workouts === 0 && w.mealsLogged === 0;
}

export type WrappedCardKind =
  'intro' | 'workouts' | 'volume' | 'prs' | 'muscle' | 'streak' | 'food' | 'summary';

/** Which story cards to show: skip cards that would read "0". */
export function wrappedCards(w: Wrapped): WrappedCardKind[] {
  const cards: WrappedCardKind[] = ['intro'];
  if (w.workouts > 0) cards.push('workouts');
  if (w.volumeKg > 0) cards.push('volume');
  if (w.prs.length > 0) cards.push('prs');
  if (w.topMuscle) cards.push('muscle');
  if (w.streakWeeks > 0) cards.push('streak');
  if (w.mealsLogged > 0) cards.push('food');
  cards.push('summary');
  return cards;
}
