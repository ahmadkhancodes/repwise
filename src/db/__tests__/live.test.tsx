/**
 * Perf audit r2 N3: expo-sqlite fires one change event per ROW, each in its own JS task. The mock's
 * 'rowAsync' mode does the same, so these tests see what a device sees.
 */
import { act, renderHook } from '@testing-library/react-native';
import { addDatabaseChangeListener } from 'expo-sqlite';

import { freshDb, plannedSession } from '../../../test/workoutFixtures';
import { holdLiveRefresh, resetLiveRefreshForTests, subscribeTables } from '@/db/events';
import { useLiveRows, useLiveValue } from '@/db/live';
import { withTransaction } from '@/db/transaction';
import { useWorkout } from '@/features/workout/hooks/useWorkout';
import * as workoutRepo from '@/features/workout/repo';
import { getCatalog } from '@/services/catalog';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqliteMock = require('expo-sqlite') as { __setChangeEventMode: (m: string) => void };

/** Let every queued row event and the frame flush run. */
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 150)));

function countEvents(table: string): { count: () => number; stop: () => void } {
  let n = 0;
  const sub = addDatabaseChangeListener((e) => {
    if (e.tableName === table) n++;
  });
  return { count: () => n, stop: () => sub.remove() };
}

beforeEach(async () => {
  await freshDb();
  sqliteMock.__setChangeEventMode('rowAsync');
});

afterEach(() => {
  sqliteMock.__setChangeEventMode('statement');
  resetLiveRefreshForTests();
});

describe('subscribeTables (one refresh per burst)', () => {
  it('24 row inserts in one transaction refresh a subscriber once', async () => {
    const events = countEvents('sessions');
    const cb = jest.fn();
    const off = subscribeTables(['sessions'], cb);
    withTransaction(() => {
      for (let i = 0; i < 24; i++) workoutRepo.sessionsRepo.insert({ title: `S${i}` });
    });
    await settle();
    expect(events.count()).toBe(24);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    events.stop();
  });

  it('ignores other tables and stops after unsubscribe', async () => {
    const cb = jest.fn();
    const off = subscribeTables(['meals'], cb);
    workoutRepo.sessionsRepo.insert({ title: 'A' });
    await settle();
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('a hold collects changes and flushes once on release (sync pull)', async () => {
    const cb = jest.fn();
    subscribeTables(['sessions'], cb);
    const release = holdLiveRefresh();
    for (let page = 0; page < 3; page++) {
      withTransaction(() => {
        for (let i = 0; i < 50; i++) workoutRepo.sessionsRepo.insert({ title: `P${page}-${i}` });
      });
      await settle();
    }
    expect(cb).not.toHaveBeenCalled();
    release();
    release(); // idempotent
    await settle();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('one throwing subscriber does not stop the others', async () => {
    const good = jest.fn();
    subscribeTables(['sessions'], () => {
      throw new Error('boom');
    });
    subscribeTables(['sessions'], good);
    workoutRepo.sessionsRepo.insert({ title: 'A' });
    await settle();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe('"Start workout" refreshes the player once', () => {
  it('about 24 row events → 1 useWorkout re-query (was one per event)', async () => {
    const s = plannedSession();
    // Make it a big session: 6 exercises × 4 sets = 24 pre-filled set rows.
    withTransaction(() => {
      for (let i = 0; i < 4; i++) {
        workoutRepo.sessionExercisesRepo.insert({
          sessionId: s.id,
          exerciseId: 'barbell-bench-press',
          position: 10 + i,
          targetSets: 4,
        } as never);
      }
    });
    await settle();
    const catalog = getCatalog();
    const { result } = await renderHook(() => useWorkout(s.id, catalog));
    expect(result.current.data?.session?.status).not.toBe('active');
    const spy = jest.spyOn(workoutRepo, 'getSession');
    const setEvents = countEvents('sets');
    await act(async () => {
      workoutRepo.startWorkout(s.id);
    });
    await settle();
    expect(setEvents.count()).toBeGreaterThanOrEqual(20);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.data?.session?.status).toBe('active');
    spy.mockRestore();
    setEvents.stop();
  });
});

describe('useLiveValue / useLiveRows', () => {
  it('compute on the first render, then once per burst', async () => {
    const compute = jest.fn(() => workoutRepo.sessionsRepo.list().length);
    const { result } = await renderHook(() => useLiveValue(compute, ['sessions'], []));
    expect(result.current).toEqual({ data: 0, loaded: true });
    await act(async () => {
      withTransaction(() => {
        for (let i = 0; i < 10; i++) workoutRepo.sessionsRepo.insert({ title: `S${i}` });
      });
    });
    await settle();
    expect(result.current.data).toBe(10);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('inactive: marks stale, then refreshes once when active again', async () => {
    const compute = jest.fn(() => workoutRepo.sessionsRepo.list().length);
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useLiveValue(compute, ['sessions'], [], { active }),
      { initialProps: { active: false } },
    );
    await act(async () => {
      workoutRepo.sessionsRepo.insert({ title: 'A' });
      workoutRepo.sessionsRepo.insert({ title: 'B' });
    });
    await settle();
    expect(compute).toHaveBeenCalledTimes(1);
    await rerender({ active: true });
    expect(compute).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe(2);
  });

  it('useLiveRows returns rows on the first render (no empty flash) and follows writes', async () => {
    workoutRepo.sessionsRepo.insert({ title: 'Seed' });
    await settle();
    const { result } = await renderHook(() =>
      useLiveRows(() => ({ all: () => workoutRepo.sessionsRepo.list() }), ['sessions'], []),
    );
    expect(result.current.data).toHaveLength(1);
    expect(result.current.loaded).toBe(true);
    await act(async () => {
      workoutRepo.sessionsRepo.insert({ title: 'Two' });
    });
    await settle();
    expect(result.current.data).toHaveLength(2);
  });

  it('reports errors instead of throwing', async () => {
    const { result } = await renderHook(() =>
      useLiveRows(
        () => ({
          all: () => {
            throw new Error('disk');
          },
        }),
        ['sessions'],
        [],
      ),
    );
    expect(result.current.error?.message).toBe('disk');
    expect(result.current.data).toEqual([]);
  });
});
