/**
 * Registers the planner service behind Today's `plannerBridge` seam (weekly check-in, assistant
 * card C4). Thin: every call goes straight to `regenerateWeek`, and the engine does all the maths
 * (kcal delta via `PlanOptions.adjustmentKcal`, deload via `PlanOptions.deload`).
 */
import { AppState } from 'react-native';

import { latestCheckin } from '@/features/assistant/repo';
import { registerPlanner, type Planner, type RegenerateInput } from '@/features/today/plannerBridge';
import { onPullMerged } from '@/sync/syncEngine';

import { addDays, startOfWeek, weekdayMon0 } from './engine';
import { dedupePlannedSessions, ensureWeekPlanned, localToday, regenerateWeek } from './planService';

export function createPlannerBridge(clock: () => number = Date.now): Required<Planner> {
  return {
    async regenerateWeek(input: RegenerateInput) {
      await regenerateWeek({
        now: clock(),
        date: input.weekStart,
        adjustmentKcal: input.adjustmentKcal,
        // 'hold' has no engine switch: progression already holds loads that were not earned.
        deload: input.volume === 'deload',
      });
    },
    async requestDeload() {
      const now = clock();
      const nextWeek = addDays(startOfWeek(localToday(now)), 7);
      // Keep a check-in adjustment that already targets that week.
      const checkin = latestCheckin();
      const adjustmentKcal =
        checkin && startOfWeek(checkin.appliesFrom) === nextWeek ? checkin.deltaKcal : undefined;
      await regenerateWeek({ now, date: nextWeek, adjustmentKcal, deload: true });
    },
  };
}

let registered = false;

/** Called once at start-up (services/bootstrap). */
export function registerPlannerBridge(): void {
  if (registered) return;
  registered = true;
  registerPlanner(createPlannerBridge());
  onPullMerged(dedupeAfterPull);
}

/**
 * R2-6: after a pull brought sessions or plans, collapse the duplicates two devices planned for
 * the same days (a no-op otherwise). Exported for tests.
 */
export function dedupeAfterPull(changed: ReadonlySet<string>, now: number = Date.now()): number {
  if (!changed.has('sessions') && !changed.has('session_exercises') && !changed.has('plans')) return 0;
  try {
    return dedupePlannedSessions({}, now);
  } catch {
    return 0; // best effort; the plan keeper tries again on the next foreground
  }
}

/**
 * Keep training + meals planned as weeks roll over (idempotent; a no-op when the week exists).
 * Plans the current week, and next week from Sunday so tomorrow's preview and reminders exist.
 * Returns how many weeks were planned.
 */
export function ensurePlannedAhead(now: number = Date.now()): number {
  const today = localToday(now);
  const weeks = [today];
  if (weekdayMon0(today) >= 6) weeks.push(addDays(startOfWeek(today), 7));
  let planned = 0;
  for (const date of weeks) {
    try {
      if (ensureWeekPlanned(date, now)) planned++;
    } catch {
      // Best effort: screens show what is stored; the next foreground tries again.
    }
  }
  try {
    // Backstop for duplicates a pull left before the bridge was listening (R2-6).
    dedupePlannedSessions({ from: startOfWeek(today), to: addDays(startOfWeek(today), 13) }, now);
  } catch {
    // best effort
  }
  return planned;
}

const DAY_MS = 86_400_000;

/** Run `ensurePlannedAhead` at start-up, on every foreground and just after local midnight. */
export function startPlanKeeper(clock: () => number = Date.now): () => void {
  // Defer so the first frame paints before any engine work.
  const run = () => setTimeout(() => ensurePlannedAhead(clock()), 0);
  let midnight: ReturnType<typeof setTimeout> | null = null;
  const armMidnight = () => {
    const now = new Date(clock());
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1).getTime();
    midnight = setTimeout(() => {
      run();
      armMidnight();
    }, Math.min(DAY_MS, Math.max(1000, next - now.getTime())));
  };
  run();
  armMidnight();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
  });
  return () => {
    sub.remove();
    if (midnight) clearTimeout(midnight);
  };
}
