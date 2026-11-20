import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { saveProfile } from '@/features/settings/repo';
import {
  exercisesForSession,
  logSet,
  sessionExercisesRepo,
  sessionsRepo,
} from '@/features/workout/repo';
import { getCatalog } from '@/services/catalog';
import { useToastStore } from '@/ui';

import { EMPTY_DRAFT } from '../logic/customExercise';
import { localISODate } from '../logic/dates';
import { useLibraryPrefs } from '../prefs';
import { createCustomExercise } from '../repo';
import { ExerciseDetailScreen } from '../screens/ExerciseDetailScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

beforeEach(async () => {
  resetDbForTests();
  await migrateDb();
  useLibraryPrefs.setState({ favourites: [], viewed: [] });
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  getCatalog();
});

describe.each(SCHEMES)(`ExerciseDetailScreen (%s, ${Platform.OS})`, (scheme) => {
  it('shows the muscle-map hero, tags, muscles, steps, cues, mistakes and alternatives', async () => {
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />, scheme);
    expect(screen.getByTestId('screen-exercise-title').props.children).toBe('Barbell back squat');
    // No media configured: a designed muscle map, never a grey "coming soon" box.
    expect(screen.queryByText('Demo coming soon')).toBeNull();
    expect(
      screen.queryByTestId('exercise-media-frames', { includeHiddenElements: true }),
    ).toBeNull();
    expect(
      screen.getByRole('image', {
        name: 'Barbell back squat. Front view. Main: Quads, Glutes. Also: Inner thighs, Hamstrings, Lower back, Abs. Barbell, Squat, Intermediate.',
      }),
    ).toBeTruthy();
    await fireEvent(screen.getByTestId('exercise-media'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 240, x: 0, y: 0 } },
    });
    expect(
      screen.getByTestId('exercise-media-level', { includeHiddenElements: true }),
    ).toHaveTextContent('Intermediate');
    expect(
      screen.getByTestId('exercise-media-glyph', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByText('Squat', { includeHiddenElements: true })).toBeTruthy();
    expect(
      screen.getAllByText('Barbell', { includeHiddenElements: true }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('exercise-tags')).toHaveTextContent(/Squat rack/);
    expect(screen.getByTestId('body-map').props.accessibilityLabel).toMatch(
      /^Muscles worked\. Main: Quads, Glutes\. Also: Inner thighs/,
    );
    expect(screen.getByTestId('exercise-steps')).toBeTruthy();
    for (const h of [
      'Muscles',
      'Your records',
      'How to do it',
      'Cues',
      'Common mistakes',
      'Alternatives',
    ]) {
      expect(screen.getByRole('header', { name: h })).toBeTruthy();
    }
    expect(screen.getByText('Letting the heels lift off the floor.')).toBeTruthy();
    expect(screen.getByTestId('exercise-row-box-squat')).toBeTruthy();
    expect(await screen.findByTestId('records-empty')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to workout' })).toBeTruthy();
  });
});

describe('ExerciseDetailScreen', () => {
  it('records the view for Recently used', async () => {
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />);
    expect(useLibraryPrefs.getState().viewed[0]?.id).toBe('barbell-back-squat');
  });

  it('turns the figure to the other side with the flip button', async () => {
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show back view' }));
    expect(screen.getByRole('image', { name: /^Barbell back squat\. Back view\./ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show front view' })).toBeTruthy();
  });

  it('picks the side that shows the main muscles (back-only exercise opens on the back)', async () => {
    await renderThemed(<ExerciseDetailScreen id="lat-pulldown" />);
    expect(screen.getByRole('image', { name: /Back view\. Main: Lats/ })).toBeTruthy();
  });

  it('crossfades the demo frames over the muscle map when a cloud is configured', async () => {
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME = 'demo';
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />);
    expect(screen.getByTestId('exercise-media')).toBeTruthy();
    expect(
      screen.getByTestId('exercise-media-frames', { includeHiddenElements: true }),
    ).toBeTruthy();
    // The muscle map stays underneath as the placeholder until the frames load.
    expect(screen.getByTestId('exercise-media-map')).toBeTruthy();
  });

  it('shows live records from logged sets in the user unit', async () => {
    saveProfile({ units: 'kg' });
    const s = sessionsRepo.insert({ date: '2026-11-10', title: 'Legs', status: 'done' });
    const se = sessionExercisesRepo.insert({
      sessionId: s.id,
      exerciseId: 'barbell-back-squat',
      position: 0,
    });
    logSet({ sessionExerciseId: se.id, weightKg: 100, reps: 5 }, 1000);
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />);
    expect(await screen.findByTestId('records')).toBeTruthy();
    expect(screen.getByTestId('record-heaviest').props.children).toBe('100 kg × 5');
    expect(screen.getByTestId('record-volume').props.children).toBe('500 kg');
    expect(screen.getByText('1 set')).toBeTruthy();
    await act(async () => {
      logSet({ sessionExerciseId: se.id, weightKg: 110, reps: 3 }, 2000);
    });
    await waitFor(() =>
      expect(screen.getByTestId('record-heaviest').props.children).toBe('110 kg × 3'),
    );
    expect(screen.getByText('2 sets')).toBeTruthy();
  });

  it('toggles favourite from the header', async () => {
    await renderThemed(<ExerciseDetailScreen id="push-up" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add to favourites' }));
    expect(useLibraryPrefs.getState().favourites).toEqual(['push-up']);
    expect(screen.getByRole('button', { name: 'Remove from favourites' })).toBeSelected();
  });

  it('adds the exercise to an open session in two taps', async () => {
    const s = sessionsRepo.insert({ date: localISODate(), title: 'Push day', status: 'planned' });
    await renderThemed(<ExerciseDetailScreen id="push-up" />);
    await fireEvent.press(screen.getByTestId('exercise-add'));
    await fireEvent.press(await screen.findByTestId(`add-to-${s.id}`));
    expect(exercisesForSession(s.id).map((e) => e.exerciseId)).toEqual(['push-up']);
    expect(useToastStore.getState().current?.message).toBe('Push-up added to Push day');
  });

  it('explains when there is no workout to add to', async () => {
    await renderThemed(<ExerciseDetailScreen id="push-up" />);
    await fireEvent.press(screen.getByTestId('exercise-add'));
    expect(await screen.findByTestId('add-sheet-empty')).toBeTruthy();
  });

  it('custom exercises show their data and an edit button', async () => {
    const row = createCustomExercise({
      ...EMPTY_DRAFT,
      name: 'Garage row',
      primaryMuscles: ['lats'],
      equipment: ['dumbbell'],
      steps: 'Hinge\nRow',
    });
    await renderThemed(<ExerciseDetailScreen id={row.id} />);
    expect(await screen.findByText('Garage row')).toBeTruthy();
    expect(screen.getByText('Row')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Alternatives' })).toBeNull();
    await fireEvent.press(screen.getByTestId('exercise-edit'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercise/custom',
      params: { id: row.id },
    });
  });

  it('shows a not-found state for unknown ids and goes back', async () => {
    await renderThemed(<ExerciseDetailScreen id="nope" />);
    expect(await screen.findByTestId('exercise-missing')).toBeTruthy();
    expect(screen.queryByTestId('exercise-add')).toBeNull();
    await fireEvent.press(screen.getByTestId('exercise-back'));
    expect(router.back).toHaveBeenCalled();
  });
});
