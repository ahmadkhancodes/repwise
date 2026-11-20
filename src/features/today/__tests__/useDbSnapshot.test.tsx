import { act, renderHook } from '@testing-library/react-native';
import * as ExpoRouter from 'expo-router';

import { freshDb } from '../testing/seed';
import { profileRepo } from '@/features/settings/repo';

import { useDbSnapshot } from '../hooks/useDbSnapshot';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

const flush = () => act(async () => new Promise<void>((r) => setTimeout(r, 0)));

beforeEach(async () => {
  await freshDb();
  jest.mocked(ExpoRouter.useIsFocused).mockReturnValue(true);
});

describe('useDbSnapshot', () => {
  it('coalesces a burst of writes to one reload', async () => {
    const load = jest.fn(() => 1);
    await renderHook(() => useDbSnapshot(['profile'], load, ['a']));
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      profileRepo.insert({ name: 'A' } as never);
      profileRepo.insert({ name: 'B' } as never);
      profileRepo.insert({ name: 'C' } as never);
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores other tables', async () => {
    const load = jest.fn(() => 1);
    await renderHook(() => useDbSnapshot(['meals'], load, []));
    await act(async () => {
      profileRepo.insert({ name: 'A' } as never);
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('while blurred only marks dirty, then reloads once on focus', async () => {
    const focused = jest.mocked(ExpoRouter.useIsFocused);
    focused.mockReturnValue(false);
    const load = jest.fn(() => 1);
    const { rerender } = await renderHook(() => useDbSnapshot(['profile'], load, []));
    await act(async () => {
      profileRepo.insert({ name: 'A' } as never);
      profileRepo.insert({ name: 'B' } as never);
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    focused.mockReturnValue(true);
    await rerender({});
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('re-runs when deps change and reports errors', async () => {
    let fail = false;
    const load = jest.fn(() => {
      if (fail) throw new Error('disk');
      return 1;
    });
    const { result, rerender } = await renderHook(({ d }: { d: string }) => useDbSnapshot(['profile'], load, [d]), {
      initialProps: { d: 'a' },
    });
    expect(result.current.data).toBe(1);
    fail = true;
    await rerender({ d: 'b' });
    expect(result.current.error?.message).toBe('disk');
  });
});
