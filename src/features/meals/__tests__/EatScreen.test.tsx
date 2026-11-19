import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { logsForDate } from '@/features/nutrition/repo';
import * as catalog from '@/services/catalog';
import { useToastStore } from '@/ui';

import { startOfWeek, todayISO, weekDates } from '../logic/dates';
import { mealPlanForDate, mealsForPlan } from '../repo';
import * as service from '../service';
import { EatScreen } from '../screens/EatScreen';
import { freshDb, lockPro, onboard } from './helpers';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

beforeEach(async () => {
  await freshDb();
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

describe.each(SCHEMES)('EatScreen (%s)', (scheme) => {
  it('shows the set-up empty state without a profile', async () => {
    await renderThemed(<EatScreen />, scheme);
    expect(await screen.findByTestId('eat-no-profile')).toBeTruthy();
  });

  it('plans the day offline and renders rings + meals', async () => {
    onboard();
    await renderThemed(<EatScreen />, scheme);
    expect(screen.getByTestId('screen-eat')).toBeTruthy();
    expect(await screen.findByTestId('meal-lunch')).toBeTruthy();
    expect(screen.getByTestId('meal-breakfast')).toBeTruthy();
    expect(screen.getByTestId('meal-dinner')).toBeTruthy();
    expect(screen.getByTestId('eat-rings')).toBeTruthy();
    expect(screen.getByText(/^Today/)).toBeTruthy();
  });
});

describe('EatScreen interactions', () => {
  beforeEach(() => onboard());

  it('shows a skeleton while the catalogue loads', async () => {
    const spy = jest.spyOn(catalog, 'useCatalog').mockReturnValue(null);
    await renderThemed(<EatScreen />);
    expect(screen.getByTestId('eat-loading')).toBeTruthy();
    expect(screen.queryByTestId('meal-lunch')).toBeNull();
    spy.mockRestore();
  });

  it('1-tap tick logs the meal and can be undone', async () => {
    await renderThemed(<EatScreen />);
    const tick = await screen.findByTestId('tick-lunch');
    await fireEvent.press(tick);
    await waitFor(() => expect(screen.getByTestId('tick-lunch')).toBeChecked());
    expect(logsForDate(todayISO())).toHaveLength(1);
    expect(useToastStore.getState().current?.actionLabel).toBe('Undo');
    await act(async () => useToastStore.getState().current?.onAction?.());
    await waitFor(() => expect(screen.getByTestId('tick-lunch')).not.toBeChecked());
    expect(logsForDate(todayISO())).toHaveLength(0);
  });

  it('swap sheet offers alternatives and swaps in one tap', async () => {
    await renderThemed(<EatScreen />);
    await screen.findByTestId('meal-dinner');
    const plan = mealPlanForDate(todayISO())!;
    const before = mealsForPlan(plan.id).find((m) => m.slot === 'dinner')!.recipeId;
    await fireEvent.press(screen.getByTestId('swap-dinner'));
    const option = await screen.findByTestId('swap-option-0');
    await fireEvent.press(option);
    await waitFor(() => expect(mealsForPlan(plan.id).find((m) => m.slot === 'dinner')!.recipeId).not.toBe(before));
    expect(useToastStore.getState().current?.message).toMatch(/^Swapped to /);
  });

  it('deep link /eat?log=1 (widget quick log) opens the food log for today', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ log: '1' });
    await renderThemed(<EatScreen />);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/meal/log', params: { date: todayISO() } });
  });

  it('deep link /eat?mealId=…&swap=1 (notification Swap) opens that meal\'s swap sheet', async () => {
    const first = await renderThemed(<EatScreen />);
    await screen.findByTestId('meal-dinner');
    const dinner = mealsForPlan(mealPlanForDate(todayISO())!.id).find((m) => m.slot === 'dinner')!;
    await first.unmount(); // RNTL 14: an unawaited unmount stalls later live queries
    jest.mocked(useLocalSearchParams).mockReturnValue({ mealId: dinner.id, swap: '1' });
    await renderThemed(<EatScreen />);
    expect(await screen.findByTestId('swap-option-0')).toBeTruthy();
  });

  it('long-press opens the swap sheet too (W4)', async () => {
    await renderThemed(<EatScreen />);
    await fireEvent(await screen.findByTestId('meal-lunch'), 'longPress');
    expect(await screen.findByTestId('swap-option-0')).toBeTruthy();
  });

  it('opens the recipe with the planned portion', async () => {
    await renderThemed(<EatScreen />);
    await fireEvent.press(await screen.findByTestId('meal-breakfast'));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/recipe/[id]', params: expect.objectContaining({ mealId: expect.any(String) }) }),
    );
  });

  it('week view lists 7 days and opens a day', async () => {
    await renderThemed(<EatScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Week' }));
    expect(await screen.findByTestId('week-days')).toBeTruthy();
    expect(screen.getByTestId('week-label').props.children).toBe('This week');
    await fireEvent.press(screen.getByTestId('week-grocery'));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/grocery' }));
    await fireEvent.press(screen.getByTestId(`week-day-${todayISO()}`));
    expect(await screen.findByTestId('week-strip')).toBeTruthy();
    expect(await screen.findByTestId('meal-lunch')).toBeTruthy();
  });

  it('locks days beyond today for free users (Pro beyond today)', async () => {
    lockPro();
    await renderThemed(<EatScreen />);
    await screen.findByTestId('meal-lunch');
    const other = weekDates(startOfWeek(todayISO())).find((d) => d !== todayISO())!;
    await fireEvent.press(screen.getByTestId(`day-${other}`));
    expect(await screen.findByTestId('eat-locked')).toBeTruthy();
    expect(screen.queryByTestId('swap-lunch')).toBeNull();
  });

  it('shows an error state with retry when planning fails', async () => {
    const spy = jest.spyOn(service, 'ensureWeekMeals').mockImplementation(() => {
      throw new Error('boom');
    });
    await renderThemed(<EatScreen />);
    expect(await screen.findByTestId('eat-error')).toBeTruthy();
    spy.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('meal-lunch')).toBeTruthy();
  });

  it('water card: long-press adds a glass', async () => {
    await renderThemed(<EatScreen />);
    await screen.findByTestId('meal-lunch');
    await fireEvent(screen.getByTestId('open-water'), 'longPress');
    await waitFor(() => expect(screen.getByText('250 ml')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('open-water'));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/meal/water' }));
  });
});
