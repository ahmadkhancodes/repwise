import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { cardsForDate } from '@/features/assistant/repo';
import { mealsRepo } from '@/features/meals/repo';
import { logsForDate } from '@/features/nutrition/repo';
import { sessionsRepo } from '@/features/workout/repo';
import { setAnalyticsSink } from '@/services/analytics';
import { useBillingStore } from '@/services/billing';
import { loadCatalog } from '@/services/catalog';
import { ToastHost, useToastStore } from '@/ui';

import { registerPlanner, resetPlannerForTests } from '../plannerBridge';
import * as todayRepo from '../repo';
import { TodayScreen } from '../screens/TodayScreen';
import {
  RECIPE,
  at,
  freshDb,
  seedMealDay,
  seedProfile,
  seedSession,
  seedTrainingPlan,
} from '../testing/seed';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const TODAY = '2026-11-19';
const MORNING = at(2026, 11, 19, 9);
const EVENING = at(2026, 11, 19, 19);
const events: [string, Record<string, unknown>][] = [];

beforeAll(async () => {
  await loadCatalog(); // the offline catalogue (recipe names) is warm, as after app start
});

beforeEach(async () => {
  await freshDb();
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  resetPlannerForTests();
  useToastStore.setState({ current: null });
  useBillingStore.setState({ paymentsEnabled: false });
  events.length = 0;
  setAnalyticsSink((e, p) => events.push([e, p]));
});

afterAll(() => setAnalyticsSink(null));

function renderToday(now = MORNING, scheme: 'light' | 'dark' = 'light') {
  return renderThemed(
    <>
      <TodayScreen now={now} />
      <ToastHost />
    </>,
    scheme,
  );
}

function seedTrainingDay() {
  seedProfile();
  seedTrainingPlan();
  const session = seedSession(TODAY, { title: 'Leg day' });
  const day = seedMealDay(TODAY);
  return { session, ...day };
}

describe.each(SCHEMES)('TodayScreen (%s)', (scheme) => {
  it('before onboarding: calm empty state that opens onboarding', async () => {
    await renderToday(MORNING, scheme);
    expect(await screen.findByTestId('today-onboard')).toBeTruthy();
    expect(screen.getByText('Let’s build your plan')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('today-onboard-action'));
    expect(router.push).toHaveBeenCalledWith('/(onboarding)/welcome');
  });

  it('training day: brief, rings, workout and meals from SQLite', async () => {
    seedTrainingDay();
    await renderToday(MORNING, scheme);
    expect(screen.getByText('Good morning, Sam')).toBeTruthy();
    expect(screen.getByTestId('today-date')).toHaveTextContent('Thursday 19 November');
    const brief = screen.getByTestId('today-brief');
    expect(within(brief).getByText('Leg day')).toBeTruthy();
    expect(within(brief).getByText('Masala omelette with wholewheat paratha')).toBeTruthy();
    expect(screen.getByTestId('today-rings')).toBeTruthy();
    expect(screen.getByTestId('kcal-left')).toHaveTextContent('2,300');
    expect(screen.getByTestId('workout-title')).toHaveTextContent('Leg day');
    expect(screen.getByText('Chicken karahi')).toBeTruthy();
    expect(screen.getByTestId('meals-count')).toHaveTextContent('0 of 2 eaten');
    expect(screen.getByTestId('today-water')).toBeTruthy();
  });
});

