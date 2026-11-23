import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
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
import { DEFAULT_MEDIA_BASE } from '@/services/exerciseMedia';
import { useToastStore } from '@/ui';

import { EMPTY_DRAFT } from '../logic/customExercise';
import { loadExerciseDb } from '../hooks/useExerciseDb';
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
  it('shows the GIF hero over the muscle map, tags, muscles worked, steps, cues, mistakes and alternatives', async () => {
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />, scheme);
    expect(screen.getByTestId('screen-exercise-title').props.children).toBe('Barbell back squat');
    expect(screen.queryByText('Demo coming soon')).toBeNull();
    // The animated ExerciseDB demo from our CDN is the main visual…
    const gif = screen.getByTestId('exercise-media-gif', { includeHiddenElements: true });
    expect(gif).toBeTruthy();
    const img = screen.getByTestId('exercise-media-gif-image', { includeHiddenElements: true });
    expect(img.props.source).toEqual([
      { uri: `${DEFAULT_MEDIA_BASE}/exercisedb/v1/gifs/qXTaZnJ.gif` },
    ]);
    expect(img.props.cachePolicy).toBe('memory-disk');
    // …and the designed muscle map sits underneath as the placeholder (never a spinner).
    const hero = within(screen.getByTestId('exercise-media'));
    expect(
      hero.getByRole('image', {
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
    expect(screen.getByTestId('exercise-tags')).toHaveTextContent(/Squat rack/);
    // The muscle map is the secondary visual under "Muscles worked".
    expect(screen.getByTestId('exercise-muscles-map')).toBeTruthy();
    expect(screen.getByTestId('body-map').props.accessibilityLabel).toMatch(
      /^Muscles worked\. Main: Quads, Glutes\. Also: Inner thighs/,
    );
    expect(screen.getByTestId('exercise-steps')).toBeTruthy();
    for (const h of [
      'Muscles worked',
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
    expect(screen.queryByTestId('exercise-browse-only')).toBeNull();
  });

  it('without a demo GIF the hero is the muscle map and there is no second map', async () => {
    await renderThemed(<ExerciseDetailScreen id="cat-cow" />, scheme);
    expect(screen.queryByTestId('exercise-media-gif', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('exercise-media-map')).toBeTruthy();
    expect(screen.queryByTestId('exercise-muscles-map')).toBeNull();
    expect(screen.getByRole('header', { name: 'Muscles worked' })).toBeTruthy();
  });
});

describe('ExerciseDetailScreen', () => {
  it('records the view for Recently used', async () => {
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />);
    expect(useLibraryPrefs.getState().viewed[0]?.id).toBe('barbell-back-squat');
  });

  it('turns the figure to the other side with the flip button', async () => {
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />);
    const map = within(screen.getByTestId('exercise-muscles-map'));
    await fireEvent.press(map.getByRole('button', { name: 'Show back view' }));
    expect(map.getByRole('image', { name: /^Barbell back squat\. Back view\./ })).toBeTruthy();
    expect(map.getByRole('button', { name: 'Show front view' })).toBeTruthy();
  });

  it('picks the side that shows the main muscles (back-only exercise opens on the back)', async () => {
    await renderThemed(<ExerciseDetailScreen id="lat-pulldown" />);
    const map = within(screen.getByTestId('exercise-muscles-map'));
    expect(map.getByRole('image', { name: /Back view\. Main: Lats/ })).toBeTruthy();
  });

  it('falls back to the muscle map at once when the GIF fails (offline, 404)', async () => {
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />);
    const img = screen.getByTestId('exercise-media-gif-image', { includeHiddenElements: true });
    await act(async () => img.props.onError({ nativeEvent: { error: 'offline' } }));
    expect(screen.queryByTestId('exercise-media-gif', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('exercise-media-map')).toBeTruthy();
  });

  it('shows the muscle inset once the GIF is in', async () => {
    await renderThemed(<ExerciseDetailScreen id="barbell-back-squat" />);
    const img = screen.getByTestId('exercise-media-gif-image', { includeHiddenElements: true });
    await act(async () =>
      img.props.onLoad({
        nativeEvent: { cacheType: 'disk', source: { url: '', width: 360, height: 360, mediaType: 'image/gif', isAnimated: true } },
      }),
    );
    expect(screen.getByTestId('exercise-media-inset')).toBeTruthy();
    expect(screen.queryByTestId('exercise-media-flip')).toBeNull();
  });

  it('opens a browse-only ExerciseDB exercise: GIF, steps, no records, cannot be added', async () => {
    const item = loadExerciseDb().items.find((i) => i.mediaId && i.instructions.length)!;
    await renderThemed(<ExerciseDetailScreen id={item.id} />);
    expect(screen.getByTestId('screen-exercise-title').props.children).toBe(item.name);
    expect(screen.getByTestId('exercise-browse-only')).toBeTruthy();
    expect(screen.getByTestId('exercise-media-gif', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('exercise-steps')).toBeTruthy();
    expect(screen.queryByText(/^Step:/)).toBeNull();
    expect(screen.queryByRole('header', { name: 'Your records' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to workout' })).toBeNull();
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
    // Not a core action: one buzz at most (the row), the toast stays silent.
    expect(useToastStore.getState().current?.silent).toBe(true);
  });

  it('with nothing planned, starts a workout with this exercise', async () => {
    await renderThemed(<ExerciseDetailScreen id="push-up" />);
    await fireEvent.press(screen.getByTestId('exercise-add'));
    expect(await screen.findByTestId('add-sheet-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('add-sheet-empty-action'));
    const today = sessionsRepo.list().filter((x) => x.date === localISODate());
    expect(today).toHaveLength(1);
    expect(exercisesForSession(today[0]!.id).map((e) => e.exerciseId)).toEqual(['push-up']);
    expect(router.push).toHaveBeenCalledWith(`/train?sessionId=${today[0]!.id}&start=1`);
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
