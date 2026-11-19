/* eslint-disable @typescript-eslint/no-require-imports */
import { Platform } from 'react-native';

import { trackedEvents, resetAnalyticsForTests } from '@/services/analytics';
import { kv } from '@/services/storage';
import { colors } from '@/theme';

import { walkWidgetTree } from '../../../test/mocks/androidWidget';
import { renderWidget, StreakWidget, TodayWidget, WIDGET_NAMES } from '../android/widgets';
import { ringSvg } from '../android/palette';
import { widgetTaskHandler } from '../android/widgetTaskHandler';
import {
  eatenTotals,
  emptySnapshot,
  forDate,
  parseSnapshot,
  pickNextMeal,
  ringProgress,
  weekStart,
  weeksInARow,
  WIDGET_LINKS,
  type WidgetSnapshot,
} from '../snapshot';
import { MMKV_SNAPSHOT_KEY, readStoredSnapshot, resetWriterForTests, SNAPSHOT_KEY, writeWidgetSnapshot } from '../writer';

jest.mock('react-native-android-widget', () => require('../../../test/mocks/androidWidget'));
const mockExtensionSet = jest.fn();
const mockReloadWidget = jest.fn();
jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: Object.assign(
    jest.fn().mockImplementation((group: string) => ({ set: (k: string, v: string) => mockExtensionSet(group, k, v) })),
    { reloadWidget: (...a: unknown[]) => mockReloadWidget(...a) },
  ),
}));

const widgetLib = jest.requireMock('react-native-android-widget') as { requestWidgetUpdate: jest.Mock };

function snap(over: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    ...emptySnapshot('2026-11-19', 1, true),
    workout: { sessionId: 's1', title: 'Push day', exercises: 6, minutes: 52, status: 'planned' },
    nextMeal: { slot: 'lunch', label: 'Lunch', name: 'Chicken karahi bowl', kcal: 610, time: '13:00' },
    kcal: { eaten: 1240, target: 2350 },
    macros: { p: { eaten: 96, target: 160 }, c: { eaten: 130, target: 250 }, f: { eaten: 38, target: 70 } },
    streakWeeks: 6,
    ...over,
  };
}

describe('snapshot logic', () => {
  it('weeksInARow counts ISO weeks and does not break on the current week', () => {
    expect(weekStart('2026-11-19')).toBe('2026-11-16'); // Thursday → Monday
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday → Monday
    const done = ['2026-11-17', '2026-11-12', '2026-11-03', '2026-10-28'];
    expect(weeksInARow(done, '2026-11-19')).toBe(4);
    expect(weeksInARow(done.slice(1), '2026-11-19')).toBe(3); // nothing yet this week: still 3
    expect(weeksInARow(['2026-11-03'], '2026-11-19')).toBe(0);
    expect(weeksInARow([], '2026-11-19')).toBe(0);
  });

  it('eatenTotals never counts a planned meal twice', () => {
    const meals = [
      { slot: 'lunch', name: 'Bowl', kcal: 600, p: 40, c: 60, f: 20, status: 'eaten', time: '13:00' },
      { slot: 'dinner', name: 'Rice', kcal: 700, p: 30, c: 90, f: 20, status: 'eaten', time: '19:00' },
      { slot: 'snack', name: 'Nuts', kcal: 200, p: 6, c: 8, f: 16, status: 'planned', time: '16:00' },
    ];
    const logs = [
      { slot: 'lunch', source: 'plan', kcal: 600, p: 40, c: 60, f: 20 },
      { slot: null, source: 'quick', kcal: 150, p: 0, c: 30, f: 0 },
    ];
    expect(eatenTotals(logs, meals)).toEqual({ kcal: 1450, p: 70, c: 180, f: 40 });
  });

  it('pickNextMeal and ringProgress', () => {
    const m = (slot: string, time: string, status = 'planned') => ({ slot, name: slot, kcal: 1, p: 0, c: 0, f: 0, status, time });
    const meals = [m('dinner', '19:00'), m('breakfast', '08:00', 'eaten'), m('lunch', '13:00')];
    expect(pickNextMeal(meals, '09:00')?.slot).toBe('lunch');
    expect(pickNextMeal(meals, '20:00')?.slot).toBe('lunch'); // first one still planned
    expect(pickNextMeal([], '09:00')).toBeNull();
    expect(ringProgress({ eaten: 50, target: 100 })).toBe(0.5);
    expect(ringProgress({ eaten: 500, target: 100 })).toBe(1);
    expect(ringProgress({ eaten: 5, target: 0 })).toBe(0);
  });

  it('forDate clears an old day but keeps the streak', () => {
    const old = snap({ date: '2026-11-18' });
    const s = forDate(old, '2026-11-19', 5);
    expect(s.workout).toBeNull();
    expect(s.kcal.eaten).toBe(0);
    expect(s.streakWeeks).toBe(6);
    expect(forDate(snap(), '2026-11-19', 5).workout?.title).toBe('Push day');
    expect(forDate(null, '2026-11-19', 5).date).toBe('2026-11-19');
    expect(parseSnapshot('{"v":99}')).toBeNull();
    expect(parseSnapshot('nope')).toBeNull();
  });

  it('deep links use the app scheme', () => {
    expect(WIDGET_LINKS.workout('s 1', true)).toBe('repwise://train?sessionId=s%201&start=1');
    expect(WIDGET_LINKS.workout(null, false)).toBe('repwise://train');
    expect(WIDGET_LINKS.quickLog).toBe('repwise://eat?log=1');
  });
});

