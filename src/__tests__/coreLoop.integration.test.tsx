/**
 * Cross-feature smoke test of the core loop, on the real SQLite test database:
 * onboarding → plan → Today (meals + workout) → tick a meal → Start workout (deep link) →
 * log a set → finish → Progress and records update.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderThemed } from '../../test/render';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { mealPlanForDate, mealsForPlan } from '@/features/meals/repo';
import { completeOnboarding, deviceContext, saveQuiz } from '@/features/onboarding/actions';
import { fullAnswers } from '@/features/onboarding/__fixtures__/answers';
import { generateInitialPlan, localToday } from '@/features/planner';
import { ProgressScreen } from '@/features/progress/screens/ProgressScreen';
import { TodayScreen } from '@/features/today/screens/TodayScreen';
import { exercisesForSession, getSession, sessionsForDate, setsFor } from '@/features/workout/repo';
import { resetRestTimerForTests } from '@/features/workout/restTimerStore';
import { TrainScreen } from '@/features/workout/screens/TrainScreen';
import { WorkoutPlayerScreen } from '@/features/workout/screens/WorkoutPlayerScreen';
import { computeRecords } from '@/features/library/logic/records';
import { exerciseHistory } from '@/features/library/repo';
import { useBillingStore } from '@/services/billing';
import { loadCatalog } from '@/services/catalog';
import { ToastHost, useToastStore } from '@/ui';

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/features/notifications/restTimer', () => ({ updateRestTimerSurface: jest.fn(async () => undefined) }));

// Thursday 19 Nov 2026, 09:00 local: a training day for the Tue/Thu/Sat quiz answers.
const NOW = new Date(2026, 10, 19, 9, 0, 0).getTime();
const TODAY = localToday(NOW);

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeAll(async () => {
  // Only the clock is fixed; timers stay real so live queries and effects run normally.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  await loadCatalog();
});
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  resetRestTimerForTests();
  useToastStore.setState({ current: null });
  useBillingStore.setState({ paymentsEnabled: false, entitlement: null });
  mockParams.current = {};
  jest.clearAllMocks();
});

// A long end-to-end flow: give it room on a loaded CI machine.
jest.setTimeout(30_000);

it('core loop: onboard → Today → tick meal → start workout → log set → finish → progress', async () => {
  // 1. Onboarding: the quiz is saved, the real planner builds the week, onboarding completes.
  saveQuiz(fullAnswers(), deviceContext(NOW));
  await generateInitialPlan({ now: NOW, ai: false });
  completeOnboarding(NOW);
  const session = sessionsForDate(TODAY)[0]!;
  expect(session.status).toBe('planned');
  const plannedMeals = mealsForPlan(mealPlanForDate(TODAY)!.id);
  expect(plannedMeals.length).toBe(3);

  // 2. Today shows the workout and the meals.
  const today = await renderThemed(
    <>
      <TodayScreen now={NOW} />
      <ToastHost />
    </>,
  );
  await flush();
  expect(await screen.findByTestId('screen-today')).toBeTruthy();
  expect(screen.getByTestId('workout-title')).toHaveTextContent(session.title ?? '');
  expect(screen.getByTestId('meals-count')).toHaveTextContent('0 of 3 eaten');

  // 3. Tick a meal (core action, 1 tap).
  const slot = plannedMeals[0]!.slot;
  await fireEvent.press(screen.getByTestId(`today-tick-${slot}`));
  await waitFor(() => expect(screen.getByTestId('meals-count')).toHaveTextContent('1 of 3 eaten'));
  expect(mealsForPlan(mealPlanForDate(TODAY)!.id).find((m) => m.slot === slot)?.status).toBe('eaten');

  // 4. Start workout: Today hands over to the Train deep link, which starts the session.
  await fireEvent.press(screen.getByTestId('start-workout'));
  const link = `/train?sessionId=${session.id}&start=1`;
  expect(router.push).toHaveBeenCalledWith(link);
  await today.unmount();

  mockParams.current = { sessionId: session.id, start: '1' };
  const train = await renderThemed(<TrainScreen />);
  await waitFor(() => expect(getSession(session.id)?.status).toBe('active'));
  expect(router.push).toHaveBeenCalledWith(`/workout/${session.id}`);
  await train.unmount();
  mockParams.current = {};

  // 5. Log the first set in the player (1 tap), then finish.
  const player = await renderThemed(
    <>
      <WorkoutPlayerScreen sessionId={session.id} />
      <ToastHost />
    </>,
  );
  expect(await screen.findByTestId('screen-workout')).toBeTruthy();
  const first = exercisesForSession(session.id)[0]!;
  // Values go through the gym set editor (steppers, tap the number to type), then one tap logs.
  await fireEvent.press(screen.getByTestId('exercise-0-set-0-weight'));
  await fireEvent.press(screen.getByTestId('set-editor-weight-value'));
  await fireEvent.changeText(screen.getByTestId('set-editor-weight-input'), '40');
  await fireEvent(screen.getByTestId('set-editor-weight-input'), 'submitEditing');
  await fireEvent.press(screen.getByTestId('set-editor-reps-value'));
  await fireEvent.changeText(screen.getByTestId('set-editor-reps-input'), '10');
  await fireEvent(screen.getByTestId('set-editor-reps-input'), 'submitEditing');
  await fireEvent.press(screen.getByTestId('set-editor-log'));
  await waitFor(() => expect(setsFor(first.id)[0]?.doneAt).not.toBeNull());

  await fireEvent.press(screen.getByTestId('player-finish'));
  // The other planned sets are unticked: the player asks before finishing.
  await fireEvent.press(screen.getByTestId('finish-confirm'));
  await waitFor(() => expect(getSession(session.id)?.status).toBe('done'));
  await player.unmount();

  // 6. Progress and records update from the same rows.
  await renderThemed(<ProgressScreen />);
  await flush();
  expect(await screen.findByTestId('stat-week')).toHaveTextContent(/1 workouts/);
  expect(screen.getByTestId('stat-volume')).toHaveTextContent(/400/); // 40 kg × 10
  const records = computeRecords(exerciseHistory(first.exerciseId));
  expect(records.heaviest).toMatchObject({ weightKg: 40, reps: 10, date: TODAY });
  expect(records.e1rm?.value).toBeGreaterThan(40);
}, 30_000); // full planner + DB run; generous under parallel CI load
