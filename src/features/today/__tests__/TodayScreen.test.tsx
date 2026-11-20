import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { cardsForDate } from '@/features/assistant/repo';
import { markMealEaten } from '@/features/meals';
import { mealPlanForDate, mealsRepo } from '@/features/meals/repo';
import { logsForDate } from '@/features/nutrition/repo';
import { sessionsRepo } from '@/features/workout/repo';
import { setAnalyticsSink } from '@/services/analytics';
import { useBillingStore } from '@/services/billing';
import { loadCatalog } from '@/services/catalog';
import { ToastHost, useToastStore } from '@/ui';

import { resetPlannerForTests } from '../plannerBridge';
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

async function renderToday(now = MORNING, scheme: 'light' | 'dark' = 'light') {
  const r = await renderThemed(
    <>
      <TodayScreen now={now} />
      <ToastHost />
    </>,
    scheme,
  );
  // Let the background week planner (meals ensureWeekMeals, next tick) settle inside act.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return r;
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
    expect(screen.getByTestId('today-macros-kcal-value').props.defaultValue).toBe('2,300');
    expect(screen.getByTestId('kcal-eaten')).toHaveTextContent('0 of 2,300 kcal eaten');
    expect(screen.getByTestId('workout-title')).toHaveTextContent('Leg day');
    expect(screen.getByText('Chicken karahi')).toBeTruthy();
    expect(screen.getByTestId('meals-count')).toHaveTextContent('0 of 2 eaten');
    expect(screen.getByTestId('today-water')).toBeTruthy();
    // Hierarchy: brief → primary action (workout) → meals → rings → water.
    const order = ['today-brief', 'today-workout', 'today-meals', 'today-rings', 'today-water'];
    const json = JSON.stringify(screen.toJSON());
    const at = order.map((id) => json.indexOf(`"testID":"${id}"`));
    expect(at.every((v) => v >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(screen.getByTestId('today-next-meal')).toBeTruthy();
  });
});

describe('TodayScreen core loop', () => {
  it('Start workout opens the Train deep link (starts the session) in one tap', async () => {
    const { session } = seedTrainingDay();
    await renderToday();
    await fireEvent.press(screen.getByTestId('start-workout'));
    expect(router.push).toHaveBeenCalledWith(`/train?sessionId=${session.id}&start=1`);
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
    await fireEvent.press(screen.getByTestId('today-tick-lunch'));
    expect(mealsRepo.get(meals[1]!.id)?.status).toBe('eaten');
    expect(logsForDate(TODAY)).toHaveLength(1);
    await waitFor(() => expect(screen.getByTestId('meals-count')).toHaveTextContent('1 of 2 eaten'));
    expect(screen.getByTestId('today-macros-kcal-value').props.defaultValue).toBe('1,656'); // 2,300 − 644
    expect(screen.getByTestId('today-tick-lunch')).toBeChecked();
    expect(events).toContainEqual(['meal_logged', { slot: 'lunch', from_plan: true, partial: false }]);
    const toast = await screen.findByTestId('toast');
    expect(within(toast).getByText('Chicken karahi logged')).toBeTruthy();
    // One buzz: the tick's success haptic; the undo toast is silent (no double buzz).
    if (Platform.OS === 'ios') expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    else expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('confirm');
    expect(useToastStore.getState().current?.silent).toBe(true);
    expect(useToastStore.getState().current?.durationMs).toBe(5000);
    await fireEvent.press(within(toast).getByRole('button', { name: 'Undo' }));
    expect(mealsRepo.get(meals[1]!.id)?.status).toBe('planned');
    expect(logsForDate(TODAY)).toEqual([]);
    await waitFor(() => expect(screen.getByTestId('meals-count')).toHaveTextContent('0 of 2 eaten'));
  });

  it('tapping an eaten meal tick unticks it; eaten rows offer no swap', async () => {
    const { meals } = seedTrainingDay();
    markMealEaten(meals[0]!.id);
    expect(logsForDate(TODAY)).toHaveLength(1);
    await renderToday();
    expect(screen.getByTestId('today-tick-breakfast')).toBeChecked();
    expect(screen.queryByTestId('today-swap-breakfast')).toBeNull();
    await fireEvent.press(screen.getByTestId('today-tick-breakfast'));
    expect(mealsRepo.get(meals[0]!.id)?.status).toBe('planned');
    expect(logsForDate(TODAY)).toEqual([]);
  });

  it('water quick-add fills a glass', async () => {
    seedTrainingDay();
    await renderToday();
    await fireEvent.press(screen.getByTestId('add-water'));
    await waitFor(() => expect(screen.getByTestId('water-total')).toHaveTextContent('250 ml of 2 L'));
    expect((await screen.findByTestId('toast'))).toBeTruthy();
  });

  it('swap opens the meals swap sheet: engine options, one tap swaps', async () => {
    const { meals } = seedTrainingDay();
    await renderToday();
    await fireEvent.press(screen.getByTestId('today-swap-lunch'));
    const option = await screen.findByTestId('swap-option-0');
    await fireEvent.press(option);
    await waitFor(() => expect(mealsRepo.get(meals[1]!.id)?.recipeId).not.toBe(RECIPE.lunch));
    expect(mealsRepo.get(meals[1]!.id)?.swappedFrom).toBe(RECIPE.lunch);
    expect(events).toContainEqual(['meal_swapped', { slot: 'lunch' }]);
  });

  it('tapping a meal opens its recipe, the same as on Eat (N2)', async () => {
    const { meals } = seedTrainingDay();
    await renderToday();
    await fireEvent.press(screen.getByTestId('today-meal-lunch'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: RECIPE.lunch, portion: '1', mealId: meals[1]!.id },
    });
    expect(mealsRepo.get(meals[1]!.id)?.status).toBe('planned');
  });

  it('long-press a meal opens swap (W4)', async () => {
    seedTrainingDay();
    await renderToday();
    await fireEvent(screen.getByTestId('today-meal-lunch'), 'longPress');
    expect(await screen.findByTestId('swap-option-0')).toBeTruthy();
  });

  it('plans the rest of the week offline with the meals domain', async () => {
    seedTrainingDay();
    await renderToday();
    // Deferred past first paint (PLAN_DELAY_MS) so it never competes with the first taps.
    expect(events.map((e) => e[0])).not.toContain('plan_generated');
    await waitFor(() => expect(events.map((e) => e[0])).toContain('plan_generated'), { timeout: 4000 });
    expect(mealPlanForDate('2026-11-20')).toBeDefined();
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

  it('onboarded without a plan (body fields missing, so meals cannot be planned yet)', async () => {
    seedProfile(Date.UTC(2026, 10, 1), { weightKg: null, heightCm: null });
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
    seedProfile(Date.UTC(2026, 10, 1), { weightKg: null, heightCm: null });
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
    // One card inline; the rest wait behind "1 more suggestion".
    await screen.findByTestId('today-more-cards');
    expect(screen.getAllByTestId(/^card-(protein_low|missed_workout)$/)).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('today-more-cards'));
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
