import {
  addDays,
  formatHm,
  localDateOf,
  offsetAt,
  parseHm,
  safeTimeZone,
  wallClock,
  weekdayOf,
  zonedTimeToUtc,
} from '../zonedTime';

const H = 3_600_000;

describe('zonedTimeToUtc', () => {
  it('converts a normal winter and summer time in New York', () => {
    expect(new Date(zonedTimeToUtc('2026-01-15', 13 * 60, 'America/New_York')).toISOString()).toBe(
      '2026-01-15T18:00:00.000Z',
    );
    expect(new Date(zonedTimeToUtc('2026-07-15', 13 * 60, 'America/New_York')).toISOString()).toBe(
      '2026-07-15T17:00:00.000Z',
    );
  });

  it('keeps the same wall time across the spring-forward day (lunch stays 13:00)', () => {
    const before = zonedTimeToUtc('2026-03-07', 13 * 60, 'America/New_York');
    const after = zonedTimeToUtc('2026-03-08', 13 * 60, 'America/New_York');
    expect(after - before).toBe(23 * H); // the day is one hour shorter
    expect(wallClock(after, 'America/New_York')).toMatchObject({ date: '2026-03-08', minute: 13 * 60 });
  });

  it('moves a time inside the DST gap forward (02:30 → 03:30)', () => {
    const t = zonedTimeToUtc('2026-03-08', 2 * 60 + 30, 'America/New_York');
    expect(new Date(t).toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(wallClock(t, 'America/New_York').minute).toBe(3 * 60 + 30);
  });

  it('picks the first occurrence of a repeated fall-back time', () => {
    const t = zonedTimeToUtc('2026-11-01', 60 + 30, 'America/New_York');
    expect(new Date(t).toISOString()).toBe('2026-11-01T05:30:00.000Z'); // 01:30 EDT, not EST
  });

  it('handles Europe/London BST and half-hour zones', () => {
    expect(new Date(zonedTimeToUtc('2026-03-29', 8 * 60, 'Europe/London')).toISOString()).toBe(
      '2026-03-29T07:00:00.000Z',
    );
    expect(new Date(zonedTimeToUtc('2026-03-28', 8 * 60, 'Europe/London')).toISOString()).toBe(
      '2026-03-28T08:00:00.000Z',
    );
    expect(new Date(zonedTimeToUtc('2026-06-01', 9 * 60, 'Asia/Kolkata')).toISOString()).toBe(
      '2026-06-01T03:30:00.000Z',
    );
  });

  it('crosses the date line correctly', () => {
    expect(new Date(zonedTimeToUtc('2026-06-01', 7 * 60, 'Pacific/Auckland')).toISOString()).toBe(
      '2026-05-31T19:00:00.000Z',
    );
  });
});

describe('wall clock helpers', () => {
  it('offsetAt reports the zone offset', () => {
    expect(offsetAt(Date.UTC(2026, 0, 1), 'America/New_York')).toBe(-5 * H);
    expect(offsetAt(Date.UTC(2026, 6, 1), 'Europe/London')).toBe(H);
  });

  it('localDateOf uses the zone, not UTC', () => {
    const t = Date.UTC(2026, 0, 1, 3); // 22:00 on Dec 31 in New York
    expect(localDateOf(t, 'America/New_York')).toBe('2025-12-31');
    expect(localDateOf(t, 'UTC')).toBe('2026-01-01');
  });

  it('addDays / weekdayOf work across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-11-22')).toBe(0); // Sunday
    expect(wallClock(Date.UTC(2026, 10, 22, 12), 'UTC').weekday).toBe(0);
  });

  it('parseHm / formatHm validate and wrap', () => {
    expect(parseHm('07:15')).toBe(435);
    expect(parseHm('7:05')).toBe(425);
    expect(parseHm('24:00')).toBeNull();
    expect(parseHm('12:60')).toBeNull();
    expect(parseHm(null)).toBeNull();
    expect(formatHm(435)).toBe('07:15');
    expect(formatHm(-15)).toBe('23:45');
    expect(formatHm(1440 + 5)).toBe('00:05');
  });

  it('safeTimeZone falls back to UTC', () => {
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone(undefined)).toBe('UTC');
    expect(safeTimeZone('Europe/London')).toBe('Europe/London');
  });
});
