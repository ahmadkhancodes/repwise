import { EXERCISES_WITH_MEDIA, type Exercise } from '@repwise/content';

import { getCatalog, resetCatalogForTests, searchExercises } from '@/services/catalog';

import {
  blob,
  BODY_OUTLINE,
  ellipse,
  mirror,
  MUSCLE_REGIONS,
  muscleRole,
  VIEW_W,
  viewsWith,
} from '../logic/bodyMap';
import {
  EMPTY_DRAFT,
  draftToRow,
  lines,
  rowToDraft,
  validateDraft,
  isValid,
} from '../logic/customExercise';
import { friendlyDate, localISODate } from '../logic/dates';
import {
  EMPTY_FILTERS,
  EQUIPMENT_GROUPS,
  MUSCLE_GROUPS,
  activeFilterChips,
  activeFilterCount,
  equipmentGroupsOf,
  hasFilters,
  matchesFilters,
  toggle,
} from '../logic/filters';
import { EQUIPMENT, LEVEL_LABEL, MUSCLES, PATTERN_LABEL, muscleList } from '../logic/labels';
import {
  difficultyFromLevel,
  fromCatalog,
  fromCustom,
  itemSubtitle,
  levelFromDifficulty,
  searchLibrary,
  type CustomExerciseRow,
} from '../logic/libraryItem';
import {
  crossfadeOpacity,
  exerciseMediaUrls,
  isExerciseMediaLive,
  isSafePublicId,
} from '../logic/media';
import { mergeRecent, pushViewed, VIEWED_CAP } from '../logic/recent';
import {
  computeRecords,
  displayVolume,
  formatWeight,
  summariseSessions,
  unitsOf,
  type LoggedSet,
} from '../logic/records';

/* eslint-disable @typescript-eslint/no-require-imports */
const { epley1RM } = require('@repwise/engine/src/progression') as {
  epley1RM: (w: number, r: number) => number;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const catalog = () => getCatalog().exercises;
const byId = (id: string) => getCatalog().exerciseById.get(id) as Exercise;

const customRow = (o: Partial<CustomExerciseRow> = {}): CustomExerciseRow => ({
  id: 'c1',
  name: 'Garage sled pull',
  primaryMuscles: ['hamstrings', 'not_a_muscle'],
  secondary: ['glutes', 'hamstrings'],
  equipment: ['sled', 'spaceship'],
  pattern: 'hinge',
  difficulty: 2,
  steps: ['Pull'],
  tips: ['Brace'],
  ...o,
});

beforeAll(() => {
  resetCatalogForTests();
});

describe('filters', () => {
  it('every muscle sits in exactly one muscle group', () => {
    for (const m of MUSCLES) {
      const groups = Object.values(MUSCLE_GROUPS).filter((g) => g.muscles.includes(m));
      expect(groups).toHaveLength(1);
    }
  });

  it('every catalogue exercise belongs to at least one equipment group', () => {
    const grouped = new Set(Object.values(EQUIPMENT_GROUPS).flatMap((g) => g.items));
    for (const e of EQUIPMENT) {
      if (!grouped.has(e)) expect(['bench', 'squat_rack']).toContain(e);
    }
    // accessory-only exercises (bench dip) count as bodyweight
    expect(equipmentGroupsOf(byId('bench-dip').equipment)).toEqual(['bodyweight']);
    expect(matchesFilters(byId('bench-dip'), { ...EMPTY_FILTERS, equipment: ['bodyweight'] })).toBe(
      true,
    );
    expect(equipmentGroupsOf(['barbell', 'bench'])).toEqual(['barbell']);
  });

  it('ORs inside a group and ANDs across groups', () => {
    const squat = byId('barbell-back-squat');
    expect(matchesFilters(squat, EMPTY_FILTERS)).toBe(true);
    expect(matchesFilters(squat, { ...EMPTY_FILTERS, muscles: ['quads', 'chest'] })).toBe(true);
    expect(matchesFilters(squat, { ...EMPTY_FILTERS, muscles: ['chest'] })).toBe(false);
    expect(
      matchesFilters(squat, { ...EMPTY_FILTERS, muscles: ['quads'], equipment: ['barbell'] }),
    ).toBe(true);
    expect(
      matchesFilters(squat, { ...EMPTY_FILTERS, muscles: ['quads'], equipment: ['dumbbell'] }),
    ).toBe(false);
    expect(
      matchesFilters(squat, { ...EMPTY_FILTERS, patterns: ['squat'], levels: ['intermediate'] }),
    ).toBe(true);
    expect(matchesFilters(squat, { ...EMPTY_FILTERS, levels: ['beginner'] })).toBe(false);
    // secondary muscles do not count for the muscle filter
    expect(matchesFilters(squat, { ...EMPTY_FILTERS, muscles: ['inner_thighs'] })).toBe(false);
  });

  it('missing pattern/level never match an active filter', () => {
    const item = fromCustom(customRow({ pattern: null, difficulty: null }));
    expect(matchesFilters(item, { ...EMPTY_FILTERS, patterns: ['hinge'] })).toBe(false);
    expect(matchesFilters(item, { ...EMPTY_FILTERS, levels: ['beginner'] })).toBe(false);
  });

  it('toggle, counts and removable chips', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
    const f = {
      muscles: ['chest' as const],
      equipment: ['cable' as const],
      patterns: ['push_h' as const],
      levels: ['advanced' as const],
    };
    expect(activeFilterCount(f)).toBe(4);
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    const chips = activeFilterChips(f, { pattern: PATTERN_LABEL, level: LEVEL_LABEL });
    expect(chips.map((c) => c.label)).toEqual(['Chest', 'Cable', 'Horizontal push', 'Advanced']);
    expect(chips[1]!.remove(f).equipment).toEqual([]);
    expect(chips[3]!.remove(f)).toEqual({ ...f, levels: [] });
  });
});

