import { Platform } from 'react-native';

import mediaMap from '../../../../packages/content/exercise_media.json';
import v1 from '../../../../packages/content/exercisedb_v1.json';
import { __resetExerciseDbForTests, loadExerciseDb } from '../hooks/useExerciseDb';
import {
  cleanStep,
  exerciseDbItems,
  fromExerciseDb,
  isExerciseDbItemId,
  sentenceCase,
  type ExerciseDbRaw,
} from '../logic/exerciseDb';
import { EMPTY_FILTERS } from '../logic/filters';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../logic/labels';
import { indexItem, searchLibrary } from '../logic/libraryItem';

const raw = (over: Partial<ExerciseDbRaw> = {}): ExerciseDbRaw => ({
  exerciseId: 'abc123',
  name: 'dumbbell incline fly',
  gifUrl: 'https://cdn/x.gif',
  bodyParts: ['chest'],
  equipments: ['dumbbell'],
  targetMuscles: ['pectorals'],
  secondaryMuscles: ['deltoids', 'triceps', 'pectorals', 'mystery muscle'],
  instructions: ['Step:1 Lie back on the bench.', 'Step:2 Open the arms wide.'],
  ...over,
});

describe(`ExerciseDB V1 → library (${Platform.OS})`, () => {
  it('maps a record to a browse-only item in our vocab', () => {
    const item = fromExerciseDb(raw());
    expect(item).toMatchObject({
      id: 'exercisedb-abc123',
      name: 'Dumbbell incline fly',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['front_delts', 'side_delts', 'triceps'],
      equipment: ['dumbbell'],
      mediaId: 'exercisedb/abc123',
      instructions: ['Lie back on the bench.', 'Open the arms wide.'],
      browseOnly: true,
      custom: false,
    });
    expect(isExerciseDbItemId(item.id)).toBe(true);
    expect(isExerciseDbItemId('barbell-back-squat')).toBe(false);
  });

  it('no GIF → no mediaId (the muscle map shows); unknown kit → bodyweight', () => {
    const item = fromExerciseDb(raw({ gifUrl: null, equipments: ['tire'] }));
    expect(item.mediaId).toBeNull();
    expect(item.equipment).toEqual(['bodyweight']);
  });

  it('cleans steps and names', () => {
    expect(cleanStep('Step:12 Hold.')).toBe('Hold.');
    expect(cleanStep('step 3: Breathe')).toBe('Breathe');
    expect(cleanStep('Stand tall.')).toBe('Stand tall.');
    expect(sentenceCase('  barbell   curl ')).toBe('Barbell curl');
  });

  it('skips V1 records already behind an engine exercise, and duplicates', () => {
    const items = exerciseDbItems(
      [raw({ exerciseId: 'a1b' }), raw({ exerciseId: 'c2d', name: 'apple' }), raw({ exerciseId: 'c2d' })],
      new Set(['a1b']),
    );
    expect(items.map((i) => i.id)).toEqual(['exercisedb-c2d']);
  });

  it('the real dataset: every item is valid, ids are unique, nothing raw leaks', () => {
    __resetExerciseDbForTests();
    const db = loadExerciseDb();
    const covered = new Set(Object.values(mediaMap.exercises).filter(Boolean));
    expect(db.items.length).toBe((v1 as unknown[]).length - covered.size);
    expect(new Set(db.items.map((i) => i.id)).size).toBe(db.items.length);
    for (const i of db.items) {
      for (const m of [...i.primaryMuscles, ...i.secondaryMuscles]) expect(MUSCLE_LABEL[m]).toBeTruthy();
      for (const e of i.equipment) expect(EQUIPMENT_LABEL[e]).toBeTruthy();
      expect(i.instructions.some((s) => /^step\s*:?\s*\d/i.test(s))).toBe(false);
    }
    // Most V1 exercises have a target muscle we can draw.
    expect(db.items.filter((i) => i.primaryMuscles.length).length / db.items.length).toBeGreaterThan(0.9);
  });

  it('search puts curated exercises first and then V1 matches', () => {
    const db = loadExerciseDb();
    const curated = fromExerciseDb(raw({ exerciseId: 'zzz111', name: 'cable fly' }));
    const res = searchLibrary(
      () => [],
      [{ ...curated, id: 'mine', custom: true, browseOnly: false }],
      'fly',
      EMPTY_FILTERS,
      2500,
      db.indexed,
    );
    expect(res[0]!.id).toBe('mine');
    expect(res.length).toBeGreaterThan(5);
    expect(res.slice(1).every((i) => i.browseOnly)).toBe(true);
    expect(indexItem(curated).entry.hay).toContain('chest');
  });
});
