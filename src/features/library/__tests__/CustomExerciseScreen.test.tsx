import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';

import { EMPTY_DRAFT } from '../logic/customExercise';
import { useLibraryPrefs } from '../prefs';
import { createCustomExercise, customExercisesRepo } from '../repo';
import { CustomExerciseScreen } from '../screens/CustomExerciseScreen';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
    dismissAll: jest.fn(),
  },
}));

beforeEach(async () => {
  resetDbForTests();
  await migrateDb();
  jest.clearAllMocks();
});

describe.each(SCHEMES)(`CustomExerciseScreen (%s, ${Platform.OS})`, (scheme) => {
  it('shows inline errors only after Create is tapped', async () => {
    await renderThemed(<CustomExerciseScreen />, scheme);
    expect(screen.getByTestId('screen-custom-exercise-title').props.children).toBe('New exercise');
    expect(screen.queryByText('Give it a name.')).toBeNull();
    await fireEvent.press(screen.getByTestId('custom-save'));
    expect(screen.getByText('Give it a name.')).toBeTruthy();
    expect(screen.getByText('Pick at least one main muscle.')).toBeTruthy();
    expect(screen.getByText('Pick the equipment, or Bodyweight.')).toBeTruthy();
    expect(customExercisesRepo.list()).toHaveLength(0);
  });
});

describe('CustomExerciseScreen', () => {
  it('creates an exercise and opens it', async () => {
    await renderThemed(<CustomExerciseScreen />);
    await fireEvent.changeText(screen.getByTestId('custom-name'), 'Landmine row');
    await fireEvent.press(screen.getByTestId('custom-primary-lats'));
    // a main muscle cannot also be secondary
    expect(screen.getByTestId('custom-secondary-lats')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('custom-secondary-biceps'));
    await fireEvent.press(screen.getByTestId('custom-equipment-landmine'));
    await fireEvent.press(screen.getByTestId('custom-pattern-pull_h'));
    await fireEvent.press(screen.getByRole('tab', { name: 'Advanced' }));
    await fireEvent.changeText(screen.getByTestId('custom-steps'), 'Hinge over\nRow to hip');
    expect(screen.getByRole('image', { name: /Main: Lats\. Also: Biceps/ })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('custom-save'));
    const rows = customExercisesRepo.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Landmine row',
      primaryMuscles: ['lats'],
      secondary: ['biceps'],
      equipment: ['landmine'],
      pattern: 'pull_h',
      difficulty: 3,
      steps: ['Hinge over', 'Row to hip'],
      isCustom: true,
    });
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/exercise/[id]',
      params: { id: rows[0]!.id },
    });
  });

  it('rejects a duplicate name', async () => {
    createCustomExercise({
      ...EMPTY_DRAFT,
      name: 'Garage row',
      primaryMuscles: ['lats'],
      equipment: ['dumbbell'],
    });
    await renderThemed(<CustomExerciseScreen />);
    await fireEvent.changeText(screen.getByTestId('custom-name'), 'garage row');
    await fireEvent.press(screen.getByTestId('custom-save'));
    expect(await screen.findByText('You already have an exercise with this name.')).toBeTruthy();
  });

  it('edits an existing exercise', async () => {
    const row = createCustomExercise({
      ...EMPTY_DRAFT,
      name: 'Garage row',
      primaryMuscles: ['lats'],
      equipment: ['dumbbell'],
    });
    await renderThemed(<CustomExerciseScreen id={row.id} />);
    expect(await screen.findByDisplayValue('Garage row')).toBeTruthy();
    expect(screen.getByTestId('screen-custom-exercise-title').props.children).toBe('Edit exercise');
    await fireEvent.changeText(screen.getByTestId('custom-name'), 'Garage row (heavy)');
    await fireEvent.press(screen.getByTestId('custom-save'));
    expect(customExercisesRepo.get(row.id)?.name).toBe('Garage row (heavy)');
    expect(router.back).toHaveBeenCalled();
  });

  it('deletes after confirming and forgets favourites', async () => {
    const row = createCustomExercise({
      ...EMPTY_DRAFT,
      name: 'Garage row',
      primaryMuscles: ['lats'],
      equipment: ['dumbbell'],
    });
    useLibraryPrefs.setState({ favourites: [row.id], viewed: [{ id: row.id, at: 1 }] });
    await renderThemed(<CustomExerciseScreen id={row.id} />);
    await fireEvent.press(await screen.findByTestId('custom-delete'));
    await fireEvent.press(await screen.findByTestId('custom-delete-confirm'));
    expect(customExercisesRepo.get(row.id)).toBeUndefined();
    expect(useLibraryPrefs.getState().favourites).toEqual([]);
    expect(useLibraryPrefs.getState().viewed).toEqual([]);
    expect(router.dismissAll).toHaveBeenCalled();
  });

  it('shows not-found for a missing id', async () => {
    await renderThemed(<CustomExerciseScreen id="missing" />);
    expect(await screen.findByTestId('custom-missing')).toBeTruthy();
  });
});
