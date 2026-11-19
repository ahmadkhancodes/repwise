import {
  addDays,
  ageFromBirthYear,
  compareDates,
  daysBetween,
  fromDayNumber,
  isValidISODate,
  localDateFromEpoch,
  startOfWeek,
  toDayNumber,
  weekDates,
  weekdayMon0,
} from '../src';

describe('dates', () => {
  test('day numbers round-trip', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(fromDayNumber(0)).toBe('1970-01-01');
    for (const d of ['2000-02-29', '2024-12-31', '2026-03-08', '2099-01-01']) expect(fromDayNumber(toDayNumber(d))).toBe(d);
  });

  test('invalid dates throw', () => {
    expect(() => toDayNumber('2026-02-29')).toThrow(RangeError);
    expect(() => toDayNumber('2026-13-01')).toThrow(RangeError);
    expect(() => toDayNumber('26-1-1')).toThrow(RangeError);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2100-02-29')).toBe(false);
  });

  test('leap day and year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  test('weekday: Monday = 0', () => {
    expect(weekdayMon0('2026-11-23')).toBe(0); // Monday
    expect(weekdayMon0('2026-11-29')).toBe(6); // Sunday
    expect(weekdayMon0('1970-01-01')).toBe(3); // Thursday
    expect(startOfWeek('2026-11-29')).toBe('2026-11-23');
    expect(startOfWeek('2026-11-23')).toBe('2026-11-23');
  });

  // US DST starts 2026-03-08, EU 2026-03-29; ends EU 2026-10-25, US 2026-11-01.
  test.each(['2026-03-02', '2026-03-23', '2026-10-19', '2026-10-26'])('DST-safe week starting %s', (monday) => {
    const days = weekDates(monday);
    expect(days).toHaveLength(7);
    days.forEach((d, i) => {
      expect(daysBetween(monday, d)).toBe(i);
      expect(weekdayMon0(d)).toBe(i);
    });
    expect(new Set(days).size).toBe(7);
  });

  test('local date from instant with offsets (midnight edges)', () => {
    const t = Date.UTC(2026, 2, 8, 6, 30); // 06:30 UTC
    expect(localDateFromEpoch(t, -8 * 60)).toBe('2026-03-07'); // 22:30 PST previous day
    expect(localDateFromEpoch(t, -7 * 60)).toBe('2026-03-07'); // 23:30 PDT
    expect(localDateFromEpoch(t, -6 * 60)).toBe('2026-03-08'); // 00:30
    expect(localDateFromEpoch(Date.UTC(2026, 0, 1, 23, 59), 0)).toBe('2026-01-01');
    expect(localDateFromEpoch(Date.UTC(2026, 0, 1, 23, 59), 1)).toBe('2026-01-02');
    expect(localDateFromEpoch(Date.UTC(2026, 0, 1, 0, 0), 5 * 60 + 30)).toBe('2026-01-01');
  });

  test('compare + age', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareDates('2026-01-02', '2026-01-02')).toBe(0);
    expect(ageFromBirthYear(1990, '2026-11-23')).toBe(36);
  });
});
