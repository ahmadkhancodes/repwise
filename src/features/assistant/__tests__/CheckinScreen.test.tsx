import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler, Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { bodyMetricsRepo } from '@/features/progress/repo';
import { registerPlanner, resetPlannerForTests } from '@/features/today/plannerBridge';
import { at, freshDb, seedMealDay, seedProfile, seedSession, seedWeight } from '@/features/today/testing/seed';
import { setAnalyticsSink } from '@/services/analytics';
import { useBillingStore } from '@/services/billing';

import { latestCheckin, setDeloadRequested } from '../repo';
import { CheckinScreen } from '../screens/CheckinScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const SUNDAY = at(2026, 11, 22, 10);
const events: [string, Record<string, unknown>][] = [];

beforeEach(async () => {
  await freshDb();
  jest.clearAllMocks();
  resetPlannerForTests();
  setDeloadRequested(null);
  useBillingStore.setState({ paymentsEnabled: false });
  events.length = 0;
  setAnalyticsSink((e, p) => events.push([e, p]));
});

/** Two weeks of flat weigh-ins at 82 kg, a 2,300 kcal plan, 3 of 4 workouts done. */
function seedWeek() {
  seedProfile();
  for (let i = 1; i <= 13; i++) {
    const d = new Date(Date.UTC(2026, 10, 22 - i)).toISOString().slice(0, 10);
    seedWeight(d, 82);
  }
  seedMealDay('2026-11-21', { kcal: 2300 });
  ['2026-11-16', '2026-11-18', '2026-11-20'].forEach((d) => seedSession(d, { status: 'done' }));
  seedSession('2026-11-21');
}

async function walkToAdjust() {
  await fireEvent.press(screen.getByTestId('checkin-next'));
  await fireEvent.press(screen.getByTestId('energy-ok'));
  await fireEvent.press(screen.getByTestId('sleep-good'));
  await fireEvent.press(screen.getByTestId('checkin-next'));
  expect(screen.getByTestId('checkin-step-week')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('checkin-next'));
  expect(screen.getByTestId('checkin-step-adjust')).toBeTruthy();
}