describe('Android widgets', () => {
  it('ringSvg draws the track and a clamped arc', () => {
    const svg = ringSvg(0.5, 84, 8, '#00FF00', '#EEEEEE'); // eslint-disable-line no-restricted-syntax
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('rotate(-90 42 42)');
    expect(ringSvg(0, 84, 8, 'a', 'b')).not.toContain('stroke-dasharray');
    expect(ringSvg(Number.NaN, 84, 8, 'a', 'b')).not.toContain('stroke-dasharray');
  });

  it.each(['light', 'dark'] as const)('Today (%s): workout, ring, next meal and quick log', (scheme) => {
    const nodes = walkWidgetTree(<TodayWidget snapshot={snap()} scheme={scheme} />);
    const texts = nodes.filter((n) => n.type === 'TextWidget').map((n) => n.props.text);
    expect(texts).toEqual(expect.arrayContaining(['Push day · 52 min', 'Lunch · 13:00', 'Chicken karahi bowl', '1240 / 2350 kcal', '+ Log']));
    const uris = nodes.map((n) => (n.props.clickActionData as { uri?: string } | undefined)?.uri).filter(Boolean);
    expect(uris).toEqual(expect.arrayContaining([WIDGET_LINKS.quickLog, 'repwise://train?sessionId=s1', WIDGET_LINKS.eat]));
    const root = nodes[0]!;
    expect((root.props.style as { backgroundColor: string }).backgroundColor).toBe(colors[scheme].bg);
    // Every clickable part has an accessibility label.
    for (const n of nodes.filter((x) => x.props.clickAction)) expect(n.props.accessibilityLabel).toBeTruthy();
  });

  it('not Pro: a calm lock card instead of data', () => {
    const texts = walkWidgetTree(<TodayWidget snapshot={snap({ pro: false })} scheme="light" />)
      .filter((n) => n.type === 'TextWidget')
      .map((n) => n.props.text);
    expect(texts).toContain('Widgets are part of Repwise Pro');
    expect(texts).not.toContain('Push day · 52 min');
  });

  it('Streak and Macros render; renderWidget gives light + dark and null for unknown names', () => {
    const texts = walkWidgetTree(<StreakWidget snapshot={snap({ streakWeeks: 1 })} scheme="dark" />)
      .filter((n) => n.type === 'TextWidget')
      .map((n) => n.props.text);
    expect(texts).toEqual(['1', 'week in a row']);
    const macros = renderWidget(WIDGET_NAMES.macros, snap()) as { light: unknown; dark: unknown };
    expect(walkWidgetTree(macros.light).some((n) => n.props.text === '1110')).toBe(true); // kcal left
    expect(macros.dark).toBeTruthy();
    expect(renderWidget('Nope', snap())).toBeNull();
  });

  it('task handler renders from the stored snapshot and tracks widget_added', async () => {
    resetAnalyticsForTests();
    const today = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const date = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
    kv.set(MMKV_SNAPSHOT_KEY, JSON.stringify(snap({ date })));
    const render = jest.fn();
    await widgetTaskHandler({
      widgetInfo: { widgetName: WIDGET_NAMES.today, widgetId: 1, width: 300, height: 150, screenInfo: {} as never },
      widgetAction: 'WIDGET_ADDED',
      renderWidget: render,
    });
    expect(render).toHaveBeenCalledTimes(1);
    const light = (render.mock.calls[0]![0] as { light: unknown }).light;
    expect(walkWidgetTree(light).some((n) => n.props.text === 'Push day · 52 min')).toBe(true);
    expect(trackedEvents()).toContainEqual({ event: 'widget_added', props: { type: 'RepwiseToday' } });

    render.mockClear();
    await widgetTaskHandler({
      widgetInfo: { widgetName: WIDGET_NAMES.today, widgetId: 1, width: 300, height: 150, screenInfo: {} as never },
      widgetAction: 'WIDGET_DELETED',
      renderWidget: render,
    });
    expect(render).not.toHaveBeenCalled();
  });
});

describe('writeWidgetSnapshot', () => {
  beforeEach(() => {
    resetWriterForTests();
    mockExtensionSet.mockClear();
    mockReloadWidget.mockClear();
    widgetLib.requestWidgetUpdate.mockClear();
    kv.remove(MMKV_SNAPSHOT_KEY);
  });

  it(`writes MMKV + the ${Platform.OS} widget store, and skips unchanged snapshots`, async () => {
    expect(await writeWidgetSnapshot(snap())).toBe(true);
    expect(readStoredSnapshot()?.workout?.title).toBe('Push day');
    if (Platform.OS === 'ios') {
      expect(mockExtensionSet).toHaveBeenCalledWith('group.com.client.repwise', SNAPSHOT_KEY, expect.stringContaining('Push day'));
      expect(mockReloadWidget).toHaveBeenCalledTimes(1);
      expect(widgetLib.requestWidgetUpdate).not.toHaveBeenCalled();
    } else {
      expect(widgetLib.requestWidgetUpdate).toHaveBeenCalledTimes(3);
      expect(mockExtensionSet).not.toHaveBeenCalled();
    }
    // Same content, newer timestamp: nothing written.
    expect(await writeWidgetSnapshot({ ...snap(), updatedAt: 999 })).toBe(false);
    expect(await writeWidgetSnapshot(snap({ streakWeeks: 7 }))).toBe(true);
  });

  it('never throws when the native store fails', async () => {
    mockExtensionSet.mockImplementationOnce(() => {
      throw new Error('no app group');
    });
    widgetLib.requestWidgetUpdate.mockRejectedValueOnce(new Error('no widgets'));
    await expect(writeWidgetSnapshot(snap({ streakWeeks: 9 }))).resolves.toBe(true);
  });
});
