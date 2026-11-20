import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';
import { finishedBench, freshDb, plannedSession, TODAY } from '../../../../test/workoutFixtures';

import { routinesRepo } from '@/features/library/repo';
import { resetCatalogForTests } from '@/services/catalog';
import { setAnalyticsSink } from '@/services/analytics';
import { useToastStore } from '@/ui';

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { flushSetWrites, resetSetWritesForTests } from '../actions';
import { optimisticSets, resetOptimisticForTests } from '../optimistic';
import { exercisesForSession, getSession, setsFor, startWorkout } from '../repo';
import { resetRestTimerForTests, restTimer } from '../restTimerStore';
import { resetRestNotifierForTests } from '../restNotifier';
import { weekOf } from '../logic/dates';
import { ExerciseScreen } from '../screens/ExerciseScreen';
import { ExercisePickerScreen } from '../screens/ExercisePickerScreen';
import { RoutineBuilderScreen } from '../screens/RoutineBuilderScreen';
import { SummaryScreen } from '../screens/SummaryScreen';
import { ToolsScreen } from '../screens/ToolsScreen';
import { TrainScreen } from '../screens/TrainScreen';
import { WorkoutPlayerScreen } from '../screens/WorkoutPlayerScreen';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));

jest.setTimeout(20_000);

