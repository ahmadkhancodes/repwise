/* eslint-disable @typescript-eslint/no-require-imports */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { resetDbForTests } from '@/db/client';
import { getProfile } from '@/features/settings/repo';
import { resetAnalyticsForTests, trackedEvents } from '@/services/analytics';
import { kv } from '@/services/storage';

import { fullAnswers } from '../__fixtures__/answers';
import { EMPTY_ANSWERS } from '../logic/answers';
import { ONBOARDING_STORAGE_KEY, useOnboarding } from '../store';

const routes = {
  _layout: require('../../../../app/_layout').default,
  index: require('../../../../app/index').default,
  '(tabs)/_layout': require('../../../../app/(tabs)/_layout').default,
  '(tabs)/today': require('../../../../app/(tabs)/today').default,
  '(onboarding)/_layout': require('../../../../app/(onboarding)/_layout').default,
  '(onboarding)/welcome': require('../../../../app/(onboarding)/welcome').default,
  '(onboarding)/q/[step]': require('../../../../app/(onboarding)/q/[step]').default,
  '(onboarding)/notify': require('../../../../app/(onboarding)/notify').default,
  '(onboarding)/plan': require('../../../../app/(onboarding)/plan').default,
  paywall: require('../../../../app/paywall').default,
};

jest.mock('@expo-google-fonts/inter', () => ({
  useFonts: () => [true, null],
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}));

const events = (name: string) => trackedEvents().filter((e) => e.event === name);

beforeEach(() => {
  const notif = require('expo-notifications') as { __state: { reset(): void; permission: object } };
  notif.__state.reset();
  notif.__state.permission = { granted: false, status: 'undetermined', canAskAgain: true };
  resetDbForTests();
  resetAnalyticsForTests();
  useOnboarding.getState().reset();
});

describe('onboarding flow (F1)', () => {
  it('a fresh install opens Welcome; Get started opens the first question', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-welcome')).toBeTruthy();
    expect(screen.getByText('No account needed. Your data stays on this phone.')).toBeTruthy();
    expect(events('onboarding_step')[0]?.props).toEqual({ step: 'welcome', index: 0 });
    await fireEvent.press(screen.getByTestId('welcome-start'));
    expect(await screen.findByTestId('screen-quiz-goal')).toBeTruthy();
    expect(useOnboarding.getState()).toMatchObject({ phase: 'quiz', step: 'goal' });
    expect(useOnboarding.getState().startedAt).not.toBeNull();
  });

  it('a single-choice tile advances by itself; Back returns', async () => {
    useOnboarding.getState().start();
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-quiz-goal')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('option-muscle_gain'));
    expect(await screen.findByTestId('screen-quiz-about')).toBeTruthy();
    expect(useOnboarding.getState().answers.goal).toBe('muscle_gain');
    expect(events('onboarding_step').map((e) => e.props.step)).toEqual(['goal', 'about']);
    await fireEvent.press(screen.getAllByTestId('quiz-back').at(-1)!);
    await waitFor(() => expect(useOnboarding.getState().step).toBe('goal'));
  });

  it('validation blocks Continue with a readable message', async () => {
    {
      useOnboarding.getState().setAnswers(fullAnswers());
      useOnboarding.getState().setStep('days');
    }
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-quiz-days')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('weekday-1'));
    await fireEvent.press(screen.getByTestId('quiz-next'));
    expect((await screen.findByTestId('quiz-error')).props.children).toBe(
      'Pick 3 days (2 selected).',
    );
    expect(useOnboarding.getState().step).toBe('days');
  });

  it('optional steps can be skipped', async () => {
    {
      useOnboarding.getState().setAnswers(fullAnswers());
      useOnboarding.getState().setStep('cuisines');
    }
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-quiz-cuisines')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('quiz-skip'));
    expect(await screen.findByTestId('screen-quiz-kitchen')).toBeTruthy();
  });

  it('killing the app mid-quiz resumes on the same step with the same answers', async () => {
    useOnboarding.getState().setAnswers({ goal: 'fat_loss', sex: 'female' });
    useOnboarding.getState().setStep('diet');
    // Simulate a cold start: memory is gone, MMKV still holds the progress.
    const saved = kv.getString(ONBOARDING_STORAGE_KEY)!;
    useOnboarding.setState({ step: null, phase: 'welcome', answers: EMPTY_ANSWERS });
    kv.set(ONBOARDING_STORAGE_KEY, saved);
    await useOnboarding.persist.rehydrate();
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-quiz-diet')).toBeTruthy();
    expect(useOnboarding.getState().answers).toMatchObject({ goal: 'fat_loss', sex: 'female' });
  });

  it('opens Home directly once onboarding is done', async () => {
    useOnboarding.getState().complete();
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-today')).toBeTruthy();
  });

  it('quiz → primer → building → reveal → Home, with real data and no account', async () => {
    {
      useOnboarding.getState().start(Date.now() - 90_000);
      useOnboarding.getState().setAnswers(fullAnswers());
      useOnboarding.getState().setStep('meals');
    }
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-quiz-meals')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Build my plan' }));

    // S06: the profile (first real data) is saved before the primer.
    expect(await screen.findByTestId('screen-notify')).toBeTruthy();
    expect(getProfile()).toMatchObject({
      goal: 'fat_loss',
      days: 3,
      sessionMin: 45,
      onboardedAt: null,
    });
    await fireEvent.press(screen.getByTestId('notify-later'));
    expect(events('notification_permission')[0]?.props).toEqual({
      granted: false,
      prompted: false,
    });

    // S07: building with real computation, then the reveal from SQLite.
    expect(await screen.findByTestId('screen-plan-building')).toBeTruthy();
    expect(screen.getByText('Building your plan')).toBeTruthy();
    expect(await screen.findByTestId('screen-plan', {}, { timeout: 8000 })).toBeTruthy();
    expect(events('plan_generated')[0]?.props).toEqual({
      goal: 'fat_loss',
      days: 3,
      diet_type: 'omnivore',
    });
    await waitFor(() => expect(screen.getByTestId('reveal-targets')).toBeTruthy());
    expect(screen.getByTestId('reveal-week')).toBeTruthy();
    expect(screen.getByTestId('reveal-workout')).toBeTruthy();
    expect(screen.getAllByTestId(/^day-\d{4}-/)).toHaveLength(7);

    await fireEvent.press(screen.getByTestId('plan-continue'));
    expect(await screen.findByTestId('screen-today')).toBeTruthy();
    expect(getProfile()?.onboardedAt).toEqual(expect.any(Number));
    expect(useOnboarding.getState().phase).toBe('done');
    expect(events('onboarding_complete')[0]?.props.duration_s).toBeGreaterThanOrEqual(90);
  }, 20_000);

  it('shows a retry state when the plan cannot be built', async () => {
    useOnboarding.getState().setPhase('plan');
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-plan-error')).toBeTruthy();
    expect(screen.getByText("We couldn't build your plan")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('screen-plan-error')).toBeTruthy();
  });
});
