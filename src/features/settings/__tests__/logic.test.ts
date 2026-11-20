import { Platform } from 'react-native';

import { helpLinks, SUPPORT_EMAIL, supportMailto } from '../config';
import {
  buildExport,
  cleanRows,
  deletePlan,
  DELETE_UNDO_MS,
  exportedRows,
  exportFileName,
  isExportFileName,
} from '../logic/data';
import {
  draftChanged,
  draftProblem,
  locationOf,
  profileSummary,
  weekdaysLabel,
  type PlanDraft,
} from '../logic/profile';
import { DEFAULT_APP_PREFS, sanitizeAppPrefs } from '../prefs';

describe(`settings logic (${Platform.OS})`, () => {
  it('export drops deleted rows and internal columns', () => {
    const rows = cleanRows([
      { id: 'a', weightKg: 80, dirty: 1, userId: 'u', deletedAt: null },
      { id: 'b', weightKg: 81, dirty: 0, userId: 'u', deletedAt: 123 },
    ]);
    expect(rows).toEqual([{ id: 'a', weightKg: 80, deletedAt: null }]);
  });

  it('builds a readable export with counts, sorted tables and a note', () => {
    const file = buildExport(
      { sets: [{ id: 's1' }, { id: 's2' }], profile: [{ id: 'p', deletedAt: null }] },
      { appVersion: '1.0.0', now: Date.UTC(2026, 10, 19, 12) },
    );
    expect(file.app).toBe('Repwise');
    expect(Object.keys(file.tables)).toEqual(['profile', 'sets']);
    expect(file.counts).toEqual({ profile: 1, sets: 2 });
    expect(exportedRows(file)).toBe(3);
    expect(file.exportedAt).toBe('2026-11-19T12:00:00.000Z');
    expect(file.note).toMatch(/kg/);
  });

  it('export file name uses the local date', () => {
    expect(exportFileName(new Date(2026, 0, 5, 9).getTime())).toBe('repwise-export-2026-01-05.json');
    expect(isExportFileName(exportFileName(new Date(2026, 0, 5, 9).getTime()))).toBe(true);
    expect(isExportFileName('repwise-export-2026-01-05.json.tmp')).toBe(false);
    expect(isExportFileName('photo.jpg')).toBe(false);
  });

  it('delete plan per auth status', () => {
    expect(deletePlan('signedIn')).toEqual({ deleteServerAccount: true, serverRequired: true });
    expect(deletePlan('anonymous')).toEqual({ deleteServerAccount: true, serverRequired: false });
    expect(deletePlan('signedOut')).toEqual({ deleteServerAccount: false, serverRequired: false });
    expect(deletePlan('loading').deleteServerAccount).toBe(false);
    expect(DELETE_UNDO_MS).toBe(5000);
  });

  it('location from equipment', () => {
    expect(locationOf(['bodyweight', 'barbell', 'dumbbell'])).toBe('gym');
    expect(locationOf(['bodyweight', 'dumbbell', 'bench'])).toBe('home');
    expect(locationOf(['bodyweight', 'mat'])).toBe('bodyweight');
    expect(locationOf(null)).toBe('bodyweight');
  });

  it('profile summary line', () => {
    expect(
      profileSummary({ goal: 'fat_loss', days: 4, sessionMin: 60, equipment: ['barbell'] }),
    ).toEqual({ title: 'Lose fat', line: '4 days · 60 min · Gym' });
    expect(profileSummary({ goal: 'maintain', days: 1, sessionMin: null, equipment: [] }).line).toBe(
      '1 day · No equipment',
    );
    expect(profileSummary(undefined).title).toBe('Set up your plan');
  });

  it('weekday label, change detection and validation', () => {
    expect(weekdaysLabel([4, 0, 2])).toBe('Mon · Wed · Fri');
    const base: PlanDraft = {
      goal: 'fat_loss',
      days: 3,
      weekdays: [0, 2, 4],
      sessionMin: 60,
      location: 'gym',
      equipment: ['barbell', 'bodyweight'],
    };
    expect(draftChanged(base, { ...base, weekdays: [4, 2, 0], equipment: ['bodyweight', 'barbell'] })).toBe(false);
    expect(draftChanged(base, { ...base, weekdays: [0, 2, 5] })).toBe(true);
    expect(draftChanged(base, { ...base, goal: 'maintain' })).toBe(true);
    expect(draftProblem(base)).toBeNull();
    expect(draftProblem({ ...base, days: 4 })).toBe('Pick 4 training days (3 selected).');
  });

  it('app prefs default on and ignore junk', () => {
    expect(sanitizeAppPrefs(null)).toEqual(DEFAULT_APP_PREFS);
    expect(sanitizeAppPrefs({ keepAwake: false, restSound: 'no', extra: 1 })).toEqual({
      keepAwake: false,
      restSound: true,
      restVibration: true,
    });
  });

  it('help links from config, with a site override', () => {
    expect(helpLinks(undefined).terms).toBe('https://repwise.app/terms');
    expect(helpLinks('https://example.org/')).toEqual({
      terms: 'https://example.org/terms',
      privacy: 'https://example.org/privacy',
      deleteAccount: 'https://example.org/delete-account',
      help: 'https://example.org/help',
    });
    const mail = supportMailto('1.2.3', 'android');
    expect(mail.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(mail)).toContain('Repwise 1.2.3 · android');
  });
});
