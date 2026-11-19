import { fireEvent, screen } from '@testing-library/react-native';
import * as RN from 'react-native';

import { colors, sizes, typography } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { BigTimer, formatCountdown, spokenCountdown } from '../BigTimer';
import { estimateTextWidth, ringInnerWidth } from '../fit';

describe('countdown formatting', () => {
  it.each([
    [90_000, '1:30'],
    [65_001, '1:06'],
    [999, '0:01'],
    [0, '0:00'],
    [-5, '0:00'],
    [NaN, '0:00'],
    [600_000, '10:00'],
  ])('%p ms → %p', (ms, out) => expect(formatCountdown(ms)).toBe(out));

  it('speaks minutes and seconds', () => {
    expect(spokenCountdown(65_000)).toBe('1 minute 5 seconds');
    expect(spokenCountdown(120_000)).toBe('2 minutes');
    expect(spokenCountdown(1000)).toBe('1 second');
    expect(spokenCountdown(0)).toBe('0 seconds');
  });
});

describe.each(SCHEMES)('BigTimer (%s)', (scheme) => {
  afterEach(() => jest.restoreAllMocks());

  it('hero countdown, ±15 s and skip as gym-size buttons', async () => {
    const onAdjust = jest.fn();
    const onSkip = jest.fn();
    await renderThemed(
      <BigTimer
        remainingMs={90_000}
        totalMs={120_000}
        onAdjust={onAdjust}
        onSkip={onSkip}
        next="Next: Bench press · set 3"
        testID="bt"
      />,
      scheme,
    );
    expect(
      screen.getByRole('progressbar', { name: 'Rest timer, 1 minute 30 seconds left' }),
    ).toHaveAccessibilityValue({ now: 75 });
    const time = screen.getByTestId('bt-time', { includeHiddenElements: true });
    expect(time.props.children).toBe('1:30');
    expect(flat(time.props.style).fontVariant).toEqual(['tabular-nums']);
    expect(flat(time.props.style).color).toBe(colors[scheme].textPrimary);
    await fireEvent.press(screen.getByRole('button', { name: 'Add 15 seconds' }));
    expect(onAdjust).toHaveBeenLastCalledWith(15);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove 15 seconds' }));
    expect(onAdjust).toHaveBeenLastCalledWith(-15);
    const skip = screen.getByRole('button', { name: 'Skip rest' });
    expect(flat(skip.props.style).minHeight).toBeGreaterThanOrEqual(sizes.hitGym);
    await fireEvent.press(skip);
    expect(onSkip).toHaveBeenCalled();
    expect(screen.getByText('Next: Bench press · set 3')).toBeTruthy();
  });

  it('turns accent in the final seconds', async () => {
    await renderThemed(<BigTimer remainingMs={4000} totalMs={60_000} testID="bt" />, scheme);
    const time = screen.getByTestId('bt-time', { includeHiddenElements: true });
    expect(flat(time.props.style).color).toBe(colors[scheme].accentText);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the number fits the ring at 130% font', async () => {
    jest
      .spyOn(RN, 'useWindowDimensions')
      .mockReturnValue({ width: 360, height: 780, scale: 3, fontScale: 1.3 });
    await renderThemed(<BigTimer remainingMs={600_000} totalMs={600_000} testID="bt" />, scheme);
    const style = flat(screen.getByTestId('bt-time', { includeHiddenElements: true }).props.style);
    const size = style.fontSize as number;
    expect(size).toBeLessThanOrEqual(typography.hero.fontSize * 1.3);
    const box = ringInnerWidth(sizes.ringHero, sizes.ringStroke);
    expect(estimateTextWidth('10:00', size, style.letterSpacing as number)).toBeLessThanOrEqual(
      box,
    );
  });
});
