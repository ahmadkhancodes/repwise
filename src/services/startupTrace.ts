/**
 * Dev-only startup trace (perf audit: "time to first screen"). Records a few marks on the way to
 * the first screen and logs one line in development:
 *
 *   [startup] first screen 412 ms after runtime start · layout +180 · fonts +2 · db +6 · frame +31
 *
 * - `runtime` times are `performance.now()`, which React Native counts from when the JS runtime
 *   started; the `+n` deltas are measured from the root layout module being evaluated.
 * - Off in release builds (`__DEV__` false): every call is a cheap no-op, nothing is logged or sent.
 * - Features may add marks (e.g. `markStartup('today_ready')` once Today has its data).
 */
export type StartupMark = { name: string; at: number };

// Dev builds only; quiet under Jest unless a test turns it on (resetStartupTraceForTests).
let enabled = (typeof __DEV__ !== 'undefined' ? __DEV__ : false) && process.env.NODE_ENV !== 'test';
let marks: StartupMark[] = [];
let reported = false;
let log: (line: string) => void = (line) => {
  console.log(line);
};

function now(): number {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof p?.now === 'function' ? p.now() : Date.now();
}

/** Record a mark once (the first call for a name wins). */
export function markStartup(name: string, at: number = now()): void {
  if (!enabled || reported) return;
  if (marks.some((m) => m.name === name)) return;
  marks.push({ name, at });
}

/** Marks so far, in order (dev gallery and tests). */
export function startupMarks(): readonly StartupMark[] {
  return marks;
}

/** Time to first screen, or null until `first_frame` is marked (or when tracing is off). */
export function timeToFirstScreen(): number | null {
  return marks.find((m) => m.name === 'first_frame')?.at ?? null;
}

/** One summary line from the marks (pure; exported for tests). */
export function formatStartup(ms: readonly StartupMark[]): string | null {
  const first = ms.find((m) => m.name === 'first_frame');
  if (!first) return null;
  const base = ms.find((m) => m.name === 'layout')?.at ?? ms[0]!.at;
  const steps = ms.map((m) => `${m.name} +${Math.round(m.at - base)}`).join(' · ');
  return `[startup] first screen ${Math.round(first.at)} ms after runtime start · ${steps}`;
}

/** Mark the first frame after the first screen mounted, then log the summary once. */
export function markFirstFrame(): void {
  if (!enabled || reported) return;
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown })
    .requestAnimationFrame;
  const done = () => {
    if (reported) return;
    markStartup('first_frame');
    reported = true;
    const line = formatStartup(marks);
    if (line) log(line);
  };
  if (typeof raf === 'function') raf(done);
  else setTimeout(done, 0);
}

/** Tests only. */
export function resetStartupTraceForTests(
  opts: { enabled?: boolean; log?: (line: string) => void } = {},
): void {
  enabled = opts.enabled ?? true;
  marks = [];
  reported = false;
  if (opts.log) log = opts.log;
}