describe('TodayScreen core loop', () => {
  it('Start workout opens the workout route in one tap', async () => {
    const { session } = seedTrainingDay();
    await renderToday();
    await fireEvent.press(screen.getByTestId('start-workout'));
    expect(router.push).toHaveBeenCalledWith(`/workout/${session.id}`);
  });

  it('resume label while a session is in progress; done state after', async () => {
    const { session } = seedTrainingDay();
    sessionsRepo.update(session.id, { status: 'active' });
    await renderToday();
    expect(screen.getByRole('button', { name: 'Resume workout' })).toBeTruthy();
    await act(async () => {
      sessionsRepo.update(session.id, { status: 'done' });
    });
    await waitFor(() => expect(screen.getByText('Done. Great work.')).toBeTruthy());
    expect(screen.queryByTestId('start-workout')).toBeNull();
  });

  it('tick a meal: logs it, rings update instantly, success haptic, undo within 5 s', async () => {
    const { meals } = seedTrainingDay();
    await renderToday();
    await fireEvent.press(screen.getByTestId('today-meal-lunch'));
    expect(mealsRepo.get(meals[1]!.id)?.status).toBe('eaten');
    expect(logsForDate(TODAY)).toHaveLength(1);
    await waitFor(() => expect(screen.getByTestId('meals-count')).toHaveTextContent('1 of 2 eaten'));
    expect(screen.getByTestId('kcal-left')).toHaveTextContent('1,656'); // 2,300 − 644
    expect(screen.getByTestId('today-meal-lunch')).toBeChecked();
    expect(events).toContainEqual(['meal_logged', { slot: 'lunch', from_plan: true }]);
    const toast = await screen.findByTestId('toast');
    expect(within(toast).getByText('Lunch logged')).toBeTruthy();
    if (Platform.OS === 'ios') expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    else expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('confirm');
    expect(useToastStore.getState().current?.durationMs).toBe(5000);
    await fireEvent.press(within(toast).getByRole('button', { name: 'Undo' }));
    expect(mealsRepo.get(meals[1]!.id)?.status).toBe('planned');
    expect(logsForDate(TODAY)).toEqual([]);
    await waitFor(() => expect(screen.getByTestId('meals-count')).toHaveTextContent('0 of 2 eaten'));
  });

  it('tapping an eaten meal unticks it', async () => {
    const { meals } = seedTrainingDay();
    todayRepo.tickMeal(meals[0]!, TODAY, 'Masala omelette with wholewheat paratha', { kcal: 468, p: 24, c: 49, f: 21 });
    await renderToday();
    expect(screen.getByTestId('today-meal-breakfast')).toBeChecked();
    await fireEvent.press(screen.getByTestId('today-meal-breakfast'));
    expect(mealsRepo.get(meals[0]!.id)?.status).toBe('planned');
    expect(logsForDate(TODAY)).toEqual([]);
  });

  it('water quick-add fills a glass', async () => {
    seedTrainingDay();
    await renderToday();
    await fireEvent.press(screen.getByTestId('add-water'));
    await waitFor(() => expect(screen.getByTestId('water-total')).toHaveTextContent('250 / 2,000 ml'));
    expect((await screen.findByTestId('toast'))).toBeTruthy();
  });

  it('swap without a planner explains; with a planner shows options and swaps', async () => {
    const { meals } = seedTrainingDay();
    await renderToday();
    await fireEvent.press(screen.getByTestId('today-swap-lunch'));
    expect(await screen.findByTestId('swap-unavailable')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('swap-sheet-close'));

    const swapOptions = jest.fn(async () => [{ recipeId: RECIPE.breakfast, portion: 1 }]);
    registerPlanner({ swapOptions });
    await fireEvent.press(screen.getByTestId('today-swap-lunch'));
    const option = await screen.findByTestId('swap-option-0');
    expect(swapOptions).toHaveBeenCalledWith(meals[1]!.id);
    await fireEvent.press(option);
    expect(mealsRepo.get(meals[1]!.id)).toMatchObject({ recipeId: RECIPE.breakfast, swappedFrom: RECIPE.lunch });
    expect(events).toContainEqual(['meal_swapped', { slot: 'lunch' }]);
  });

  it('long-press a meal opens swap (W4)', async () => {
    seedTrainingDay();
    await renderToday();
    await fireEvent(screen.getByTestId('today-meal-lunch'), 'longPress');
    expect(await screen.findByTestId('swap-unavailable')).toBeTruthy();
  });

  it('swap errors keep the meal', async () => {
    seedTrainingDay();
    registerPlanner({ swapOptions: async () => Promise.reject(new Error('offline')) });
    await renderToday();
    await fireEvent.press(screen.getByTestId('today-swap-breakfast'));
    expect(await screen.findByTestId('swap-error')).toBeTruthy();
  });
});

describe('TodayScreen states', () => {
  it('rest day', async () => {
    seedProfile();
    seedTrainingPlan();
    seedMealDay(TODAY, { dayType: 'rest' });
    await renderToday();
    expect(screen.getByTestId('today-rest')).toBeTruthy();
    expect(screen.queryByTestId('start-workout')).toBeNull();
    expect(within(screen.getByTestId('today-brief')).getByText('Rest day')).toBeTruthy();
  });

  it('onboarded without a plan', async () => {
    seedProfile();
    await renderToday();
    expect(screen.getByTestId('today-no-plan')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('today-no-plan-action'));
    expect(router.push).toHaveBeenCalledWith('/train');
  });

  it('error state with retry', async () => {
    const spy = jest.spyOn(todayRepo, 'loadTodaySnapshot').mockImplementation(() => {
      throw new Error('disk');
    });
    await renderToday();
    expect(screen.getByTestId('today-error')).toBeTruthy();
    spy.mockRestore();
    seedProfile();
    await fireEvent.press(screen.getByTestId('today-error-action'));
    await waitFor(() => expect(screen.getByTestId('today-no-plan')).toBeTruthy());
  });

  it('evening: progress and tomorrow preview replace the brief', async () => {
    seedTrainingDay();
    seedSession('2026-11-20', { title: 'Upper body' });
    await renderToday(EVENING);
    expect(screen.getByText('Good evening, Sam')).toBeTruthy();
    expect(screen.getByTestId('today-evening')).toBeTruthy();
    expect(screen.queryByTestId('today-brief')).toBeNull();
    expect(within(screen.getByTestId('today-tomorrow')).getByText('Upper body')).toBeTruthy();
    expect(screen.getByTestId('evening-meals')).toHaveTextContent('0 of 2 meals eaten');
  });
});

