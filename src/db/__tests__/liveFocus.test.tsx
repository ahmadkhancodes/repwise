/**
 * Perf audit r2 N4: `repo.useLive` / `useLiveRows` (Progress, Library, Eat, profile) never re-read
 * while their screen is blurred (a tab behind the workout player), and read once on focus.
 */
import { act, renderHook } from '@testing-library/react-native';
import * as ExpoRouter from 'expo-router';

import { freshDb } from '../../../test/workoutFixtures';
import { resetLiveRefreshForTests } from '@/db/events';
import { useScreenFocused } from '@/db/live';
import { sessionsRepo } from '@/features/workout/repo';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 150)));

beforeEach(async () => {
  await freshDb();
  jest.mocked(ExpoRouter.useIsFocused).mockReturnValue(true);
});
afterEach(() => resetLiveRefreshForTests());

it('repo.useLive skips refreshes while blurred and reads once on focus', async () => {
  const focused = jest.mocked(ExpoRouter.useIsFocused);
  focused.mockReturnValue(false);
  const { result, rerender } = await renderHook(() => sessionsRepo.useLive());
  expect(result.current.data).toHaveLength(0);
  await act(async () => {
    for (let i = 0; i < 5; i++) sessionsRepo.insert({ title: `S${i}` });
  });
  await settle();
  // Blurred: still the first read.
  expect(result.current.data).toHaveLength(0);
  focused.mockReturnValue(true);
  await rerender({});
  expect(result.current.data).toHaveLength(5);
});

it('useScreenFocused counts as focused outside a navigator', async () => {
  jest.mocked(ExpoRouter.useIsFocused).mockImplementation(() => {
    throw new Error("Couldn't find a focus context");
  });
  const { result } = await renderHook(() => useScreenFocused());
  expect(result.current).toBe(true);
});

it('useProfile has the row on the first render: no kg → lb flash for lb users (r2 N13)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { saveProfile, useProfile } = require('@/features/settings/repo') as typeof import('@/features/settings/repo');
  saveProfile({ units: 'imperial' } as never);
  const seen: (string | null | undefined)[] = [];
  await renderHook(() => {
    const p = useProfile();
    seen.push(p?.units);
    return p;
  });
  expect(seen[0]).toBe('imperial');
});
