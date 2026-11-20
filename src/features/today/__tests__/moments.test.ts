import { currentWeekStreak, isWeekComplete, reviewMoment, STREAK_MILESTONES } from '../logic/moments';

describe('Today success moments (pure)', () => {
  it('week complete needs at least one planned session, all done', () => {
    expect(isWeekComplete({ planned: 3, done: 3 })).toBe(true);
    expect(isWeekComplete({ planned: 3, done: 2 })).toBe(false);
    expect(isWeekComplete({ planned: 0, done: 0 })).toBe(false);
    expect(isWeekComplete(null)).toBe(false);
  });

  it('counts consecutive weeks with a finished workout up to this week', () => {
    const today = '2026-11-19'; // Thursday
    expect(currentWeekStreak(['2026-11-17', '2026-11-10', '2026-11-03'], today)).toBe(3);
    expect(currentWeekStreak(['2026-11-17', '2026-11-03'], today)).toBe(1);
    expect(currentWeekStreak(['2026-11-10'], today)).toBe(0);
    expect(currentWeekStreak(['2026-11-25'], today)).toBe(0);
  });

  it('fires only on a false → true flip; a streak milestone wins', () => {
    const streak = jest.fn(() => 2);
    expect(reviewMoment(null, { weekComplete: true }, streak)).toBeNull();
    expect(reviewMoment({ weekComplete: true }, { weekComplete: true }, streak)).toBeNull();
    expect(reviewMoment({ weekComplete: false }, { weekComplete: false }, streak)).toBeNull();
    expect(streak).not.toHaveBeenCalled();
    expect(reviewMoment({ weekComplete: false }, { weekComplete: true }, streak)).toBe('week_complete');
    expect(reviewMoment({ weekComplete: false }, { weekComplete: true }, () => STREAK_MILESTONES[0])).toBe('streak_milestone');
  });
});
