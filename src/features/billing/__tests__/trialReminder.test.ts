import { inQuietHours, trialEndFromStart, trialReminderAt } from '../logic/trialReminder';

const DAY = 86_400_000;
const local = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe('trial day-5 reminder (N-T5)', () => {
  it('fires on trial day 5 = 2 days before a 7-day trial ends, same clock time', () => {
    const start = local(19, 10);
    const end = trialEndFromStart(start, 7);
    expect(end - start).toBe(7 * DAY);
    const at = trialReminderAt(end)!;
    expect(at.getTime()).toBe(end - 2 * DAY);
    expect(at.getHours()).toBe(10);
    expect(at.getDate()).toBe(24);
  });

  it('late evening in quiet hours moves earlier to 21:59 the same evening', () => {
    const at = trialReminderAt(local(26, 23, 30))!;
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([24, 21, 59]);
  });

  it('early morning in quiet hours moves to 21:59 the evening before (never later)', () => {
    const end = local(26, 3);
    const at = trialReminderAt(end)!;
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([23, 21, 59]);
    expect(at.getTime()).toBeLessThan(end - 2 * DAY);
  });

  it('respects custom quiet hours', () => {
    const at = trialReminderAt(local(26, 13, 30), { quietHours: { start: 13, end: 15 } })!;
    expect([at.getHours(), at.getMinutes()]).toEqual([12, 59]);
    expect(inQuietHours(new Date(local(20, 23)), { start: 22, end: 7 })).toBe(true);
    expect(inQuietHours(new Date(local(20, 12)), { start: 22, end: 7 })).toBe(false);
  });

  it('returns null once the reminder time has passed', () => {
    const end = local(26, 10);
    expect(trialReminderAt(end, { now: end - DAY })).toBeNull();
    expect(trialReminderAt(end, { now: end - 3 * DAY })).not.toBeNull();
  });
});
