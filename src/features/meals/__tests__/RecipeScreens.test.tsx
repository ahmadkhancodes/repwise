import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Share } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { getProfile } from '@/features/settings/repo';
import * as catalog from '@/services/catalog';
import { useToastStore } from '@/ui';

import { todayISO } from '../logic/dates';
import { mealPlanForDate, mealsForPlan } from '../repo';
import { COOK_SCREEN_OPTIONS } from '../navigation';
import { CookModeScreen } from '../screens/CookModeScreen';
import { GroceryScreen } from '../screens/GroceryScreen';
import { RecipeScreen } from '../screens/RecipeScreen';
import { TargetsScreen } from '../screens/TargetsScreen';
import { ensureWeekMeals } from '../service';
import { freshDb, lockPro, onboard } from './helpers';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
  Stack: { Screen: jest.fn(() => null) },
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

const params = useLocalSearchParams as jest.Mock;

beforeEach(async () => {
  await freshDb();
  jest.clearAllMocks();
});

describe.each(SCHEMES)('RecipeScreen (%s)', (scheme) => {
  it('renders macros, ingredients and steps', async () => {
    params.mockReturnValue({ id: 'chicken-karahi' });
    await renderThemed(<RecipeScreen />, scheme);
    expect(screen.getByText('Chicken karahi', { exact: true })).toBeTruthy();
    expect(screen.getByTestId('recipe-ingredients')).toBeTruthy();
    expect(screen.getByTestId('recipe-allergens').props.children).toEqual(['Contains: ', 'Milk']);
    expect(screen.getByText(/^Rinse the rice/)).toBeTruthy();
    // Designed hero art (no photo yet): spoken as an image, curry glyph, cuisine + time badges.
    expect(screen.getByLabelText('Curry or stew: Chicken karahi')).toBeTruthy();
    expect(screen.getByTestId('recipe-hero-glyph-pot', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('recipe-meta')).toHaveTextContent(/min prep/);
  });
});

describe('RecipeScreen', () => {
  it('serving scaler rescales ingredient grams and kcal', async () => {
    params.mockReturnValue({ id: 'chicken-karahi', portion: '1' });
    await renderThemed(<RecipeScreen />);
    expect(screen.getByTestId('ing-chicken-thigh').props.children).toBe('200 g');
    await fireEvent.press(screen.getByTestId('servings-inc'));
    await fireEvent.press(screen.getByTestId('servings-inc'));
    expect(screen.getByTestId('ing-chicken-thigh').props.children).toBe('300 g');
    expect(screen.getByLabelText('Servings')).toBeTruthy();
  });

  it('starts cook mode with the chosen servings and meal', async () => {
    params.mockReturnValue({ id: 'chicken-karahi', portion: '1.5', mealId: 'm1' });
    await renderThemed(<RecipeScreen />);
    await fireEvent.press(screen.getByTestId('start-cook'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/cook/[id]',
      params: { id: 'chicken-karahi', servings: '1.5', mealId: 'm1' },
    });
  });

  it('missing and loading states', async () => {
    params.mockReturnValue({ id: 'nope' });
    await renderThemed(<RecipeScreen />);
    expect(screen.getByTestId('recipe-missing')).toBeTruthy();
    const spy = jest.spyOn(catalog, 'useCatalogFor').mockReturnValue(null);
    await renderThemed(<RecipeScreen />);
    expect(screen.getByTestId('recipe-loading')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('CookModeScreen', () => {
  afterEach(() => jest.useRealTimers());

  it('is a pushed full-screen card, never a presentation switched from inside (iOS dead taps)', async () => {
    // Root Stack options: no native modal (it would cover the sheet + toast hosts), no back swipe.
    expect(COOK_SCREEN_OPTIONS).toEqual({ animation: 'slide_from_bottom', gestureEnabled: false });
    expect(COOK_SCREEN_OPTIONS).not.toHaveProperty('presentation');
    params.mockReturnValue({ id: 'chicken-karahi' });
    await renderThemed(<CookModeScreen />);
    expect(Stack.Screen).not.toHaveBeenCalled();
    // Next works and the ingredients sheet opens over the step (it is not hidden behind a modal).
    await fireEvent.press(screen.getByTestId('cook-next'));
    expect(screen.getByTestId('cook-step-count')).toHaveTextContent(/^Step 2 of/);
    await fireEvent.press(screen.getByTestId('cook-ingredients'));
    expect(screen.getByTestId('cook-ingredients-list')).toBeTruthy();
  });

  it('keeps the screen awake and walks through big steps', async () => {
    params.mockReturnValue({ id: 'chicken-karahi', servings: '2' });
    await renderThemed(<CookModeScreen />);
    expect(useKeepAwake).toHaveBeenCalled();
    const n = catalog.getRecipe('chicken-karahi')!.steps.length;
    expect(screen.getByTestId('cook-step-count').props.children).toEqual(['Step ', 1, ' of ', n]);
    await fireEvent.press(screen.getByTestId('cook-next'));
    expect(screen.getByTestId('cook-step-count').props.children).toEqual(['Step ', 2, ' of ', n]);
    await fireEvent.press(screen.getByTestId('cook-prev'));
    expect(screen.getByTestId('cook-step-count').props.children).toEqual(['Step ', 1, ' of ', n]);
  });

  it('runs a step timer to the end with a toast', async () => {
    jest.useFakeTimers({ now: Date.UTC(2026, 10, 19, 12) });
    params.mockReturnValue({ id: 'chicken-karahi' });
    await renderThemed(<CookModeScreen />);
    // Find the first step with a timer.
    const steps = catalog.getRecipe('chicken-karahi')!.steps;
    const idx = steps.findIndex((s) => /\d+\s*min/.test(s));
    for (let i = 0; i < idx; i++) await fireEvent.press(screen.getByTestId('cook-next'));
    expect(screen.getByTestId('cook-timer')).toBeTruthy();
    const start = screen.getByTestId('cook-clock').props.children;
    await fireEvent.press(screen.getByTestId('cook-timer-toggle'));
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('cook-clock').props.children).not.toBe(start);
    await act(async () => {
      jest.advanceTimersByTime(2 * 3600_000);
    });
    await waitFor(() => expect(useToastStore.getState().current?.message).toMatch(/timer is done/));
    expect(screen.getByTestId('cook-clock').props.children).toBe('00:00');
  });

  it('finishing from a planned meal logs it (Ate it)', async () => {
    onboard();
    ensureWeekMeals(todayISO());
    const meal = mealsForPlan(mealPlanForDate(todayISO())!.id)[0]!;
    params.mockReturnValue({ id: meal.recipeId!, mealId: meal.id });
    await renderThemed(<CookModeScreen />);
    const n = catalog.getRecipe(meal.recipeId!)!.steps.length;
    for (let i = 0; i < n - 1; i++) await fireEvent.press(screen.getByTestId('cook-next'));
    await fireEvent.press(screen.getByTestId('cook-done'));
    expect(mealsForPlan(meal.mealPlanId).find((m) => m.id === meal.id)!.status).toBe('eaten');
    expect(router.back).toHaveBeenCalled();
  });
});

describe('GroceryScreen', () => {
  it.each(SCHEMES)('builds the week list by aisle, ticks and shares (%s)', async (scheme) => {
    onboard();
    ensureWeekMeals(todayISO());
    params.mockReturnValue({});
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await renderThemed(<GroceryScreen />, scheme);
    expect(await screen.findByTestId('grocery-left')).toBeTruthy();
    const firstRow = screen.getAllByRole('checkbox')[0]!;
    expect(firstRow).not.toBeChecked();
    await fireEvent.press(firstRow);
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
    await fireEvent.press(screen.getByTestId('grocery-share'));
    expect(share).toHaveBeenCalledWith({ message: expect.stringMatching(/^Repwise grocery list/) });
    await fireEvent.press(screen.getByTestId('grocery-clear'));
    expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
    share.mockRestore();
  });

  it('empty without a plan, locked without Pro', async () => {
    params.mockReturnValue({});
    await renderThemed(<GroceryScreen />);
    expect(await screen.findByTestId('grocery-empty')).toBeTruthy();
    lockPro();
    await renderThemed(<GroceryScreen />);
    expect(screen.getByTestId('grocery-locked')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'See Pro' }));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
  });
});

describe('TargetsScreen', () => {
  it.each(SCHEMES)('shows engine targets by day type (%s)', async (scheme) => {
    onboard({ days: 4 });
    params.mockReturnValue({});
    await renderThemed(<TargetsScreen />, scheme);
    expect(screen.getByTestId('targets-protein')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Rest day' }));
    expect(screen.getByText('Rest days')).toBeTruthy();
  });

  it('edit saves goal + activity and re-plans', async () => {
    onboard();
    ensureWeekMeals(todayISO());
    params.mockReturnValue({});
    await renderThemed(<TargetsScreen />);
    await fireEvent.press(screen.getByTestId('targets-edit'));
    await fireEvent.press(screen.getByTestId('goal-muscle_gain'));
    await fireEvent.press(screen.getByTestId('activity-active'));
    await fireEvent.press(screen.getByTestId('targets-save'));
    expect(getProfile()).toMatchObject({ goal: 'muscle_gain', activityLevel: 'active' });
    expect(useToastStore.getState().current?.message).toMatch(/^Targets updated/);
  });

  it('empty without a profile', async () => {
    params.mockReturnValue({});
    await renderThemed(<TargetsScreen />);
    expect(screen.getByTestId('targets-empty')).toBeTruthy();
  });
});
