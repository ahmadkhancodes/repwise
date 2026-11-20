import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES, flat } from '../../../../test/render';
import { MealRow, type MealRowModel } from '../components/MealRow';
import { recipeArt } from '../logic/art';

const base: MealRowModel = {
  id: 'm1',
  slot: 'lunch',
  title: 'Chicken karahi',
  status: 'planned',
  meta: 'Lunch · 13:00',
  kcal: 644,
  protein: 48,
  carbs: 65,
  fat: 21,
  art: recipeArt({ title: 'Chicken karahi', slot: 'lunch' }),
};

function setup(meal: Partial<MealRowModel> = {}, props: Record<string, unknown> = {}) {
  const h = { onOpen: jest.fn(), onToggle: jest.fn(), onSwap: jest.fn() };
  return {
    h,
    render: () => renderThemed(<MealRow meal={{ ...base, ...meal }} {...h} {...props} />, scheme),
  };
}
let scheme: (typeof SCHEMES)[number] = 'light';

describe.each(SCHEMES)(`MealRow (%s, ${Platform.OS})`, (s) => {
  beforeEach(() => {
    scheme = s;
  });

  it('one tap model: tick logs, body opens, long-press and the icon swap', async () => {
    const { h, render } = setup();
    await render();
    await fireEvent.press(screen.getByTestId('tick-lunch'));
    expect(h.onToggle).toHaveBeenCalledWith('m1');
    await fireEvent.press(screen.getByTestId('meal-lunch'));
    expect(h.onOpen).toHaveBeenCalledWith('m1');
    await fireEvent(screen.getByTestId('meal-lunch'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Swap Chicken karahi' }));
    expect(h.onSwap).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('checkbox', { name: 'Chicken karahi eaten' })).not.toBeChecked();
  });

  it('eaten: greyed with a filled tick, never struck through, no swap', async () => {
    const { render } = setup({ status: 'eaten' });
    await render();
    expect(screen.getByTestId('tick-lunch')).toBeChecked();
    const title = screen.getByText('Chicken karahi');
    expect(flat(title.props.style).textDecorationLine).toBeUndefined();
    expect(screen.queryByTestId('swap-lunch')).toBeNull();
    expect(screen.getByTestId('meal-lunch').props.accessibilityLabel).toMatch(/, eaten$/);
  });

  it('skipped: a badge instead of macros, no strike', async () => {
    const { render } = setup({ status: 'skipped' });
    await render();
    expect(screen.getByTestId('meal-skipped-lunch')).toBeTruthy();
    expect(flat(screen.getByText('Chicken karahi').props.style).textDecorationLine).toBeUndefined();
  });

  it('compact (Today): no art, prefixed ids and a Next badge', async () => {
    const { render } = setup({}, { compact: true, next: true, idPrefix: 'today-' });
    await render();
    expect(screen.queryByTestId('today-meal-art-lunch')).toBeNull();
    expect(screen.getByTestId('today-tick-lunch')).toBeTruthy();
    expect(screen.getByTestId('today-swap-lunch')).toBeTruthy();
    expect(screen.getByTestId('today-next-meal')).toBeTruthy();
  });

  it('locked: read-only, the body still opens the recipe', async () => {
    const { h, render } = setup({}, { locked: true });
    await render();
    expect(screen.queryByTestId('tick-lunch')).toBeNull();
    expect(screen.queryByTestId('swap-lunch')).toBeNull();
    await fireEvent.press(screen.getByTestId('meal-lunch'));
    expect(h.onOpen).toHaveBeenCalled();
  });

  it('preview (plan reveal): same row, nothing to press, kcal-only without macros', async () => {
    const { render } = setup(
      { protein: undefined, carbs: undefined, fat: undefined },
      { preview: true, idPrefix: 'reveal-' },
    );
    await render();
    expect(screen.queryByTestId('reveal-tick-lunch')).toBeNull();
    expect(screen.queryByTestId('reveal-swap-lunch')).toBeNull();
    expect(screen.getByTestId('reveal-meal-lunch').props.accessibilityRole).toBe('text');
    expect(screen.getByText('644 kcal')).toBeTruthy();
  });
});
