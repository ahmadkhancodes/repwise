import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';
import { finishedBench, freshDb, plannedSession, TODAY } from '../../../../test/workoutFixtures';

import { routinesRepo } from '@/features/library/repo';
import { resetCatalogForTests } from '@/services/catalog';
import { setAnalyticsSink } from '@/services/analytics';
import { useToastStore } from '@/ui';

import { exercisesForSession, getSession, setsFor, startWorkout } from '../repo';
import { resetRestTimerForTests, restTimer } from '../restTimerStore';
import { resetRestNotifierForTests } from '../restNotifier';
import { SkeletonList } from '../components/Skeleton';
import { weekOf } from '../logic/dates';
import { ExerciseScreen } from '../screens/ExerciseScreen';
import { ExercisePickerScreen } from '../screens/ExercisePickerScreen';
import { RoutineBuilderScreen } from '../screens/RoutineBuilderScreen';
import { SummaryScreen } from '../screens/SummaryScreen';
import { ToolsScreen } from '../screens/ToolsScreen';
import { TrainScreen } from '../screens/TrainScreen';
import { WorkoutPlayerScreen } from '../screens/WorkoutPlayerScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));
jest.mock(
  'expo-notifications',
  () => ({
    scheduleNotificationAsync: jest.fn(async () => 'id'),
    cancelScheduledNotificationAsync: jest.fn(async () => undefined),
    dismissNotificationAsync: jest.fn(async () => undefined),
    setNotificationChannelAsync: jest.fn(async () => null),
    AndroidImportance: { HIGH: 4, LOW: 2 },
  }),
  { virtual: true },
);
const mockRouter = (jest.requireMock('expo-router') as { router: Record<string, jest.Mock> }).router as {
  push: jest.Mock;
  replace: jest.Mock;
  back: jest.Mock;
  canGoBack: jest.Mock;
};
const mockNotifications = jest.requireMock('expo-notifications') as { scheduleNotificationAsync: jest.Mock };

const events: { e: string; p: Record<string, unknown> }[] = [];

beforeEach(async () => {
  await freshDb();
  resetRestTimerForTests();
  resetRestNotifierForTests();
  useToastStore.setState({ current: null });
  events.length = 0;
  setAnalyticsSink((e, p) => events.push({ e, p }));
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
});
afterEach(() => setAnalyticsSink(null));

