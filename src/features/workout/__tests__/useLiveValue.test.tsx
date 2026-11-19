import { act, renderHook } from '@testing-library/react-native';

import { freshDb, plannedSession } from '../../../../test/workoutFixtures';

import { useLiveValue } from '../hooks/useLiveValue';
import { sessionsRepo } from '../repo';

beforeEach(freshDb);

it('computes synchronously on first render and follows table changes', async () => {
  const { result } = await renderHook(() => useLiveValue(() => sessionsRepo.list().length, ['sessions'], []));
  expect(result.current).toEqual({ data: 0, loaded: true });
  await act(async () => {
    plannedSession();
  });
  expect(result.current.data).toBe(1);
});

it('reports errors instead of throwing', async () => {
  const { result } = await renderHook(() =>
    useLiveValue(
      () => {
        throw new Error('disk');
      },
      ['sessions'],
      [],
    ),
  );
  expect(result.current.error?.message).toBe('disk');
  expect(result.current.loaded).toBe(true);
});
