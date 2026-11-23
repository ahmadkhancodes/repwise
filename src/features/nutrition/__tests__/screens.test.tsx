import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { closeGate, useGateSheet } from '@/features/billing/components/GateSheet';
import { freshDb, lockPro, onboard } from '@/features/meals/__tests__/helpers';
import { todayISO } from '@/features/meals/logic/dates';
import { mealPlanForDate, mealsForPlan } from '@/features/meals/repo';
import { ensureWeekMeals } from '@/features/meals/service';
import { useToastStore } from '@/ui';

import { totalWaterMl } from '../logic/water';
import { logFood, logsForDate } from '../repo';
import { DayLogScreen } from '../screens/DayLogScreen';
import { FoodLogScreen } from '../screens/FoodLogScreen';
import { WaterScreen } from '../screens/WaterScreen';
import { getWaterGoal } from '../waterGoal';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const params = useLocalSearchParams as jest.Mock;
const today = () => todayISO();
const meals = () => mealsForPlan(mealPlanForDate(today())!.id);

beforeEach(async () => {
  await freshDb();
  jest.clearAllMocks();
  params.mockReturnValue({});
});

describe('FoodLogScreen (S23)', () => {
  it.each(SCHEMES)('ate out replaces the planned meal and rebalances (%s)', async (scheme) => {
    onboard();
    ensureWeekMeals(today());
    await renderThemed(<FoodLogScreen />, scheme);
    await fireEvent.press(screen.getByTestId('log-slot-lunch'));
    expect(screen.getByTestId('log-replace')).toBeChecked();
    await fireEvent.press(screen.getByTestId('estimate-large'));
    await fireEvent.press(screen.getByTestId('log-out-save'));
    const logs = logsForDate(today());
    expect(logs).toEqual([expect.objectContaining({ source: 'quick', slot: 'lunch', kcal: 1100, name: 'Big meal out' })]);
    expect(meals().find((m) => m.slot === 'lunch')!.status).toBe('skipped');
    expect(useToastStore.getState().current?.message).toMatch(/^Meal out logged/);
    expect(router.back).toHaveBeenCalled();
  });

  it('food search → portion wheel → add, then shows as recent', async () => {
    await renderThemed(<FoodLogScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Search food' }));
    expect(screen.getByTestId('food-hint')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('food-search'), 'white rice');
    await fireEvent.press(await screen.findByTestId('food-rice-white'));
    expect(screen.getByTestId('portion-wheel')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('portion-add'));
    const log = logsForDate(today())[0]!;
    expect(log).toMatchObject({ source: 'search' });
    expect(log.kcal).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByTestId('food-search'), '');
    expect(await screen.findByTestId('food-recent')).toBeTruthy();
  });

  it('no matches state', async () => {
    params.mockReturnValue({ mode: 'food' });
    await renderThemed(<FoodLogScreen />);
    await fireEvent.changeText(screen.getByTestId('food-search'), 'zzzzqqq');
    expect(await screen.findByTestId('food-none')).toBeTruthy();
  });
});

describe('DayLogScreen (S26)', () => {
  it.each(SCHEMES)('empty day (%s)', async (scheme) => {
    await renderThemed(<DayLogScreen />, scheme);
    expect(await screen.findByTestId('day-log-empty')).toBeTruthy();
  });

  it('ate it / half / skipped and remove with undo', async () => {
    onboard();
    ensureWeekMeals(today());
    params.mockReturnValue({ date: today() });
    await renderThemed(<DayLogScreen />);
    await fireEvent.press(await screen.findByTestId('ate-lunch'));
    await waitFor(() => expect(screen.getByTestId('ate-lunch')).toBeChecked());
    const full = logsForDate(today())[0]!.kcal;
    await fireEvent.press(screen.getByTestId('half-lunch'));
    await waitFor(() => expect(screen.getByTestId('half-lunch')).toBeChecked());
    expect(logsForDate(today())[0]!.kcal).toBeLessThan(full);
    await fireEvent.press(screen.getByTestId('skip-dinner'));
    await waitFor(() => expect(meals().find((m) => m.slot === 'dinner')!.status).toBe('skipped'));
    await fireEvent.press(screen.getByTestId('remove-0'));
    await waitFor(() => expect(logsForDate(today())).toHaveLength(0));
    await act(async () => useToastStore.getState().current?.onAction?.());
    await waitFor(() => expect(logsForDate(today())).toHaveLength(1));
    await fireEvent.press(screen.getByTestId('day-log-add'));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/meal/log' }));
  });

  it('lists food logged without a plan', async () => {
    logFood({ date: today(), source: 'search', name: 'Banana', slot: 'snack', kcal: 105, p: 1.3, c: 27, f: 0.4 });
    await renderThemed(<DayLogScreen />);
    expect(await screen.findByText('Banana')).toBeTruthy();
  });
});

describe('WaterScreen (S27)', () => {
  it.each(SCHEMES)('one tap adds a glass; chips add more (%s)', async (scheme) => {
    await renderThemed(<WaterScreen />, scheme);
    await fireEvent.press(screen.getByTestId('water-add'));
    await fireEvent.press(screen.getByTestId('water-500'));
    await waitFor(() => expect(totalWaterMl(logsForDate(today()))).toBe(750));
    expect(await screen.findByTestId('water-entries')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('water-remove-0'));
    await waitFor(() => expect(totalWaterMl(logsForDate(today()))).toBe(250));
  });

  it('goal stepper persists', async () => {
    await renderThemed(<WaterScreen />);
    await fireEvent.press(screen.getByTestId('water-goal-inc'));
    expect(getWaterGoal()).toBe(2250);
  });
});

describe('FoodLogScreen Pro gate (sheet 05: ate-out rebalance is Pro)', () => {
  beforeEach(() => closeGate());

  it('free users start on Search food; Ate out opens the gate sheet', async () => {
    onboard();
    ensureWeekMeals(today());
    lockPro();
    await renderThemed(<FoodLogScreen />);
    expect(screen.queryByTestId('log-out-save')).toBeNull();
    await fireEvent.press(screen.getByText('Ate out'));
    expect(useGateSheet.getState().feature).toBe('ate_out');
    expect(screen.queryByTestId('log-out-save')).toBeNull();
  });
});