describe.each(SCHEMES)(`workout screens (%s, ${Platform.OS})`, (scheme) => {
  describe('Train tab (S08)', () => {
    it('shows an empty week and starts an empty workout', async () => {
      await renderThemed(<TrainScreen />, scheme);
      expect(screen.getByTestId('train-week-empty')).toBeTruthy();
      expect(screen.getByText('Start empty workout')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('train-start'));
      const id = (mockRouter.push.mock.calls[0]?.[0] as string).split('/').pop()!;
      expect(getSession(id)).toMatchObject({ status: 'active', date: TODAY() });
      expect(events.map((x) => x.e)).toContain('workout_started');
    });

    it("lists this week's sessions and starts today's planned one", async () => {
      const s = plannedSession();
      await renderThemed(<TrainScreen />, scheme);
      expect(screen.getByTestId('week-session-0')).toBeTruthy();
      expect(screen.getByText('Push day')).toBeTruthy();
      expect(screen.getByTestId('train-week-count').props.children).toEqual(['0 of 1 done', '']);
      await fireEvent.press(screen.getByTestId('train-start'));
      expect(mockRouter.push).toHaveBeenCalledWith(`/workout/${s.id}`);
      expect(getSession(s.id)?.status).toBe('active');
      // The active workout shows the resume banner instead of a start button.
      expect(await screen.findByTestId('resume-banner')).toBeTruthy();
      expect(screen.queryByTestId('train-start')).toBeNull();
    });

    it('filters by day from the week strip', async () => {
      plannedSession();
      await renderThemed(<TrainScreen />, scheme);
      const other = weekOf(TODAY()).find((d) => d !== TODAY())!;
      await fireEvent.press(screen.getByTestId(`day-${other}`));
      expect(screen.getByTestId('train-week-empty')).toBeTruthy();
      await fireEvent.press(screen.getByTestId(`day-${other}`));
      expect(screen.getByTestId('week-session-0')).toBeTruthy();
    });

    it('shows history and routines, gating new routines for free users only when payments are on', async () => {
      finishedBench('2026-11-10', 80, 8, Date.UTC(2026, 10, 10, 9));
      await renderThemed(<TrainScreen />, scheme);
      await fireEvent(screen.getByTestId('train-tabs'), 'onChange', 'history');
      await fireEvent.press(screen.getByText('History'));
      expect(await screen.findByTestId('history-0')).toBeTruthy();
      await fireEvent.press(screen.getByText('Routines'));
      expect(screen.getByTestId('train-routines-empty')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('train-routines-empty-action'));
      const pushed = mockRouter.push.mock.calls.at(-1)?.[0] as string;
      expect(pushed).toMatch(/^\/workout\/routine\//);
      expect(routinesRepo.list()).toHaveLength(1);
    });
  });

  describe('Workout player (S09/S13)', () => {
    it('shows the overview, then starts with pre-filled sets', async () => {
      const s = plannedSession();
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      expect(screen.getByTestId('player-overview')).toBeTruthy();
      expect(screen.getByText('Barbell back squat')).toBeTruthy();
      expect(screen.queryByTestId('exercise-0-set-0')).toBeNull();
      await fireEvent.press(screen.getByTestId('player-start'));
      expect(getSession(s.id)?.status).toBe('active');
      expect(await screen.findByTestId('exercise-0-set-0')).toBeTruthy();
      expect(screen.getByTestId('exercise-0-set-0-weight').props.value).toBe('100');
      expect(screen.getByTestId('exercise-0-set-0-reps').props.value).toBe('5');
      expect(screen.getByTestId('player-clock')).toBeTruthy();
    });

    it('logs a set in one tap, starts the rest timer and schedules "Rest over"', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      const se = exercisesForSession(s.id)[0]!;
      expect(setsFor(se.id)[0]?.doneAt).not.toBeNull();
      expect(restTimer.getState()).toMatchObject({ status: 'running', durationMs: 120_000, next: { exercise: 'Barbell back squat', setNo: 2 } });
      expect(await screen.findByTestId('rest-pill')).toBeTruthy();
      expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalled();
      expect(events.find((x) => x.e === 'set_logged')?.p).toEqual({ type: 'working', has_rpe: false, pr: false });
      // Tap again to undo.
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      expect(setsFor(se.id)[0]?.doneAt).toBeNull();
    });

    it('edits values on blur and fills an empty row from previous on tick', async () => {
      finishedBench('2026-11-10', 80, 9, Date.UTC(2026, 10, 10, 9));
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      const weight = screen.getByTestId('exercise-1-set-0-weight');
      expect(weight.props.value).toBe('80');
      await fireEvent.changeText(weight, '82,5');
      await fireEvent(weight, 'endEditing');
      const bench = exercisesForSession(s.id)[1]!;
      expect(setsFor(bench.id)[0]?.weightKg).toBe(82.5);
      expect(screen.getAllByText('80 × 9')).toHaveLength(2);
    });

    it('celebrates a PR with a toast', async () => {
      finishedBench('2026-11-10', 80, 8, Date.UTC(2026, 10, 10, 9));
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      const weight = screen.getByTestId('exercise-1-set-0-weight');
      await fireEvent.changeText(weight, '90');
      await fireEvent(weight, 'endEditing');
      await fireEvent.press(screen.getByTestId('exercise-1-set-0-check'));
      expect(useToastStore.getState().current?.message).toBe('New PR · Barbell bench press 90 kg');
    });

    it('sets type and RPE from the set sheet', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-type'));
      await fireEvent.press(screen.getByTestId('set-type-warmup'));
      await fireEvent.press(screen.getByTestId('rpe-8'));
      const set = setsFor(exercisesForSession(s.id)[0]!.id)[0]!;
      expect(set).toMatchObject({ type: 'warmup', rpe: 8 });
      expect(screen.getAllByText('W').length).toBeGreaterThan(0);
      await fireEvent.press(screen.getByTestId('set-delete'));
      expect(setsFor(exercisesForSession(s.id)[0]!.id)).toHaveLength(2);
    });

    it('swaps an exercise from the menu (3 alternatives) and reorders', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-1-menu'));
      await fireEvent.press(screen.getByTestId('menu-swap'));
      expect(screen.getByTestId('swap-option-0')).toBeTruthy();
      expect(screen.queryByTestId('swap-option-3')).toBeNull();
      await fireEvent.press(screen.getByTestId('swap-option-0'));
      expect(exercisesForSession(s.id)[1]?.exerciseId).not.toBe('barbell-bench-press');
      expect(useToastStore.getState().current?.message).toMatch(/^Swapped to /);

      await fireEvent.press(screen.getByTestId('exercise-0-menu'));
      await fireEvent.press(screen.getByTestId('menu-reorder'));
      await fireEvent.press(screen.getByTestId('reorder-down-0'));
      expect(exercisesForSession(s.id)[1]?.exerciseId).toBe('barbell-back-squat');
    });

    it('long-press on an exercise opens swap (W4)', async () => {
      const s = plannedSession();
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent(screen.getByTestId('exercise-0-open'), 'longPress');
      expect(screen.getByTestId('swap-option-0')).toBeTruthy();
    });

    it('pauses and resumes the workout and the rest', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      await fireEvent.press(screen.getByTestId('player-pause'));
      expect(getSession(s.id)?.status).toBe('paused');
      expect(restTimer.getState().status).toBe('paused');
      expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
      await fireEvent.press(screen.getByTestId('player-pause'));
      expect(getSession(s.id)?.status).toBe('active');
      expect(restTimer.getState().status).toBe('running');
    });

    it('rest controls: +15, skip', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      await fireEvent.press(await screen.findByTestId('rest-pill'));
      const before = restTimer.getState();
      await fireEvent.press(screen.getByTestId('rest-plus'));
      const after = restTimer.getState();
      expect(after.status === 'running' && before.status === 'running' && after.endsAt - before.endsAt).toBeGreaterThanOrEqual(15_000);
      await fireEvent.press(screen.getByTestId('rest-skip'));
      expect(restTimer.getState().status).toBe('idle');
    });

    it('asks before finishing with unticked sets, then opens the summary', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      await fireEvent.press(screen.getByTestId('player-finish'));
      expect(screen.getByText('5 sets aren’t ticked', { exact: false })).toBeTruthy();
      await fireEvent.press(screen.getByTestId('finish-confirm'));
      expect(getSession(s.id)?.status).toBe('done');
      expect(mockRouter.replace).toHaveBeenCalledWith(`/workout/${s.id}/summary`);
      expect(restTimer.getState().status).toBe('idle');
      expect(events.find((x) => x.e === 'workout_finished')?.p).toEqual({ duration_bucket: '<30', sets: 1, prs: 0 });
    });

    it('shows an empty state for a workout with no exercises, and a not-found state', async () => {
      const { createSession } = jest.requireActual('../repo') as typeof import('../repo');
      const s = createSession({ date: TODAY(), title: 'Empty' });
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      expect(screen.getByTestId('player-empty')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('player-empty-action'));
      expect(mockRouter.push).toHaveBeenCalledWith(`/workout/pick?session=${s.id}`);
    });

    it('shows a not-found state for an unknown workout', async () => {
      await renderThemed(<WorkoutPlayerScreen sessionId="missing" />, scheme);
      expect(screen.getByTestId('player-missing')).toBeTruthy();
    });

    it('renders from a cold catalogue (skeleton, then the overview)', async () => {
      resetCatalogForTests();
      const s = plannedSession();
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      expect(await screen.findByTestId('player-overview')).toBeTruthy();
    });

    it('has a labelled skeleton for loading', async () => {
      await renderThemed(<SkeletonList testID="sk" />, scheme);
      expect(screen.getByLabelText('Loading')).toBeTruthy();
    });
  });

  describe('Exercise screen (S14)', () => {
    it('logs sets, saves notes and moves to the next exercise', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      const [squat, bench] = exercisesForSession(s.id);
      await renderThemed(<ExerciseScreen sessionId={s.id} seId={squat!.id} />, scheme);
      expect(screen.getByText('1 of 2', { exact: false })).toBeTruthy();
      await fireEvent.press(screen.getByTestId('ex-set-0-check'));
      expect(setsFor(squat!.id)[0]?.doneAt).not.toBeNull();
      await fireEvent.changeText(screen.getByTestId('ex-notes'), 'Belt on');
      await fireEvent(screen.getByTestId('ex-notes'), 'endEditing');
      expect(exercisesForSession(s.id)[0]?.notes).toBe('Belt on');
      await fireEvent.press(screen.getByTestId('ex-footer'));
      expect(mockRouter.replace).toHaveBeenCalledWith(`/workout/${s.id}/ex/${bench!.id}`);
    });
  });

  describe('Summary (S35)', () => {
    it('leads with volume, celebrates PRs and suggests next time', async () => {
      finishedBench('2026-11-10', 80, 8, Date.UTC(2026, 10, 10, 9));
      const s = plannedSession();
      startWorkout(s.id);
      const bench = exercisesForSession(s.id)[1]!;
      const { setDone, finishWorkout } = jest.requireActual('../repo') as typeof import('../repo');
      for (const st of setsFor(bench.id)) setDone(st.id, true, { weightKg: 85, reps: 12 });
      finishWorkout(s.id);
      await renderThemed(<SummaryScreen sessionId={s.id} />, scheme);
      expect(screen.getByTestId('summary-volume')).toBeTruthy();
      expect(screen.getByTestId('summary-pr-0')).toBeTruthy();
      expect(screen.getAllByText('Barbell bench press').length).toBe(2); // PR card + next time
      expect(screen.getByText('87.5 kg × 8')).toBeTruthy();
      expect(screen.getByTestId('confetti', { includeHiddenElements: true })).toBeTruthy();
      await fireEvent.press(screen.getByTestId('summary-done'));
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('has no confetti without a PR, and a not-found state', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      const { finishWorkout } = jest.requireActual('../repo') as typeof import('../repo');
      finishWorkout(s.id);
      await renderThemed(<SummaryScreen sessionId={s.id} />, scheme);
      expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
    });

    it('shows a not-found summary', async () => {
      await renderThemed(<SummaryScreen sessionId="missing" />, scheme);
      expect(screen.getByTestId('summary-missing')).toBeTruthy();
    });
  });

  describe('Tools (S17)', () => {
    it('shows plates per side and the 1RM table', async () => {
      await renderThemed(<ToolsScreen />, scheme);
      expect(screen.getByTestId('plate-per-side').props.children).toBe('25 + 15');
      await fireEvent.press(screen.getByTestId('plate-target-inc'));
      expect(screen.getByTestId('plate-per-side').props.children).toBe('25 + 15 + 1.25');
      await fireEvent.press(screen.getByTestId('bar-15'));
      expect(screen.getByTestId('plate-per-side').props.children).toBe('25 + 15 + 2.5 + 1.25');
      await fireEvent.press(screen.getByText('1RM'));
      expect(screen.getByTestId('one-rm-calculator')).toBeTruthy();
      expect(screen.getByLabelText('Estimated 1RM, 93.3 kg')).toBeTruthy();
      await fireEvent.press(screen.getByText('Brzycki'));
      expect(screen.getByLabelText('Estimated 1RM, 90.0 kg')).toBeTruthy();
    });
  });

  describe('Routine builder (S16) and exercise picker', () => {
    it('adds exercises to a routine through the picker', async () => {
      const r = routinesRepo.insert({ name: 'Upper A', items: [] });
      await renderThemed(<ExercisePickerScreen routineId={r.id} />, scheme);
      await fireEvent.changeText(screen.getByTestId('pick-search'), 'bench press');
      await fireEvent.press(screen.getByTestId('pick-barbell-bench-press'));
      expect(mockRouter.back).toHaveBeenCalled();
      expect(routinesRepo.get(r.id)?.items).toEqual([{ exerciseId: 'barbell-bench-press', sets: 3, reps: '8-12', restS: 90 }]);
    });

    it('edits a routine and starts a workout from it', async () => {
      const r = routinesRepo.insert({ name: 'Upper A', items: [{ exerciseId: 'barbell-bench-press', sets: 3, reps: '8-12', restS: 90 }] });
      await renderThemed(<RoutineBuilderScreen routineId={r.id} />, scheme);
      expect(screen.getByText('Barbell bench press')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('routine-item-0'));
      await fireEvent.press(screen.getByTestId('routine-sets-inc'));
      await fireEvent.press(screen.getByTestId('routine-reps-5'));
      expect(routinesRepo.get(r.id)?.items).toEqual([{ exerciseId: 'barbell-bench-press', sets: 4, reps: '5', restS: 90 }]);
      await fireEvent.press(screen.getByTestId('routine-start'));
      const target = mockRouter.replace.mock.calls.at(-1)?.[0] as string;
      const id = target.split('/').pop()!;
      expect(getSession(id)).toMatchObject({ status: 'active', title: 'Upper A' });
      expect(setsFor(exercisesForSession(id)[0]!.id)).toHaveLength(4);
    });

    it('picker adds to a live session and shows no-match state', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<ExercisePickerScreen sessionId={s.id} />, scheme);
      await fireEvent.changeText(screen.getByTestId('pick-search'), 'zzzzqq');
      expect(screen.getByTestId('pick-empty')).toBeTruthy();
      await fireEvent.changeText(screen.getByTestId('pick-search'), 'treadmill');
      await fireEvent.press(screen.getByTestId('pick-treadmill-run'));
      const added = exercisesForSession(s.id)[2]!;
      expect(setsFor(added.id).every((x) => x.type === 'cardio')).toBe(true);
    });

    it('shows an empty routine', async () => {
      const r = routinesRepo.insert({ name: 'Blank', items: [] });
      await renderThemed(<RoutineBuilderScreen routineId={r.id} />, scheme);
      expect(screen.getByTestId('routine-empty')).toBeTruthy();
      expect(screen.getByTestId('routine-start').props.accessibilityState).toMatchObject({ disabled: true });
      await act(async () => undefined);
    });
  });
});
