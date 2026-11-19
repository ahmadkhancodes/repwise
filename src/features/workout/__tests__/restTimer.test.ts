import {
  IDLE,
  adjustRest,
  defaultRestSeconds,
  isOver,
  pauseRest,
  remainingMs,
  restProgress,
  resumeRest,
  reviveRest,
  startRest,
} from '../logic/restTimer';

describe('rest timer state machine', () => {
  const next = { exercise: 'Bench press', setNo: 2 };
  it('starts, counts down from timestamps and ends', () => {
    const s = startRest(1000, 90, 'sess', next);
    expect(s).toMatchObject({ status: 'running', endsAt: 91_000, durationMs: 90_000, next });
    expect(remainingMs(s, 31_000)).toBe(60_000);
    expect(restProgress(s, 46_000)).toBeCloseTo(0.5);
    expect(isOver(s, 90_999)).toBe(false);
    expect(isOver(s, 91_000)).toBe(true);
    expect(remainingMs(s, 200_000)).toBe(0);
    expect(remainingMs(IDLE, 5)).toBe(0);
  });
  it('adds and removes 15 s; reaching zero ends it', () => {
    const s = startRest(0, 60, 'sess');
    const plus = adjustRest(s, 15, 10_000);
    expect(remainingMs(plus, 10_000)).toBe(65_000);
    expect(plus.status === 'running' && plus.durationMs).toBe(75_000);
    const minus = adjustRest(plus, -15, 10_000);
    expect(remainingMs(minus, 10_000)).toBe(50_000);
    expect(adjustRest(s, -15, 50_000)).toEqual(IDLE);
    expect(adjustRest(IDLE, 15, 0)).toEqual(IDLE);
  });
  it('excludes paused time', () => {
    const s = startRest(0, 60, 'sess');
    const paused = pauseRest(s, 20_000);
    expect(paused.status).toBe('paused');
    expect(remainingMs(paused, 500_000)).toBe(40_000);
    expect(isOver(paused, 500_000)).toBe(false);
    const adjusted = adjustRest(paused, 15, 100_000);
    expect(remainingMs(adjusted, 100_000)).toBe(55_000);
    const resumed = resumeRest(paused, 100_000);
    expect(resumed).toMatchObject({ status: 'running', endsAt: 140_000, pausedAt: null });
    expect(pauseRest(IDLE, 1)).toEqual(IDLE);
    expect(resumeRest(s, 1)).toBe(s);
  });
  it('clamps the length', () => {
    expect(startRest(0, 99_999, 's').durationMs).toBe(900_000);
    expect(startRest(0, -3, 's').durationMs).toBe(0);
  });
  it('defaults rest by set type', () => {
    expect(defaultRestSeconds(120)).toBe(120);
    expect(defaultRestSeconds(null)).toBe(90);
    expect(defaultRestSeconds(0, 'warmup')).toBe(60);
  });
  it('revives only valid persisted state', () => {
    const s = startRest(0, 60, 'sess', next);
    expect(reviveRest(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(reviveRest(JSON.parse(JSON.stringify(pauseRest(s, 5))))).toMatchObject({ status: 'paused', pausedAt: 5 });
    expect(reviveRest(null)).toEqual(IDLE);
    expect(reviveRest({ status: 'running' })).toEqual(IDLE);
    expect(reviveRest({ status: 'weird' })).toEqual(IDLE);
  });
});
