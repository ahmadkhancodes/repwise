import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import * as catalogService from '@/services/catalog';
import { getCatalog, resetCatalogForTests } from '@/services/catalog';

import { EMPTY_DRAFT } from '../logic/customExercise';
import { useLibraryPrefs } from '../prefs';
import { createCustomExercise } from '../repo';
import { LibraryScreen } from '../screens/LibraryScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

const total = () => getCatalog().exercises.length;

beforeEach(async () => {
  resetDbForTests();
  await migrateDb();
  useLibraryPrefs.setState({ favourites: [], viewed: [] });
  jest.mocked(router.push).mockClear();
  getCatalog();
});

describe.each(SCHEMES)(`LibraryScreen (%s, ${Platform.OS})`, (scheme) => {
  it('renders search, count and the catalogue list', async () => {
    await renderThemed(<LibraryScreen />, scheme);
    expect(screen.getByTestId('screen-library')).toBeTruthy();
    expect(screen.getByPlaceholderText(`Search ${total()} exercises`)).toBeTruthy();
    expect(screen.getByText('All exercises')).toBeTruthy();
    expect(screen.getByTestId('library-count').props.children).toBe(total());
    expect(await screen.findByTestId('exercise-row-ab-wheel-rollout')).toBeTruthy();
  });
});

describe('LibraryScreen', () => {
  it('shows a skeleton while the catalogue loads, then the list', async () => {
    resetCatalogForTests();
    let release: (c: catalogService.Catalog) => void = () => undefined;
    const spy = jest
      .spyOn(catalogService, 'loadCatalog')
      .mockReturnValueOnce(new Promise((r) => (release = r)));
    await renderThemed(<LibraryScreen />);
    expect(screen.getByTestId('library-loading')).toBeTruthy();
    spy.mockRestore();
    await act(async () => release(getCatalog()));
    expect(await screen.findByTestId('library-list')).toBeTruthy();
  });

  it('shows an error with retry when the catalogue cannot load', async () => {
    resetCatalogForTests();
    const spy = jest.spyOn(catalogService, 'loadCatalog').mockRejectedValueOnce(new Error('boom'));
    await renderThemed(<LibraryScreen />);
    expect(await screen.findByTestId('library-error')).toBeTruthy();
    spy.mockRestore();
    await fireEvent.press(screen.getByTestId('library-error-action'));
    expect(await screen.findByTestId('library-list')).toBeTruthy();
  });

  it('searches as you type and opens an exercise', async () => {
    await renderThemed(<LibraryScreen />);
    await fireEvent.changeText(screen.getByTestId('library-search'), 'back squat');
    expect(await screen.findByText('Results')).toBeTruthy();
    expect(screen.getByTestId('exercise-row-barbell-back-squat')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('exercise-row-barbell-back-squat'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercise/[id]',
      params: { id: 'barbell-back-squat' },
    });
  });

  it('shows the no-results state and clears it', async () => {
    await renderThemed(<LibraryScreen />);
    await fireEvent.changeText(screen.getByTestId('library-search'), 'qqqzzz');
    expect(await screen.findByTestId('library-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('library-empty-action'));
    expect(await screen.findByText('All exercises')).toBeTruthy();
  });

  it('applies filters from the sheet and removes them from the chip row', async () => {
    await renderThemed(<LibraryScreen />);
    await fireEvent.press(screen.getByTestId('library-search-filters'));
    await fireEvent.press(screen.getByTestId('filter-muscle-chest'));
    await fireEvent.press(screen.getByTestId('filter-equipment-dumbbell'));
    const apply = screen.getByTestId('filter-apply');
    expect(screen.getByText(/^Show \d+ exercises?$/)).toBeTruthy();
    await fireEvent.press(apply);
    expect(screen.getByRole('button', { name: 'Filters, 2 on' })).toBeTruthy();
    expect(screen.getByTestId('muscle-chip-chest')).toBeChecked();
    expect(screen.getByTestId('active-filter-e:dumbbell')).toBeTruthy();
    const count = screen.getByTestId('library-count').props.children as number;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(total());
    await fireEvent.press(screen.getByTestId('muscle-chip-chest'));
    await fireEvent.press(screen.getByTestId('active-filter-e:dumbbell'));
    expect(screen.queryByTestId('active-filter-e:dumbbell')).toBeNull();
    expect(screen.getByTestId('muscle-chip-chest')).not.toBeChecked();
    expect(screen.getByText('All exercises')).toBeTruthy();
  });

  it('muscle chips filter in one tap', async () => {
    await renderThemed(<LibraryScreen />);
    await fireEvent.press(screen.getByTestId('muscle-chip-back'));
    expect(screen.getByText('Results')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeTruthy();
    const count = screen.getByTestId('library-count').props.children as number;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(total());
    await fireEvent.press(screen.getByTestId('muscle-chip-back'));
    expect(screen.getByText('All exercises')).toBeTruthy();
  });

  it('shows row-shaped skeletons while the catalogue loads', async () => {
    const { LibrarySkeleton } = jest.requireActual('../screens/LibraryScreen');
    await renderThemed(<LibrarySkeleton testID="sk" rows={3} />);
    expect(screen.getByLabelText('Loading exercises')).toBeTruthy();
  });

  it('clears the search text from the clear button', async () => {
    await renderThemed(<LibraryScreen />);
    await fireEvent.changeText(screen.getByTestId('library-search'), 'qqqzzz');
    expect(await screen.findByTestId('library-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('library-search-clear'));
    expect(await screen.findByText('All exercises')).toBeTruthy();
    expect(screen.getByTestId('library-search').props.value).toBe('');
  });

  it('favourites appear on their own shelf', async () => {
    await renderThemed(<LibraryScreen />);
    expect(screen.queryByTestId('shelf-favourites')).toBeNull();
    await fireEvent.press(await screen.findByTestId('favourite-ab-wheel-rollout'));
    expect(useLibraryPrefs.getState().favourites).toEqual(['ab-wheel-rollout']);
    expect(await screen.findByTestId('shelf-favourites-ab-wheel-rollout')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Remove Ab wheel rollout from favourites' }),
    ).toBeSelected();
  });

  it('recently opened exercises appear under Recently used', async () => {
    useLibraryPrefs.getState().markViewed('barbell-back-squat', 5);
    await renderThemed(<LibraryScreen />);
    expect(await screen.findByTestId('shelf-recent-barbell-back-squat')).toBeTruthy();
  });

  it('lists my custom exercises live, marked as mine, and creates new ones', async () => {
    await renderThemed(<LibraryScreen />);
    await act(async () => {
      createCustomExercise({
        ...EMPTY_DRAFT,
        name: 'Aaa garage row',
        primaryMuscles: ['lats'],
        equipment: ['dumbbell'],
      });
    });
    await waitFor(() => expect(screen.getByText('Yours')).toBeTruthy());
    expect(screen.getByTestId('library-count').props.children).toBe(total() + 1);
    await fireEvent.press(screen.getByTestId('library-create'));
    expect(router.push).toHaveBeenCalledWith('/exercise/custom');
  });
});