describe.each(SCHEMES)('CheckinScreen (%s)', (scheme) => {
  it('weigh-in → feel → week → adjustments, approve saves and regenerates', async () => {
    seedWeek();
    const regenerateWeek = jest.fn(async () => undefined);
    registerPlanner({ regenerateWeek });
    await renderThemed(<CheckinScreen now={SUNDAY} />, scheme);

    // Step 1: prefilled with the latest weight; − nudges by 0.1 kg.
    expect(screen.getByTestId('checkin-step-weigh')).toBeTruthy();
    expect(screen.getByTestId('checkin-weight-value')).toHaveTextContent('82.0');
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease Weight' }));
    expect(screen.getByTestId('checkin-weight-value')).toHaveTextContent('81.9');

    // Step 2: next is disabled until energy and sleep are chosen (1 tap each).
    await fireEvent.press(screen.getByTestId('checkin-next'));
    expect(screen.getByTestId('checkin-next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('energy-ok'));
    await fireEvent.press(screen.getByTestId('sleep-good'));
    expect(screen.getByTestId('energy-ok')).toBeChecked();
    await fireEvent.press(screen.getByTestId('checkin-next'));

    // Step 3: trend + adherence + summary.
    expect(screen.getByTestId('checkin-trend-change')).toHaveTextContent(/vs last week/);
    expect(screen.getByTestId('checkin-workouts')).toHaveTextContent(/75%Workouts 3\/4/);
    expect(screen.getByTestId('checkin-summary')).toHaveTextContent(/3 of 4 workouts done/);
    expect(screen.getByTestId('sparkline', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('checkin-next'));

    // Step 4: fat loss with a flat trend → calories ease down 100–200 (engine).
    expect(screen.getByTestId('kcal-before')).toHaveTextContent('2,300');
    expect(screen.getByTestId('kcal-delta')).toHaveTextContent(/^−(100|150|200) kcal$/);
    expect(screen.getByTestId('checkin-volume')).toHaveTextContent(/\+1 set per muscle/);
    await fireEvent.press(screen.getByTestId('checkin-approve'));

    expect(await screen.findByTestId('checkin-done')).toBeTruthy();
    const rec = latestCheckin();
    expect(rec).toMatchObject({ date: '2026-11-22', energy: 'ok', sleep: 'good', weighedIn: true, volume: 'progress', appliesFrom: '2026-11-23' });
    expect(rec!.deltaKcal).toBeLessThan(0);
    expect(bodyMetricsRepo.list().find((w) => w.date === '2026-11-22')?.weightKg).toBe(81.9);
    expect(regenerateWeek).toHaveBeenCalledWith({ weekStart: '2026-11-23', adjustmentKcal: rec!.deltaKcal, volume: 'progress' });
    await waitFor(() => expect(latestCheckin()?.pending).toBe(false));
    expect(events.find(([e]) => e === 'checkin_done')?.[1]).toEqual({ kcal_change_bucket: expect.stringMatching(/^down_/) });
    await fireEvent.press(screen.getByTestId('checkin-finish'));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('CheckinScreen states', () => {
  it('skip the weigh-in: uses the trend, saves without a new weight; pending without a planner', async () => {
    seedWeek();
    await renderThemed(<CheckinScreen now={SUNDAY} />);
    await fireEvent.press(screen.getByTestId('checkin-skip-weight'));
    expect(screen.getByTestId('checkin-step-feel')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('energy-low'));
    await fireEvent.press(screen.getByTestId('sleep-poor'));
    await fireEvent.press(screen.getByTestId('checkin-next'));
    await fireEvent.press(screen.getByTestId('checkin-next'));
    expect(screen.getByTestId('checkin-volume')).toHaveTextContent(/Lighter week/);
    await fireEvent.press(screen.getByTestId('checkin-approve'));
    expect(latestCheckin()).toMatchObject({ weighedIn: false, volume: 'deload', pending: true });
    expect(bodyMetricsRepo.list().some((w) => w.date === '2026-11-22')).toBe(false);
  });

  it('no meal plan yet: calories are left to the meal plan', async () => {
    seedProfile(undefined, { weightKg: null });
    await renderThemed(<CheckinScreen now={SUNDAY} />);
    await fireEvent.press(screen.getByTestId('checkin-add-weight'));
    await walkToAdjust();
    expect(screen.getByText('Your calorie target is set with your meal plan.')).toBeTruthy();
  });

  it('Pro gate when payments are on and there is no subscription', async () => {
    seedWeek();
    useBillingStore.setState({ paymentsEnabled: true, entitlement: null });
    await renderThemed(<CheckinScreen now={SUNDAY} />);
    expect(screen.getByTestId('checkin-pro')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('checkin-pro-action'));
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('before onboarding', async () => {
    await renderThemed(<CheckinScreen now={SUNDAY} />);
    expect(screen.getByTestId('checkin-onboard')).toBeTruthy();
  });

  it(`back steps through the flow (${Platform.OS})`, async () => {
    seedWeek();
    const add = jest.spyOn(BackHandler, 'addEventListener');
    await renderThemed(<CheckinScreen now={SUNDAY} />);
    await fireEvent.press(screen.getByTestId('checkin-next'));
    expect(screen.getByTestId('checkin-step-feel')).toBeTruthy();
    if (Platform.OS === 'android') {
      const handler = add.mock.calls.at(-1)?.[1] as () => boolean;
      expect(handler()).toBe(true);
    } else {
      expect(add).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByTestId('checkin-back'));
    }
    await waitFor(() => expect(screen.getByTestId('checkin-step-weigh')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('checkin-back'));
    expect(router.back).toHaveBeenCalled();
    add.mockRestore();
  });
});
