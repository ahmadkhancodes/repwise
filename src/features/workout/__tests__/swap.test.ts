import { getCatalog } from '@/services/catalog';

import {
  availableEquipment,
  hasEquipment,
  registerSwapProvider,
  swapAlternatives,
  toEngineExercise,
  toEngineProfile,
  type SwapRequest,
} from '../logic/swap';

const catalog = getCatalog();
const byId = catalog.exerciseById;
const req = (over: Partial<SwapRequest> = {}): SwapRequest => ({
  date: '2026-11-19',
  sessionExerciseIds: ['barbell-back-squat', 'barbell-bench-press', 'barbell-row'],
  index: 1,
  recentSessions: [],
  now: Date.UTC(2026, 10, 19),
  ...over,
});

afterEach(() => registerSwapProvider(null));

describe('engine adapter', () => {
  it('maps catalogue items to the engine shape via the @repwise/content adapter', () => {
    const e = toEngineExercise(byId.get('barbell-bench-press')!);
    expect(e).toMatchObject({ id: 'barbell-bench-press', pattern: 'push_h', level: 2, compound: true });
    expect(e?.equipment).toEqual(expect.arrayContaining(['barbell', 'bench']));
    const mobility = catalog.exercises.find((x) => x.pattern === 'mobility');
    if (mobility) expect(toEngineExercise(mobility)).toBeNull();
  });
  it('builds a valid profile with defaults', () => {
    const p = toEngineProfile({ injuries: ['knee', 'nonsense'], days: 9, experience: 'beginner' });
    expect(p).toMatchObject({ goal: 'maintain', sex: 'male', daysPerWeek: 6, experience: 'beginner', injuries: ['knee'] });
    expect(toEngineProfile(null).sessionMin).toBe(60);
  });
  it('checks equipment in the content vocabulary (with engine spellings as aliases)', () => {
    const home = availableEquipment(['dumbbell', 'bench']);
    expect(hasEquipment(byId.get('dumbbell-bench-press')!, home)).toBe(true);
    expect(hasEquipment(byId.get('barbell-bench-press')!, home)).toBe(false);
    expect(hasEquipment(byId.get('push-up')!, home)).toBe(true);
    expect(hasEquipment(byId.get('smith-machine-bench-press')!, availableEquipment(['smith', 'bench']))).toBe(true);
    expect(hasEquipment(byId.get('barbell-bench-press')!, availableEquipment(null))).toBe(true);
  });
});

describe('swapAlternatives', () => {
  it('returns up to 3 same-pattern alternatives from the engine, not already in the session', () => {
    const ids = swapAlternatives(req(), catalog.exercises, null);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(3);
    for (const id of ids) {
      expect(byId.get(id)?.pattern).toBe('push_h');
      expect(req().sessionExerciseIds).not.toContain(id);
    }
  });
  it('respects the user equipment and recent sessions', () => {
    const recent = [{ date: '2026-11-17', exerciseIds: ['dumbbell-bench-press'] }];
    const ids = swapAlternatives(req({ recentSessions: recent }), catalog.exercises, { equipment: ['dumbbell', 'bench'] });
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(hasEquipment(byId.get(id)!, availableEquipment(['dumbbell', 'bench']))).toBe(true);
      expect(id).not.toBe('dumbbell-bench-press');
    }
  });
  it('prefers a registered planner provider, and falls back when it fails', () => {
    registerSwapProvider(() => ['push-up', 'barbell-bench-press', 'unknown-id']);
    expect(swapAlternatives(req(), catalog.exercises)).toEqual(['push-up']);
    registerSwapProvider(() => {
      throw new Error('planner offline');
    });
    expect(swapAlternatives(req(), catalog.exercises).length).toBeGreaterThan(0);
  });
  it('falls back to curated alternatives for exercises the engine does not plan', () => {
    const mobility = catalog.exercises.find((e) => e.pattern === 'mobility')!;
    const ids = swapAlternatives(req({ sessionExerciseIds: [mobility.id], index: 0 }), catalog.exercises);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(mobility.id);
  });
  it('returns nothing for an unknown exercise', () => {
    expect(swapAlternatives(req({ sessionExerciseIds: ['nope'], index: 0 }), catalog.exercises)).toEqual([]);
  });
});
