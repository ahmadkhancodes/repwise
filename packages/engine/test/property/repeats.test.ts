/**
 * Uniqueness over time (RW-11) for 2,000 seeded random profiles, 4 simulated weeks each
 * (sessions only, history fed back like the app does).
 */
import { runRepeatProperty, type RepeatStats } from '../support/property';

const WEEKS = 4;
let stats: RepeatStats;
beforeAll(() => {
  stats = runRepeatProperty(201, 2000, WEEKS);
}, 600_000);

test('2,000 profiles × 4 weeks: no session repeats one of the previous 10 (fingerprint window)', () => {
  expect(stats.sessions).toBeGreaterThan(2000 * WEEKS * 2);
  expect(stats.windowRepeats.slice(0, 3)).toEqual([]);
});

test('no accessory repeats the previous variant of its movement pattern', () => {
  expect(stats.consecutive.slice(0, 3)).toEqual([]);
});
