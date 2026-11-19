import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { saveProfile } from '@/features/settings/repo';
import { resetAnalyticsForTests, trackedEvents } from '@/services/analytics';
import { useBillingStore } from '@/services/billing';

import { fullAnswers } from '../__fixtures__/answers';
import { saveQuiz } from '../actions';
import { NotifyScreen } from '../screens/NotifyScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { useOnboarding } from '../store';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    get router() {
      return mockRouter;
    },
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});

/** A clock that runs 1 s per call, so the build sequence finishes in a few intervals. */
function fastClock() {
  let now = Date.now();
  return () => (now += 1000);
}

// In-memory expo-notifications double (jest.setup.ts); the primer starts "undetermined".
// eslint-disable-next-line @typescript-eslint/no-require-imports
const notif = require('expo-notifications') as {
  __state: { reset(): void; permission: object; requestResult: object };
  requestPermissionsAsync: () => Promise<unknown>;
};

beforeEach(async () => {
  jest.clearAllMocks();
  notif.__state.reset();
  notif.__state.permission = { granted: false, status: 'undetermined', canAskAgain: true };
  resetDbForTests();
  await migrateDb();
  resetAnalyticsForTests();
  useOnboarding.getState().reset();
  useBillingStore.setState({ paymentsEnabled: false });
});

describe.each(SCHEMES)('onboarding screens (%s)', (scheme) => {
  it('Welcome: carousel, start and restore', async () => {
    await renderThemed(<WelcomeScreen />, scheme);
    expect(screen.getByTestId('welcome-slide-0')).toBeTruthy();
    expect(screen.getByLabelText('Page 1 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('welcome-restore'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/account');
    await fireEvent.press(screen.getByTestId('welcome-start'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/q/[step]',
      params: { step: 'goal' },
    });
  });

  it('Quiz: tiles are radios with state; progress shows the step', async () => {
    await renderThemed(<QuizScreen step="goal" />, scheme);
    expect(screen.getByText('What do you want to achieve?')).toBeTruthy();
    expect(screen.getByLabelText('Quiz progress').props.accessibilityValue).toMatchObject({
      now: 1,
      max: 15,
    });
    await fireEvent.press(screen.getByTestId('option-fat_loss'));
    expect(screen.getByTestId('option-fat_loss').props.accessibilityState).toMatchObject({
      selected: true,
    });
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/q/[step]',
        params: { step: 'about' },
      }),
    );
  });

  it('Notify: explains reminders before any prompt', async () => {
    await renderThemed(<NotifyScreen />, scheme);
    expect(screen.getByText('Never miss a meal or a session')).toBeTruthy();
    expect(screen.getByTestId('notify-allow')).toBeTruthy();
  });

  it('Plan: build sequence, then the reveal from the saved plan', async () => {
    saveQuiz(fullAnswers());
    await renderThemed(<PlanScreen clock={fastClock()} />, scheme);
    expect(screen.getByTestId('screen-plan-building')).toBeTruthy();
    expect(await screen.findByTestId('screen-plan', {}, { timeout: 5000 })).toBeTruthy();
    expect(await screen.findByTestId('reveal-targets')).toBeTruthy();
    expect(screen.getByTestId('reveal-goal-line').props.children).toMatch(
      /^64 kg by \d+ \w{3} \d{4}/,
    );
    expect(screen.getAllByTestId(/^reveal-day-/)).toHaveLength(7);
    expect(screen.getByTestId('reveal-meals')).toBeTruthy();
  });
});

describe('quiz steps render their controls', () => {
  it.each([
    ['about', 'wheel-birth-year'],
    ['body', 'wheel-height'],
    ['target', 'wheel-target'],
    ['days', 'weekday'],
    ['equipment', 'equipment'],
    ['injuries', 'injuries'],
    ['avoid', 'allergies'],
    ['cuisines', 'cuisines'],
    ['kitchen', 'budget'],
    ['meals', 'meal-time-0'],
  ] as const)('%s', async (step, testID) => {
    useOnboarding.getState().setAnswers(fullAnswers());
    await renderThemed(<QuizScreen step={step} />);
    expect(screen.getByTestId(testID)).toBeTruthy();
  });

  it('imperial units relabel the body wheels', async () => {
    useOnboarding.getState().setAnswers(fullAnswers({ units: 'imperial' }));
    await renderThemed(<QuizScreen step="body" />);
    expect(screen.getByTestId('wheel-weight').props.accessibilityValue.text).toBe('154 lb');
    await fireEvent.press(screen.getByRole('tab', { name: 'cm · kg' }));
    expect(useOnboarding.getState().answers.units).toBe('metric');
  });

  it('the last step saves the profile and opens the primer', async () => {
    useOnboarding.getState().setAnswers(fullAnswers());
    await renderThemed(<QuizScreen step="meals" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Build my plan' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/notify');
    expect(useOnboarding.getState().phase).toBe('notify');
  });

  it('meal time steppers keep meals in order', async () => {
    useOnboarding.getState().setAnswers(fullAnswers());
    await renderThemed(<QuizScreen step="meals" />);
    await fireEvent.press(screen.getByLabelText('Decrease Lunch time'));
    expect(useOnboarding.getState().answers.mealTimes).toEqual(['08:00', '12:45', '19:00']);
  });
});

describe('notification primer', () => {
  it('asks only after "Turn on reminders" and records the answer', async () => {
    notif.__state.requestResult = { granted: true, status: 'granted', canAskAgain: true };
    const request = jest.spyOn(notif, 'requestPermissionsAsync');
    await renderThemed(<NotifyScreen />);
    expect(request).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('notify-allow'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/plan'));
    expect(request).toHaveBeenCalledTimes(1);
    const ev = trackedEvents().find((e) => e.event === 'notification_permission');
    expect(ev?.props.granted).toBe(true);
    expect(useOnboarding.getState().phase).toBe('plan');
  });

  it('skips the primer when reminders are already on', async () => {
    notif.__state.permission = { granted: true, status: 'granted', canAskAgain: true };
    await renderThemed(<NotifyScreen />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/plan'));
  });
});

describe('plan screen', () => {
  it('Start my plan finishes onboarding and opens the paywall when payments are on', async () => {
    useBillingStore.setState({ paymentsEnabled: true });
    saveProfile({ ...fullProfile() });
    await renderThemed(<PlanScreen clock={fastClock()} />);
    await fireEvent.press(await screen.findByTestId('plan-continue', {}, { timeout: 5000 }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/today');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/paywall',
      params: { source: 'onboarding' },
    });
    expect(useOnboarding.getState().phase).toBe('done');
  });

  it('a general plan shows a calm note instead of a goal date', async () => {
    saveQuiz(fullAnswers({ birthYear: 2012 }));
    await renderThemed(<PlanScreen clock={fastClock()} />);
    expect(await screen.findByTestId('reveal-general-plan', {}, { timeout: 5000 })).toBeTruthy();
  });
});

function fullProfile() {
  return {
    goal: 'muscle_gain',
    sex: 'male',
    birthYear: 1990,
    heightCm: 180,
    weightKg: 80,
    targetKg: 84,
    experience: 'intermediate',
    days: 4,
    sessionMin: 60,
    equipment: ['barbell', 'dumbbell', 'bench', 'cable', 'machine', 'squat_rack', 'bodyweight'],
    dietType: 'halal',
    mealsPerDay: 4,
    budget: '2',
    cookMin: 30,
    units: 'metric',
  };
}
