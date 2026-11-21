import { act, renderHook, screen } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { FadeIn } from 'react-native-reanimated';

import { renderThemed } from '../../../test/render';

import { QuizFrame } from '@/features/onboarding/components/QuizFrame';

import { enterAt, exitFade, layoutSpring } from '../listMotion';
import { motionSafe, useMotionSafe } from '../motion';
import { showUndoToast, ToastHost, useToastStore } from '../Toast';

type Node = { props?: Record<string, unknown>; children?: (Node | string)[] };

/** Every rendered host node that carries a layout animation prop. */
function animatedNodes(): Node[] {
  const out: Node[] = [];
  const walk = (n: Node | string | null | undefined) => {
    if (!n || typeof n === 'string') return;
    if (n.props?.entering != null || n.props?.exiting != null) out.push(n);
    n.children?.forEach(walk);
  };
  walk(screen.root as unknown as Node);
  return out;
}

describe.each([false, true])(`reduce motion = %s (${Platform.OS})`, (reduced) => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(reduced);
    useToastStore.setState({ current: null, footers: [], held: false });
  });
  afterEach(() => spy.mockRestore());

  it('motionSafe / useMotionSafe drop the animation only when reduced', async () => {
    const anim = FadeIn.delay(300);
    expect(motionSafe(anim, reduced)).toBe(reduced ? undefined : anim);
    expect(motionSafe(null, reduced)).toBeUndefined();
    const { result } = await renderHook(() => useMotionSafe());
    expect(result.current(anim)).toBe(reduced ? undefined : anim);
  });

  it('the list helpers follow the same rule', () => {
    const expected = (v: unknown) => (reduced ? expect(v).toBeUndefined() : expect(v).toBeDefined());
    expected(enterAt(3, reduced));
    expected(exitFade(reduced));
    expected(layoutSpring(reduced));
  });

  it('QuizFrame (delayed options) renders its content with no entering animation when reduced', async () => {
    await renderThemed(
      <QuizFrame title="Your goal" index={0} total={15} onBack={jest.fn()} onNext={jest.fn()}>
        <Text>Build muscle</Text>
      </QuizFrame>,
    );
    expect(screen.getByText('Build muscle')).toBeTruthy();
    if (reduced) expect(animatedNodes()).toHaveLength(0);
    else expect(animatedNodes().length).toBeGreaterThan(0);
  });

  it('ToastHost: the toast appears without entering/exiting animations when reduced', async () => {
    await renderThemed(<ToastHost />);
    await act(() => showUndoToast('Lunch logged', jest.fn()));
    expect(screen.getByTestId('toast')).toBeTruthy();
    if (reduced) expect(animatedNodes()).toHaveLength(0);
    else expect(animatedNodes().length).toBeGreaterThan(0);
  });
});