/** Let the batched set writes (next macrotask) and the live re-query land. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock('@/features/notifications/restTimer', () => ({ updateRestTimerSurface: jest.fn(async () => undefined) }));
const mockRouter = (jest.requireMock('expo-router') as { router: Record<string, jest.Mock> }).router as {
  push: jest.Mock;
  replace: jest.Mock;
  back: jest.Mock;
  canGoBack: jest.Mock;
  setParams: jest.Mock;
};
const mockSurface = jest.requireMock('@/features/notifications/restTimer') as { updateRestTimerSurface: jest.Mock };

const events: { e: string; p: Record<string, unknown> }[] = [];

beforeEach(async () => {
  await freshDb();
  resetRestTimerForTests();
  resetRestNotifierForTests();
  resetSetWritesForTests();
  resetOptimisticForTests();
  useToastStore.setState({ current: null });
  events.length = 0;
  setAnalyticsSink((e, p) => events.push({ e, p }));
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  mockParams.current = {};
});
afterEach(() => setAnalyticsSink(null));

describe.each(SCHEMES)(`workout screens (%s, ${Platform.OS})`, (scheme) => {
  describe('Train deep link /train?sessionId=…&start=1', () => {
    it('opens the player for that session and starts it', async () => {
      const s = plannedSession();
      mockParams.current = { sessionId: s.id, start: '1' };
      await renderThemed(<TrainScreen />, scheme);
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockRouter.push).toHaveBeenCalledWith(`/workout/${s.id}`);
      expect(getSession(s.id)?.status).toBe('active');
      expect(events.map((x) => x.e)).toContain('workout_started');
      expect(mockRouter.setParams).toHaveBeenCalledWith({ sessionId: undefined, start: undefined });
      // Every planned set exists as soon as the workout starts (1-tap logging).
      expect(setsFor(exercisesForSession(s.id)[0]!.id)).toHaveLength(3);
    });

    it('without start=1 opens the session overview without starting it', async () => {
      const s = plannedSession();
      mockParams.current = { sessionId: s.id };
      await renderThemed(<TrainScreen />, scheme);
      expect(mockRouter.push).toHaveBeenCalledWith(`/workout/${s.id}`);
      expect(getSession(s.id)?.status).toBe('planned');
    });

    it('opens a finished session on its summary', async () => {
      const s = finishedBench('2026-11-10', 80, 8, Date.UTC(2026, 10, 10, 9));
      mockParams.current = { sessionId: s.id, start: '1' };
      await renderThemed(<TrainScreen />, scheme);
      expect(mockRouter.push).toHaveBeenCalledWith(`/workout/${s.id}/summary`);
    });

    it('shows a calm toast for a session that is not on this phone', async () => {
      mockParams.current = { sessionId: 'nope', start: '1' };
      await renderThemed(<TrainScreen />, scheme);
      expect(mockRouter.push).not.toHaveBeenCalled();
      expect(useToastStore.getState().current?.message).toMatch(/isn't on this phone/);
    });

    it('does not start a second workout while one is in progress', async () => {
      const running = plannedSession(TODAY(), 'Legs');
      startWorkout(running.id);
      const s = plannedSession();
      mockParams.current = { sessionId: s.id, start: '1' };
      await renderThemed(<TrainScreen />, scheme);
      expect(mockRouter.push).toHaveBeenCalledWith(`/workout/${s.id}`);
      expect(getSession(s.id)?.status).toBe('planned');
      expect(getSession(running.id)?.status).toBe('active');
    });
  });

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
    it('shows the overview with muscle badges, then starts with pre-filled sets', async () => {
      const s = plannedSession();
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      expect(screen.getByTestId('player-overview')).toBeTruthy();
      expect(screen.getByText('Barbell back squat')).toBeTruthy();
      expect(screen.queryByTestId('exercise-0-set-0')).toBeNull();
      expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByTestId('player-start'));
      expect(getSession(s.id)?.status).toBe('active');
      expect(await screen.findByTestId('exercise-0-set-0')).toBeTruthy();
      expect(screen.getByTestId('exercise-0-set-0-weight')).toHaveTextContent(/100/);
      expect(screen.getByTestId('exercise-0-set-0-reps')).toHaveTextContent(/5/);
      expect(screen.getByTestId('player-clock')).toBeTruthy();
      expect(screen.getByTestId('player-position')).toHaveTextContent('Exercise 1 of 2 · Set 1 of 3');
      // B1: the screen stays awake while the workout runs.
      expect(activateKeepAwakeAsync).toHaveBeenCalledWith('workout');
    });

    it('ticks in one tap: green tick, rest timer, one batched write (A3)', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      const se = exercisesForSession(s.id)[0]!;
      const first = setsFor(se.id)[0]!;
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      expect(screen.getByTestId('exercise-0-set-0-check').props.accessibilityState).toMatchObject({ checked: true });
      expect(restTimer.getState()).toMatchObject({
        status: 'running',
        durationMs: 120_000,
        next: { exercise: 'Barbell back squat', setNo: 2, detail: '100 kg × 5' },
      });
      await settle();
      expect(setsFor(se.id)[0]?.doneAt).not.toBeNull();
      expect(optimisticSets.get(first.id)).toBeUndefined(); // cleared once the rows agree
      expect(await screen.findByTestId('rest-bar')).toBeTruthy();
      expect(mockSurface.updateRestTimerSurface).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: s.id, workoutTitle: 'Push day', nextExercise: 'Barbell back squat', nextSet: 2 }),
      );
      expect(events.filter((x) => x.e === 'set_logged').map((x) => x.p)).toEqual([{ type: 'working', has_rpe: false, pr: false }]);
    });

    it('a double tap logs once; un-tick keeps the rest and offers Undo', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      const se = exercisesForSession(s.id)[0]!;
      await fireEvent.press(screen.getByTestId('player-log'));
      await fireEvent.press(screen.getByTestId('player-log')); // logs set 2, not set 1 again
      await settle();
      expect(setsFor(se.id).map((x) => x.doneAt != null)).toEqual([true, true, false]);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      await settle();
      expect(setsFor(se.id)[0]?.doneAt).toBeNull();
      expect(restTimer.getState().status).toBe('running');
      const toast = useToastStore.getState().current!;
      expect(toast.message).toMatch(/set 1 un-ticked/);
      await act(async () => toast.onAction?.());
      await settle();
      expect(setsFor(se.id)[0]?.doneAt).not.toBeNull();
    });

    it('the footer logs the next set in the thumb zone and turns into Finish when all are done (B7)', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      expect(screen.getByTestId('player-up-next')).toHaveTextContent(/Barbell back squat/);
      expect(screen.getByTestId('player-log')).toHaveTextContent('Log set 1 · 100 kg × 5');
      for (let i = 0; i < 6; i++) {
        await fireEvent.press(screen.getByTestId('player-log'));
        await settle();
      }
      expect(screen.queryByTestId('player-log')).toBeNull();
      // Finished exercises collapse to one summary line.
      expect(screen.queryByTestId('exercise-0-set-0')).toBeNull();
      expect(screen.getByTestId('player-position')).toHaveTextContent('All 6 sets done');
      await fireEvent.press(screen.getByTestId('player-finish-all'));
      expect(getSession(s.id)?.status).toBe('done');
    });

    it('edits weight and reps with the gym stepper editor and logs from it (B2)', async () => {
      finishedBench('2026-11-10', 80, 9, Date.UTC(2026, 10, 10, 9));
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      expect(screen.getByTestId('exercise-1-set-0-weight')).toHaveTextContent(/80/);
      await fireEvent.press(screen.getByTestId('exercise-1-set-0-weight'));
      expect(screen.getByTestId('set-editor-previous')).toHaveTextContent('Last time 80 kg × 9');
      await fireEvent.press(screen.getByTestId('set-editor-weight-inc'));
      expect(screen.getByTestId('set-editor-weight-value')).toHaveTextContent('82.5');
      await fireEvent.press(screen.getByTestId('set-editor-reps-dec'));
      await fireEvent.press(screen.getByTestId('set-editor-log'));
      await settle();
      const bench = exercisesForSession(s.id)[1]!;
      expect(setsFor(bench.id)[0]).toMatchObject({ weightKg: 82.5, reps: 7 });
      expect(setsFor(bench.id)[0]?.doneAt).not.toBeNull();
    });

    it('celebrates a PR live: confetti, hero number and a trophy on the row (W3)', async () => {
      finishedBench('2026-11-10', 80, 8, Date.UTC(2026, 10, 10, 9));
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-1-set-0-weight'));
      for (let i = 0; i < 4; i++) await fireEvent.press(screen.getByTestId('set-editor-weight-inc'));
      await fireEvent.press(screen.getByTestId('set-editor-save'));
      await settle();
      await fireEvent.press(screen.getByTestId('exercise-1-set-0-check'));
      await settle();
      expect(await screen.findByTestId('pr-moment')).toBeTruthy();
      expect(screen.getByTestId('pr-moment-value', { includeHiddenElements: true })).toHaveTextContent('90');
      expect(screen.getByTestId('exercise-1-set-0-pr', { includeHiddenElements: true })).toBeTruthy();
      expect(events.find((x) => x.e === 'set_logged')?.p).toMatchObject({ pr: true });
    });

    it('set type and RPE from the set sheet; delete set has Undo', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-type'));
      await fireEvent.press(screen.getByTestId('set-type-warmup'));
      await fireEvent.press(screen.getByTestId('rpe-8'));
      const se = exercisesForSession(s.id)[0]!;
      expect(setsFor(se.id)[0]).toMatchObject({ type: 'warmup', rpe: 8 });
      await fireEvent.press(screen.getByTestId('set-delete'));
      expect(setsFor(se.id)).toHaveLength(2);
      const toast = useToastStore.getState().current!;
      expect(toast).toMatchObject({ message: 'Set deleted', actionLabel: 'Undo', silent: true });
      await act(async () => toast.onAction?.());
      expect(setsFor(se.id)).toHaveLength(3);
    });

    it('swaps (3 alternatives, silent toast), reorders, and removes an exercise with Undo', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-1-menu'));
      await fireEvent.press(screen.getByTestId('menu-swap'));
      expect(screen.getByTestId('swap-option-0')).toBeTruthy();
      expect(screen.queryByTestId('swap-option-3')).toBeNull();
      await fireEvent.press(screen.getByTestId('swap-option-0'));
      expect(exercisesForSession(s.id)[1]?.exerciseId).not.toBe('barbell-bench-press');
      expect(useToastStore.getState().current).toMatchObject({ message: expect.stringMatching(/^Swapped to /), silent: true });

      await fireEvent.press(screen.getByTestId('exercise-0-menu'));
      await fireEvent.press(screen.getByTestId('menu-reorder'));
      await fireEvent.press(screen.getByTestId('reorder-down-0'));
      expect(exercisesForSession(s.id)[1]?.exerciseId).toBe('barbell-back-squat');

      await fireEvent.press(screen.getByTestId('exercise-1-menu'));
      await fireEvent.press(screen.getByTestId('menu-remove'));
      expect(exercisesForSession(s.id)).toHaveLength(1);
      await act(async () => useToastStore.getState().current?.onAction?.());
      expect(exercisesForSession(s.id)).toHaveLength(2);
      expect(setsFor(exercisesForSession(s.id)[1]!.id)).toHaveLength(3);
    });

    it('long-press on an exercise opens swap (W4)', async () => {
      const s = plannedSession();
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent(screen.getByTestId('exercise-0-open'), 'longPress');
      expect(screen.getByTestId('swap-option-0')).toBeTruthy();
    });

    it('pauses and resumes from the workout menu; a paused workout lets the screen sleep', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      await fireEvent.press(screen.getByTestId('player-menu'));
      await fireEvent.press(screen.getByTestId('menu-pause'));
      expect(getSession(s.id)?.status).toBe('paused');
      expect(restTimer.getState().status).toBe('paused');
      expect(await screen.findByTestId('player-paused')).toBeTruthy();
      await waitFor(() => expect(deactivateKeepAwake).toHaveBeenCalledWith('workout'));
      await fireEvent.press(screen.getByTestId('player-menu'));
      await fireEvent.press(screen.getByTestId('menu-pause'));
      expect(getSession(s.id)?.status).toBe('active');
      expect(restTimer.getState().status).toBe('running');
    });

    it('rest bar +15 and skip inline; the hero timer sheet uses BigTimer (B4)', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      expect(await screen.findByTestId('rest-bar-time')).toHaveTextContent('2:00');
      const before = restTimer.getState();
      await fireEvent.press(screen.getByTestId('rest-bar-plus'));
      const after = restTimer.getState();
      expect(after.status === 'running' && before.status === 'running' && after.endsAt - before.endsAt).toBeGreaterThanOrEqual(15_000);
      await fireEvent.press(screen.getByTestId('rest-bar-open'));
      expect(screen.getByTestId('rest-time', { includeHiddenElements: true })).toBeTruthy();
      await fireEvent.press(screen.getByTestId('rest-minus'));
      await fireEvent.press(screen.getByTestId('rest-skip'));
      expect(restTimer.getState().status).toBe('idle');
      expect(screen.queryByTestId('rest-bar')).toBeNull();
    });

    it('asks before finishing with unticked sets; "Tick all and finish" keeps them', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      await fireEvent.press(screen.getByTestId('player-finish'));
      expect(screen.getByText('5 sets aren’t ticked', { exact: false })).toBeTruthy();
      await fireEvent.press(screen.getByTestId('finish-mark-done'));
      expect(getSession(s.id)?.status).toBe('done');
      expect(mockRouter.replace).toHaveBeenCalledWith(`/workout/${s.id}/summary`);
      expect(restTimer.getState().status).toBe('idle');
      // The squat sets had values (100 × 5): all count. Bench rows had no weight but reps.
      expect(setsFor(exercisesForSession(s.id)[0]!.id).every((x) => x.doneAt != null)).toBe(true);
      expect(events.find((x) => x.e === 'workout_finished')?.p).toMatchObject({ duration_bucket: '<30', sets: 6 });
    });

    it('finishes without the unticked sets (the queued tick still counts)', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      await fireEvent.press(screen.getByTestId('player-finish'));
      await fireEvent.press(screen.getByTestId('finish-confirm'));
      expect(getSession(s.id)?.status).toBe('done');
      expect(events.find((x) => x.e === 'workout_finished')?.p).toEqual({ duration_bucket: '<30', sets: 1, prs: 0 });
    });

    it('discard needs a confirm and can be undone (B8)', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      await fireEvent.press(screen.getByTestId('exercise-0-set-0-check'));
      flushSetWrites();
      await fireEvent.press(screen.getByTestId('player-menu'));
      await fireEvent.press(screen.getByTestId('menu-discard'));
      expect(getSession(s.id)?.status).toBe('active'); // nothing happens without the confirm
      const squat = exercisesForSession(s.id)[0]!;
      await fireEvent.press(screen.getByTestId('discard-confirm'));
      expect(getSession(s.id)).toBeUndefined(); // an ad-hoc workout is deleted (soft)
      expect(setsFor(squat.id)).toHaveLength(0);
      expect(mockRouter.back).toHaveBeenCalled();
      const toast = useToastStore.getState().current!;
      expect(toast.message).toBe('Workout discarded');
      await act(async () => toast.onAction?.());
      expect(getSession(s.id)?.status).toBe('active');
      expect(setsFor(exercisesForSession(s.id)[0]!.id)[0]?.doneAt).not.toBeNull();
    });

    it('shows an empty state for a workout with no exercises', async () => {
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

    it('renders from a cold catalogue (labelled skeleton, then the overview)', async () => {
      resetCatalogForTests();
      const s = plannedSession();
      await renderThemed(<WorkoutPlayerScreen sessionId={s.id} />, scheme);
      expect(await screen.findByTestId('player-overview')).toBeTruthy();
    });
  });

  describe('Exercise screen (S14)', () => {
    it('shows the library demo hero, logs sets, saves notes and moves on', async () => {
      const s = plannedSession();
      startWorkout(s.id);
      const [squat, bench] = exercisesForSession(s.id);
      await renderThemed(<ExerciseScreen sessionId={s.id} seId={squat!.id} />, scheme);
      expect(screen.getByText('Exercise 1 of 2')).toBeTruthy();
      expect(screen.queryByTestId('ex-media') ?? screen.queryByTestId('ex-media-placeholder')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('ex-set-0-check'));
      await settle();
      expect(setsFor(squat!.id)[0]?.doneAt).not.toBeNull();
      await fireEvent.press(screen.getByTestId('ex-log'));
      await fireEvent.press(screen.getByTestId('ex-log'));
      await settle();
      expect(setsFor(squat!.id).every((x) => x.doneAt != null)).toBe(true);
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
      await fireEvent.press(screen.getByTestId('exercise-row-barbell-bench-press'));
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
      await fireEvent.press(screen.getByTestId('exercise-row-treadmill-run'));
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