describe('library items', () => {
  it('maps catalogue exercises (cached) and labels', () => {
    const squat = byId('barbell-back-squat');
    expect(fromCatalog(squat)).toBe(fromCatalog(squat));
    expect(fromCatalog(squat)).toMatchObject({
      custom: false,
      patternFamily: 'squat',
      level: 'intermediate',
    });
    expect(itemSubtitle(fromCatalog(squat))).toBe('Quads · Barbell');
    expect(muscleList(['quads', 'glutes', 'abs'])).toBe('Quads, Glutes +1');
  });

  it('drops unknown values from custom rows and never repeats a primary muscle', () => {
    const item = fromCustom(customRow());
    expect(item).toMatchObject({
      custom: true,
      primaryMuscles: ['hamstrings'],
      secondaryMuscles: ['glutes'],
      equipment: ['sled'],
      patternFamily: 'hinge',
      level: 'intermediate',
      instructions: ['Pull'],
      cues: ['Brace'],
      mediaId: null,
    });
    expect(
      fromCustom(customRow({ pattern: 'teleport', primaryMuscles: null })).patternFamily,
    ).toBeNull();
  });

  it('difficulty ↔ level', () => {
    expect([1, 2, 3, 0, 4, null].map(levelFromDifficulty)).toEqual([
      'beginner',
      'intermediate',
      'advanced',
      null,
      null,
      null,
    ]);
    expect(difficultyFromLevel('advanced')).toBe(3);
    expect(difficultyFromLevel(null)).toBeNull();
  });

  it('search: own exercises first, catalogue ranked, alphabetical when browsing', () => {
    const mine = [
      fromCustom(customRow({ name: 'Squat pause special', primaryMuscles: ['quads'] })),
    ];
    const res = searchLibrary(searchExercises, mine, 'squat', EMPTY_FILTERS);
    expect(res[0]!.id).toBe('c1');
    expect(res.slice(1).every((r) => !r.custom)).toBe(true);
    expect(res.length).toBeGreaterThan(5);

    const all = searchLibrary(searchExercises, [], '', EMPTY_FILTERS);
    expect(all).toHaveLength(catalog().length);
    const names = all.map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const chest = searchLibrary(searchExercises, mine, '', {
      ...EMPTY_FILTERS,
      muscles: ['chest'],
    });
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((c) => c.primaryMuscles.includes('chest'))).toBe(true);
    expect(searchLibrary(searchExercises, mine, 'zzzz qqq', EMPTY_FILTERS)).toEqual([]);
  });

  it('acceptance: search over the full catalogue + 50 custom exercises takes < 50 ms', () => {
    const customs = Array.from({ length: 50 }, (_, i) =>
      fromCustom(customRow({ id: `c${i}`, name: `My move ${i}` })),
    );
    searchLibrary(searchExercises, customs, 'warm', EMPTY_FILTERS); // warm the index
    for (const q of ['b', 'bench', 'row', 'dumbbell curl', 'glute', 'my mo', 'xyz']) {
      // best of 5: measures the search, not CI scheduler noise
      let best = Infinity;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        searchLibrary(searchExercises, customs, q, {
          ...EMPTY_FILTERS,
          equipment: ['dumbbell', 'barbell'],
        });
        best = Math.min(best, performance.now() - start);
      }
      expect(best).toBeLessThan(50);
    }
  });
});

