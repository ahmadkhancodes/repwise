import { screen } from '@testing-library/react-native';
import * as RN from 'react-native';

import { sizes, spacing } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { estimateTextWidth, ringInnerWidth } from '../fit';
import { MacroRings, macroRingModel } from '../MacroRings';

const TARGET = { kcal: 2400, protein: 180, carbs: 250, fat: 70 };

describe('macroRingModel', () => {
  it('computes fills and kcal left', () => {
    const m = macroRingModel({ kcal: 600, protein: 90, carbs: 0, fat: 70 }, TARGET);
    expect(m).toMatchObject({
      kcal: 0.25,
      protein: 0.5,
      carbs: 0,
      fat: 1,
      kcalValue: 1800,
      over: false,
    });
  });
  it('flags kcal over and survives zero targets', () => {
    const m = macroRingModel({ kcal: 2650, protein: 1, carbs: 1, fat: 1 }, { ...TARGET, fat: 0 });
    expect(m.over).toBe(true);
    expect(m.kcalValue).toBe(250);
    expect(m.fat).toBe(0);
  });
});

describe.each(SCHEMES)('MacroRings (%s)', (scheme) => {
  afterEach(() => jest.restoreAllMocks());

  it('labels every ring and fits the kcal number at 130% font', async () => {
    jest
      .spyOn(RN, 'useWindowDimensions')
      .mockReturnValue({ width: 360, height: 780, scale: 3, fontScale: 1.3 });
    await renderThemed(
      <MacroRings
        eaten={{ kcal: 550, protein: 40, carbs: 60, fat: 20 }}
        target={TARGET}
        testID="mr"
      />,
      scheme,
    );
    expect(
      screen.getByRole('progressbar', { name: 'Calories: 550 of 2400, 1850 left' }),
    ).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Protein: 40 of 180 grams' })).toBeTruthy();
    expect(screen.getByText('kcal left')).toBeTruthy();
    const value = screen.getByTestId('mr-kcal-value');
    const style = flat(value.props.style);
    const box = ringInnerWidth(sizes.ring + spacing.xl, sizes.ringStroke);
    const width = estimateTextWidth(
      '1,850',
      style.fontSize as number,
      style.letterSpacing as number,
    );
    expect(width).toBeLessThanOrEqual(box);
    expect(value.props.allowFontScaling).toBe(false);
  });
});
