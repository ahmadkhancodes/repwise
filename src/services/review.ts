/**
 * In-app store review prompt (sheet 12: expo-store-review, "ask after a success moment, max
 * 3 times/year"). Rules, all enforced here:
 *  - only after a success moment (`ReviewTrigger`);
 *  - never in the first 3 days after the first open;
 *  - at most 3 asks in any rolling 365 days, and at least 30 days between asks;
 *  - never while a workout is in progress.
 * The OS may still decide not to show the sheet; we count the ask either way, so we never nag.
 */
import { track } from './analytics';
import { kv } from './storage';

export type ReviewTrigger =
  | 'workout_finished'
  | 'pr'
  | 'checkin_done'
  | 'streak_milestone'
  | 'week_complete'
  | 'meals_day_complete';

const DAY = 24 * 60 * 60 * 1000;
export const REVIEW_RULES = {
  minDaysSinceFirstOpen: 3,
  maxAsksPerYear: 3,
  minDaysBetweenAsks: 30,
} as const;

export type ReviewState = { firstOpenAt: number | null; asks: number[] };
export type ReviewBlock =
  | 'no_first_open'
  | 'too_early'
  | 'yearly_cap'
  | 'cooldown'
  | 'workout_active'
  | 'in_flight'
  | 'unavailable';

/** Pure gate: may we ask now? */
export function reviewBlock(
  state: ReviewState,
  now: number,
  ctx: { workoutActive: boolean },
): ReviewBlock | null {
  if (ctx.workoutActive) return 'workout_active';
  if (state.firstOpenAt == null) return 'no_first_open';
  if (now - state.firstOpenAt < REVIEW_RULES.minDaysSinceFirstOpen * DAY) return 'too_early';
  const lastYear = state.asks.filter((t) => now - t < 365 * DAY);
  if (lastYear.length >= REVIEW_RULES.maxAsksPerYear) return 'yearly_cap';
  const last = Math.max(...lastYear, -Infinity);
  if (now - last < REVIEW_RULES.minDaysBetweenAsks * DAY) return 'cooldown';
  return null;
}

// ---------------------------------------------------------------------------
// Persistence (MMKV) and wiring
// ---------------------------------------------------------------------------

const STATE_KEY = 'review.state';

export function loadReviewState(): ReviewState {
  try {
    const raw = kv.getString(STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReviewState>) : {};
    return {
      firstOpenAt: typeof parsed.firstOpenAt === 'number' ? parsed.firstOpenAt : null,
      asks: Array.isArray(parsed.asks) ? parsed.asks.filter((n) => typeof n === 'number') : [],
    };
  } catch {
    return { firstOpenAt: null, asks: [] };
  }
}

function saveReviewState(s: ReviewState): void {
  try {
    kv.set(STATE_KEY, JSON.stringify(s));
  } catch {
    // never break the app over a review prompt
  }
}

/** Call once per launch; remembers the very first open (start of the 3-day quiet period). */
export function recordFirstOpen(now: number = Date.now()): void {
  const s = loadReviewState();
  if (s.firstOpenAt == null) saveReviewState({ ...s, firstOpenAt: now });
}

type StoreReviewLike = {
  isAvailableAsync: () => Promise<boolean>;
  hasAction?: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

type ReviewDeps = {
  isWorkoutActive: () => boolean;
  storeReview: () => StoreReviewLike;
  now: () => number;
};

const defaultDeps: ReviewDeps = {
  isWorkoutActive: () => false,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  storeReview: () => require('expo-store-review') as StoreReviewLike,
  now: () => Date.now(),
};
let deps: ReviewDeps = { ...defaultDeps };
let inFlight = false;

/** Wire the workout check (and test seams). Called from startObservability. */
export function configureReview(next: Partial<ReviewDeps>): void {
  deps = { ...deps, ...next };
}

/**
 * Ask for a store review if every rule allows it. Safe to call from any success moment: it never
 * throws, never blocks, and returns whether the system sheet was requested.
 */
export async function maybeAskForReview(trigger: ReviewTrigger): Promise<boolean> {
  if (inFlight) return false;
  inFlight = true;
  try {
    const now = deps.now();
    const state = loadReviewState();
    let workoutActive = false;
    try {
      workoutActive = deps.isWorkoutActive();
    } catch {
      workoutActive = true; // unknown → assume busy, never interrupt a workout
    }
    if (reviewBlock(state, now, { workoutActive })) return false;
    const sr = deps.storeReview();
    if (!(await sr.isAvailableAsync())) return false;
    if (sr.hasAction && !(await sr.hasAction())) return false;
    saveReviewState({ ...state, asks: [...state.asks.filter((t) => now - t < 365 * DAY), now] });
    track('review_prompt', { moment: trigger });
    await sr.requestReview();
    return true;
  } catch {
    return false;
  } finally {
    inFlight = false;
  }
}

/** Analytics events (sheet 23) that already mark a success moment, mapped to a review trigger. */
export function reviewTriggerForEvent(
  event: string,
  props: Record<string, unknown>,
): ReviewTrigger | null {
  if (event === 'workout_finished') return typeof props.sets === 'number' && props.sets <= 0 ? null : 'workout_finished';
  if (event === 'checkin_done') return 'checkin_done';
  return null;
}

/** Let the success screen's celebration play before the system sheet slides up. */
export const REVIEW_DELAY_MS = 1500;

export function onAnalyticsEventForReview(event: string, props: Record<string, unknown>): void {
  const trigger = reviewTriggerForEvent(event, props);
  if (!trigger) return;
  setTimeout(() => void maybeAskForReview(trigger), REVIEW_DELAY_MS);
}

export function resetReviewForTests(): void {
  deps = { ...defaultDeps };
  inFlight = false;
  kv.remove(STATE_KEY);
}