describe('media urls', () => {
  const live = () => true;

  it('builds Cloudinary image thumb, poster and 2-frame urls', () => {
    const u = exerciseMediaUrls('repwise/exercises/barbell-back-squat', 'demo', live)!;
    expect(u.thumb).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,h_160,w_160,q_auto,f_webp/repwise/exercises/barbell-back-squat.webp',
    );
    expect(u.poster).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_480,q_auto,f_webp/repwise/exercises/barbell-back-squat.webp',
    );
    expect(u.frames).toEqual([
      u.poster,
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_480,q_auto,f_webp/repwise/exercises/barbell-back-squat-end.webp',
    ]);
    // A renderer that only knows `loop` still shows the correct still frame.
    expect(u.loop).toBe(u.poster);
    expect(u.thumb).not.toMatch(/video|so_0|fl_animated/);
  });

  it('returns null (offline placeholder, no request) without a cloud, a safe id or a live asset', () => {
    expect(exerciseMediaUrls('repwise/exercises/x', null, live)).toBeNull();
    expect(exerciseMediaUrls(null, 'demo', live)).toBeNull();
    expect(exerciseMediaUrls('../evil?x=1', 'demo', live)).toBeNull();
    expect(exerciseMediaUrls('repwise/exercises/x', 'demo', () => false)).toBeNull();
    expect(isSafePublicId('repwise/exercises/a-b_c')).toBe(true);
    expect(isSafePublicId('a//b')).toBe(false);
  });

  it('only requests media recorded as live in the content package', () => {
    expect(isExerciseMediaLive('repwise/exercises/not-an-exercise')).toBe(false);
    expect(isExerciseMediaLive('repwise/recipes/barbell-back-squat')).toBe(false);
    for (const id of EXERCISES_WITH_MEDIA) {
      expect(isExerciseMediaLive(`repwise/exercises/${id}`)).toBe(true);
    }
    expect(exerciseMediaUrls('repwise/exercises/not-an-exercise', 'demo')).toBeNull();
  });

  it('reads the cloud name from EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME', () => {
    const prev = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME = 'repwise-cdn';
    expect(exerciseMediaUrls('repwise/exercises/x', undefined, live)!.poster).toContain(
      'res.cloudinary.com/repwise-cdn/',
    );
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME = 'bad name/..';
    expect(exerciseMediaUrls('repwise/exercises/x', undefined, live)).toBeNull();
    if (prev === undefined) delete process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
    else process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME = prev;
  });

  it('crossfades start → end → start with holds', () => {
    const o = { holdMs: 100, fadeMs: 50 };
    expect(crossfadeOpacity(0, o)).toBe(0);
    expect(crossfadeOpacity(99, o)).toBe(0);
    expect(crossfadeOpacity(125, o)).toBeCloseTo(0.5);
    expect(crossfadeOpacity(150, o)).toBe(1);
    expect(crossfadeOpacity(249, o)).toBe(1);
    expect(crossfadeOpacity(275, o)).toBeCloseTo(0.5);
    expect(crossfadeOpacity(300, o)).toBe(0); // one full cycle
    expect(crossfadeOpacity(300 + 125, o)).toBeCloseTo(0.5);
    expect(crossfadeOpacity(-175, o)).toBeCloseTo(0.5); // negative time wraps
    expect(crossfadeOpacity(Number.NaN, o)).toBe(0);
    expect(crossfadeOpacity(120, { holdMs: 100, fadeMs: 0 })).toBe(1);
    for (let t = 0; t < 3000; t += 37) {
      const v = crossfadeOpacity(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('records', () => {
  const set = (o: Partial<LoggedSet>): LoggedSet => ({
    sessionId: 's1',
    date: '2026-11-10',
    type: 'working',
    weightKg: 100,
    reps: 5,
    doneAt: 1,
    ...o,
  });

  it('uses the engine Epley 1RM, skips warm-ups and unfinished sets', () => {
    const sets = [
      set({ weightKg: 100, reps: 5 }),
      set({ weightKg: 110, reps: 2 }),
      set({ weightKg: 140, reps: 1, type: 'warmup' }),
      set({ weightKg: 150, reps: 1, doneAt: null }),
      set({ sessionId: 's2', date: '2026-11-14', weightKg: 60, reps: 20 }),
    ];
    const r = computeRecords(sets);
    expect(r.e1rm!.value).toBeCloseTo(
      Math.max(epley1RM(100, 5), epley1RM(110, 2), epley1RM(60, 20)),
    );
    expect(r.heaviest).toEqual({ weightKg: 110, reps: 2, date: '2026-11-10' });
    expect(r.mostReps).toEqual({ weightKg: 60, reps: 20, date: '2026-11-14' });
    expect(r.sessionVolume).toEqual({ value: 1200, date: '2026-11-14' });
  });

  it('bodyweight-only sets give reps records but no 1RM', () => {
    const r = computeRecords([set({ weightKg: null, reps: 12 }), set({ weightKg: 0, reps: 15 })]);
    expect(r.e1rm).toBeNull();
    expect(r.heaviest).toBeNull();
    expect(r.mostReps!.reps).toBe(15);
    expect(r.sessionVolume).toBeNull();
    expect(computeRecords([])).toEqual({
      e1rm: null,
      heaviest: null,
      mostReps: null,
      sessionVolume: null,
    });
  });

  it('summarises sessions newest first with top set and volume', () => {
    const s = summariseSessions(
      [
        set({ sessionId: 'a', date: '2026-11-01', weightKg: 80, reps: 10, doneAt: 10 }),
        set({ sessionId: 'a', date: '2026-11-01', weightKg: 90, reps: 6, doneAt: 11 }),
        set({
          sessionId: 'b',
          date: null,
          weightKg: 85,
          reps: 8,
          doneAt: Date.UTC(2026, 10, 9, 12),
        }),
      ],
      5,
    );
    expect(s.map((x) => x.sessionId)).toEqual(['b', 'a']);
    expect(s[0]!.date).toBe('2026-11-09');
    expect(s[1]).toMatchObject({ sets: 2, volume: 1340, top: { weightKg: 90, reps: 6 } });
    expect(summariseSessions([set({}), set({ sessionId: 'z' })], 1)).toHaveLength(1);
  });

  it('formats in the user unit', () => {
    expect(unitsOf('lb')).toBe('lb');
    expect(unitsOf('imperial')).toBe('lb');
    expect(unitsOf(null)).toBe('kg');
    expect(formatWeight(102.5, 'kg')).toBe('102.5');
    expect(formatWeight(100, 'lb')).toBe('220.5');
    expect(displayVolume(1000, 'lb')).toBe(2205);
  });
});

describe('recent', () => {
  it('merges logged and viewed, newest first, deduplicated', () => {
    expect(
      mergeRecent(
        [
          { id: 'a', at: 5 },
          { id: 'b', at: 1 },
        ],
        [
          { id: 'b', at: 9 },
          { id: 'c', at: 3 },
        ],
      ),
    ).toEqual(['b', 'a', 'c']);
    expect(
      mergeRecent(
        [
          { id: 'a', at: 1 },
          { id: 'b', at: 2 },
        ],
        [],
        1,
      ),
    ).toEqual(['b']);
  });

  it('pushViewed moves to front and caps the list', () => {
    let list = pushViewed([], 'a', 1);
    list = pushViewed(list, 'b', 2);
    list = pushViewed(list, 'a', 3);
    expect(list).toEqual([
      { id: 'a', at: 3 },
      { id: 'b', at: 2 },
    ]);
    for (let i = 0; i < 40; i++) list = pushViewed(list, `x${i}`, 10 + i);
    expect(list).toHaveLength(VIEWED_CAP);
  });
});

describe('custom exercise draft', () => {
  const good = {
    ...EMPTY_DRAFT,
    name: ' Landmine row ',
    primaryMuscles: ['lats' as const],
    equipment: ['landmine' as const],
  };

  it('validates name, muscles, equipment and steps', () => {
    expect(validateDraft(EMPTY_DRAFT)).toEqual({
      name: 'Give it a name.',
      primaryMuscles: 'Pick at least one main muscle.',
      equipment: 'Pick the equipment, or Bodyweight.',
    });
    expect(isValid(validateDraft(good))).toBe(true);
    expect(validateDraft(good, ['landmine ROW']).name).toMatch(/already have/);
    expect(validateDraft({ ...good, name: 'x'.repeat(61) }).name).toMatch(/under 60/);
    expect(
      validateDraft({ ...good, steps: Array.from({ length: 9 }, () => 'a').join('\n') }).steps,
    ).toBeDefined();
  });

  it('round-trips draft → row → draft', () => {
    const d = {
      ...good,
      secondaryMuscles: ['lats' as const, 'biceps' as const],
      patternFamily: 'pull_h' as const,
      level: 'advanced' as const,
      steps: ' one \n\n two ',
      tips: 'brace',
    };
    const row = draftToRow(d);
    expect(row).toMatchObject({
      name: 'Landmine row',
      primaryMuscles: ['lats'],
      secondary: ['biceps'],
      pattern: 'pull_h',
      difficulty: 3,
      steps: ['one', 'two'],
      tips: ['brace'],
      isCustom: true,
      source: 'user',
    });
    expect(rowToDraft({ id: 'x', ...row })).toEqual({
      ...d,
      name: 'Landmine row',
      secondaryMuscles: ['biceps'],
      steps: 'one\ntwo',
    });
    expect(lines('a\n \nb')).toEqual(['a', 'b']);
  });
});

describe('body map geometry', () => {
  it('every muscle has a region in at least one view', () => {
    for (const m of MUSCLES) {
      expect(Boolean(MUSCLE_REGIONS.front[m] || MUSCLE_REGIONS.back[m])).toBe(true);
    }
  });

  it('paths are closed SVG strings inside the box and sides mirror', () => {
    const all = [
      ...BODY_OUTLINE,
      ...Object.values(MUSCLE_REGIONS.front).flat(),
      ...Object.values(MUSCLE_REGIONS.back).flat(),
    ] as string[];
    for (const d of all) {
      expect(d).toMatch(/^M[\d.]+ [\d.]+ .* Z$/);
      for (const n of d.match(/-?[\d.]+/g)!.map(Number)) expect(n).toBeGreaterThanOrEqual(0);
    }
    expect(mirror([[10, 5]])).toEqual([[VIEW_W - 10, 5]]);
    expect(
      blob([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    ).toBe('M5 5 Q0 0 5 0 Q10 0 10 5 Q10 10 5 5 Z');
    expect(ellipse(50, 10, 5, 5)).toContain('A5 5 0 1 0 55 10');
    expect(() => blob([[0, 0]])).toThrow(RangeError);
  });

  it('roles and views', () => {
    expect(muscleRole('quads', ['quads'], ['glutes'])).toBe('primary');
    expect(muscleRole('glutes', ['quads'], ['glutes'])).toBe('secondary');
    expect(muscleRole('abs', ['quads'], [])).toBe('none');
    expect(viewsWith(['lats'])).toEqual(['back']);
    expect(viewsWith(['chest', 'glutes'])).toEqual(['front', 'back']);
  });
});

describe('dates', () => {
  it('local ISO date and friendly labels', () => {
    expect(localISODate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(friendlyDate('2026-11-19', '2026-11-19')).toBe('Today');
    expect(friendlyDate('2026-11-20', '2026-11-19')).toBe('Tomorrow');
    expect(friendlyDate('2026-11-18', '2026-11-19')).toBe('Yesterday');
    expect(friendlyDate('2026-03-02', '2026-11-19')).toBe('2 Mar');
    expect(friendlyDate('2025-12-31', '2026-11-19')).toBe('31 Dec 2025');
  });
});
