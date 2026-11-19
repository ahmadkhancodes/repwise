/**
 * Rest timer as a pure state machine (RW-23). Time is always derived from timestamps, never
 * from a ticking counter, so it survives the app being backgrounded or killed: the store
 * persists this object and the "rest over" notification is scheduled at `endsAt`.
 * Pause excludes time: resuming pushes `endsAt` back by the paused span.
 */
export type RestNext = { exercise: string; setNo: number };

export type RestTimerState =
  | { status: 'idle' }
  | {
      status: 'running' | 'paused';
      sessionId: string;
      /** Total rest asked for, after ±15 s adjustments (ms). */
      durationMs: number;
      startedAt: number;
      /** When rest ends while running (ms epoch). */
      endsAt: number;
      /** Set while paused. */
      pausedAt: number | null;
      next: RestNext | null;
    };

export type ActiveRest = Exclude<RestTimerState, { status: 'idle' }>;

export const IDLE: RestTimerState = { status: 'idle' };
export const REST_STEP_S = 15;
export const MIN_REST_S = 0;
export const MAX_REST_S = 15 * 60;

/** Default rest when the plan has none: warm-ups 60 s, working 90 s. */
export function defaultRestSeconds(restS: number | null | undefined, type?: string): number {
  if (restS != null && restS > 0) return restS;
  return type === 'warmup' ? 60 : 90;
}

export function startRest(
  now: number,
  seconds: number,
  sessionId: string,
  next: RestNext | null = null,
): ActiveRest {
  const s = Math.min(MAX_REST_S, Math.max(MIN_REST_S, Math.round(seconds)));
  return {
    status: 'running',
    sessionId,
    durationMs: s * 1000,
    startedAt: now,
    endsAt: now + s * 1000,
    pausedAt: null,
    next,
  };
}

export function remainingMs(state: RestTimerState, now: number): number {
  if (state.status === 'idle') return 0;
  const at = state.status === 'paused' && state.pausedAt != null ? state.pausedAt : now;
  return Math.max(0, state.endsAt - at);
}

export function isOver(state: RestTimerState, now: number): boolean {
  return state.status === 'running' && now >= state.endsAt;
}

/** ±15 s (or any delta). Taking it to zero ends the rest. */
export function adjustRest(state: RestTimerState, deltaS: number, now: number): RestTimerState {
  if (state.status === 'idle') return state;
  const left = remainingMs(state, now) + deltaS * 1000;
  if (left <= 0) return IDLE;
  const cappedLeft = Math.min(MAX_REST_S * 1000, left);
  const at = state.status === 'paused' && state.pausedAt != null ? state.pausedAt : now;
  return {
    ...state,
    endsAt: at + cappedLeft,
    durationMs: Math.max(0, state.durationMs + (cappedLeft - remainingMs(state, now))),
  };
}

export function pauseRest(state: RestTimerState, now: number): RestTimerState {
  if (state.status !== 'running') return state;
  return { ...state, status: 'paused', pausedAt: Math.min(now, state.endsAt) };
}

export function resumeRest(state: RestTimerState, now: number): RestTimerState {
  if (state.status !== 'paused' || state.pausedAt == null) return state;
  return { ...state, status: 'running', endsAt: state.endsAt + (now - state.pausedAt), pausedAt: null };
}

/** 0 → 1 progress for rings/bars. */
export function restProgress(state: RestTimerState, now: number): number {
  if (state.status === 'idle' || state.durationMs <= 0) return 0;
  return 1 - remainingMs(state, now) / state.durationMs;
}

/** Validate a persisted value (MMKV can hold anything after an app update). */
export function reviveRest(raw: unknown): RestTimerState {
  if (!raw || typeof raw !== 'object') return IDLE;
  const r = raw as Record<string, unknown>;
  if (r.status !== 'running' && r.status !== 'paused') return IDLE;
  const num = (k: string) => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : null);
  const endsAt = num('endsAt');
  const startedAt = num('startedAt');
  const durationMs = num('durationMs');
  if (endsAt == null || startedAt == null || durationMs == null || typeof r.sessionId !== 'string') return IDLE;
  const next =
    r.next && typeof r.next === 'object' && typeof (r.next as RestNext).exercise === 'string'
      ? (r.next as RestNext)
      : null;
  return {
    status: r.status,
    sessionId: r.sessionId,
    durationMs,
    startedAt,
    endsAt,
    pausedAt: r.status === 'paused' ? (num('pausedAt') ?? endsAt) : null,
    next,
  };
}
