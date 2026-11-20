import { Platform } from 'react-native';

import { trialTimeline } from '../logic/timeline';

describe(`trial timeline (${Platform.OS})`, () => {
  it('7-day trial: today → day 5 reminder → day 7 billed', () => {
    const steps = trialTimeline(7, '$59.99/year');
    expect(steps.map((s) => s.day)).toEqual(['Today', 'Day 5', 'Day 7']);
    expect(steps[2]!.title).toBe('Billed $59.99/year');
  });

  it('short trial skips the reminder step; no trial = no timeline', () => {
    expect(trialTimeline(3, '$1').map((s) => s.key)).toEqual(['today', 'billed']);
    expect(trialTimeline(0, '$1')).toEqual([]);
  });
});