describe('TodayScreen assistant cards', () => {
  it('missed workout card: apply moves the session to today', async () => {
    seedProfile();
    seedTrainingPlan();
    seedMealDay(TODAY, { dayType: 'rest' });
    const missed = seedSession('2026-11-18', { title: 'Push day' });
    await renderToday();
    const card = await screen.findByTestId('card-missed_workout');
    expect(within(card).getByText("Missed Wednesday's Push day")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('card-missed_workout-action'));
    expect(sessionsRepo.get(missed.id)?.date).toBe(TODAY);
    expect(events).toContainEqual(['assistant_card', { rule: 'missed_workout', action: 'reschedule' }]);
    await waitFor(() => expect(screen.getByTestId('start-workout')).toBeTruthy());
    expect(cardsForDate(TODAY)[0]?.state).toBe('applied');
  });

  it('free users see one card; Pro sees all; dismiss hides it', async () => {
    seedProfile();
    seedTrainingPlan();
    seedMealDay(TODAY);
    seedSession('2026-11-18', { title: 'Push day' });
    useBillingStore.setState({ paymentsEnabled: true, entitlement: null });
    await renderToday(EVENING);
    expect(await screen.findByTestId('card-missed_workout')).toBeTruthy();
    expect(screen.queryByTestId('card-protein_low')).toBeNull();
    await fireEvent.press(screen.getByTestId('card-missed_workout-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('card-missed_workout')).toBeNull());
    expect(screen.queryByTestId('card-protein_low')).toBeNull(); // one a day, not replaced
  });

  it('Pro: every card, detail sheet (S12) with Later and Dismiss', async () => {
    seedProfile();
    seedTrainingPlan();
    seedMealDay(TODAY);
    seedSession('2026-11-18', { title: 'Push day' });
    await renderToday(EVENING);
    expect(await screen.findByTestId('card-protein_low')).toBeTruthy();
    expect(screen.getByTestId('card-missed_workout')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('card-protein_low'));
    expect(screen.getByTestId('card-detail-text')).toHaveTextContent(/of your 160 g protein target/);
    await fireEvent.press(screen.getByTestId('card-detail-later'));
    await waitFor(() => expect(screen.queryByTestId('card-protein_low')).toBeNull());
    expect(cardsForDate(TODAY).find((c) => c.ruleId === 'protein_low')?.state).toMatch(/^snoozed:/);
    await fireEvent.press(screen.getByTestId('card-missed_workout'));
    await fireEvent.press(screen.getByTestId('card-detail-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('card-missed_workout')).toBeNull());
  });

  it('protein card opens Eat; deep link opens a card sheet', async () => {
    seedProfile();
    seedTrainingPlan();
    seedMealDay(TODAY);
    await renderToday(EVENING);
    await fireEvent.press(await screen.findByTestId('card-protein_low-action'));
    expect(router.push).toHaveBeenCalledWith('/eat');
  });

  it('deep link /today?card=<id> opens the detail sheet', async () => {
    seedProfile();
    seedTrainingPlan();
    seedMealDay(TODAY);
    const first = await renderToday(EVENING);
    await screen.findByTestId('card-protein_low');
    const id = cardsForDate(TODAY)[0]!.id;
    await first.unmount();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ card: id });
    await renderToday(EVENING);
    expect(await screen.findByTestId('card-detail-text')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('card-detail-apply'));
    expect(router.setParams).toHaveBeenCalledWith({ card: undefined });
    expect(router.push).toHaveBeenCalledWith('/eat');
  });
});

describe('TodayScreen deep links', () => {
  it('/today?checkin=1 opens the weekly check-in once', async () => {
    seedProfile();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ checkin: '1' });
    await renderToday();
    expect(router.push).toHaveBeenCalledWith('/checkin');
    expect(router.setParams).toHaveBeenCalledWith({ checkin: undefined });
  });
});
