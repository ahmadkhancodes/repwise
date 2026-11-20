import { StyleSheet } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { saveProfile } from '@/features/settings/repo';
import { sessionsRepo } from '@/features/workout/repo';
import { useBillingStore } from '@/services/billing';
import { useToastStore } from '@/ui';

import { BodyScreen } from '../screens/BodyScreen';
import { ExerciseRecordsScreen } from '../screens/ExerciseRecordsScreen';
import { HeatmapScreen } from '../screens/HeatmapScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { LogBodyScreen } from '../screens/LogBodyScreen';
import { PhotosScreen } from '../screens/PhotosScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { RecordsScreen } from '../screens/RecordsScreen';
import { TrendsScreen } from '../screens/TrendsScreen';
import { WrappedScreen } from '../screens/WrappedScreen';
import * as repo from '../repo';

import { at } from './fixtures';
import { freshDb, seedBody, seedNutrition, seedPhotos, seedTraining } from './seed';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
}));

const mockCatalog = {
  exercises: [
    {
      id: 'bench',
      name: 'Bench Press',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps', 'front_delts'],
    },
    { id: 'squat', name: 'Back Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'] },
    { id: 'curl', name: 'Curl', primaryMuscles: ['biceps'], secondaryMuscles: [] },
  ],
};
let mockCatalogReady = true;
jest.mock('@/services/catalog', () => ({
  useCatalog: () =>
    mockCatalogReady
      ? {
          exercises: mockCatalog.exercises,
          exerciseById: new Map(mockCatalog.exercises.map((e) => [e.id, e])),
        }
      : null,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('expo-file-system', () => require('./mocks').fileSystemMock());
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///tmp/cam.jpg' }],
  })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///tmp/IMG_2.HEIC' }],
  })),
  CameraType: { back: 'back', front: 'front' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
const picker = require('expo-image-picker') as {
  launchImageLibraryAsync: jest.Mock;
  requestCameraPermissionsAsync: jest.Mock;
};
const sharing = require('expo-sharing') as { shareAsync: jest.Mock };
const skia = require('@shopify/react-native-skia') as { makeImageFromView: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

const NOW = at(19, 12); // Thu 19 Nov 2026, noon local

beforeEach(async () => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  jest.clearAllMocks();
  mockParams = {};
  mockCatalogReady = true;
  useBillingStore.setState({ paymentsEnabled: false });
  await freshDb();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Give charts a width (onLayout) so Skia + labels render. */
async function layout(testID: string, width = 320, height = 200) {
  await fireEvent(screen.getByTestId(testID), 'layout', {
    nativeEvent: { layout: { width, height, x: 0, y: 0 } },
  });
}

describe.each(SCHEMES)('Progress home (%s)', (scheme) => {
  it('shows a skeleton while loading, then the empty state', async () => {
    mockCatalogReady = false;
    const view = await renderThemed(<ProgressScreen />, scheme);
    expect(screen.getByTestId('progress-skeleton')).toBeTruthy();
    mockCatalogReady = true;
    await view.rerender(<ProgressScreen />);
    expect(await screen.findByTestId('progress-empty')).toBeTruthy();
    expect(screen.getByTestId('progress-calendar')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('progress-log-weight'));
    expect(mockRouter.push).toHaveBeenCalledWith('/progress/log');
  });

  it('shows streak, calendar workouts and recent PRs from real data', async () => {
    seedTraining();
    seedBody();
    await renderThemed(<ProgressScreen />, scheme);
    expect(await screen.findByTestId('progress-streak')).toBeTruthy();
    expect(screen.getByLabelText('Streak, 2 weeks')).toBeTruthy();
    expect(screen.getByLabelText('9, workout done')).toBeTruthy();
    expect(screen.getByTestId('pr-0')).toHaveTextContent(/Bench Press/);
    expect(screen.getByTestId('nav-body')).toHaveTextContent(/80\.1 kg/);
    expect(screen.getByTestId('nav-heatmap')).toHaveTextContent(/Recovery(All fresh|\d+ muscles? worked)/);
    expect(screen.getByTestId('nav-wrapped')).toHaveTextContent(/November Wrapped/);
    expect(screen.getByTestId('nav-photos')).toHaveTextContent(/Progress photos/);
    await fireEvent.press(screen.getByTestId('nav-heatmap'));
    expect(mockRouter.push).toHaveBeenCalledWith('/progress/heatmap');
    await fireEvent.press(screen.getByTestId('nav-wrapped'));
    expect(mockRouter.push).toHaveBeenCalledWith('/progress/wrapped');
    await fireEvent.press(screen.getByTestId('pr-0'));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringMatching(/^\/progress\/exercise\//));
  });
});

describe('Progress home gating', () => {
  it('free users can look back one month; older months show a locked state', async () => {
    useBillingStore.setState({ paymentsEnabled: true });
    await renderThemed(<ProgressScreen />);
    await screen.findByTestId('progress-empty');
    await fireEvent.press(screen.getByTestId('progress-calendar-prev'));
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.queryByTestId('progress-month-locked')).toBeNull();
    await fireEvent.press(screen.getByTestId('progress-calendar-prev'));
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByTestId('progress-month-locked')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
    await fireEvent.press(screen.getByTestId('progress-month-unlock'));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
    await fireEvent.press(screen.getByTestId('progress-calendar-next'));
    expect(screen.queryByTestId('progress-month-locked')).toBeNull();
  });
});

describe('Log body (S30 add)', () => {
  it('saves a weigh-in for today in two taps and closes', async () => {
    await renderThemed(<LogBodyScreen />);
    await fireEvent.changeText(screen.getByTestId('log-weight'), '82,4');
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(repo.bodyMetricsRepo.list()).toEqual([
      expect.objectContaining({ date: '2026-11-19', weightKg: 82.4 }),
    ]);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(useToastStore.getState().current?.message).toBe('Weight saved');
  });

  it('converts pounds and inches, and saves to yesterday', async () => {
    saveProfile({ units: 'imperial' });
    await renderThemed(<LogBodyScreen />);
    expect(screen.getByText('Weight (lb)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('log-day-yesterday'));
    await fireEvent.changeText(screen.getByTestId('log-weight'), '220.5');
    await fireEvent.press(screen.getByTestId('log-show-measures'));
    await fireEvent.changeText(screen.getByTestId('log-waistCm'), '34');
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(repo.bodyMetricsRepo.list()[0]).toMatchObject({
      date: '2026-11-18',
      weightKg: 100.02,
      waistCm: 86.36,
    });
  });

  it('validates input and never saves junk', async () => {
    await renderThemed(<LogBodyScreen />);
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(screen.getByTestId('log-form-error')).toHaveTextContent(
      'Add your weight or a measurement',
    );
    await fireEvent.changeText(screen.getByTestId('log-weight'), '8');
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(screen.getByText('Enter a weight like 82.4')).toBeTruthy();
    expect(repo.bodyMetricsRepo.list()).toHaveLength(0);
  });

  it('a second entry the same day updates that day', async () => {
    repo.saveBodyMetric('2026-11-19', { weightKg: 80 });
    repo.saveBodyMetric('2026-11-19', { waistCm: 84 });
    expect(repo.bodyMetricsRepo.list()).toEqual([
      expect.objectContaining({ weightKg: 80, waistCm: 84 }),
    ]);
  });
});

describe.each(SCHEMES)('Body (S30) (%s)', (scheme) => {
  it('trend number, chart and measurements', async () => {
    seedBody();
    await renderThemed(<BodyScreen />, scheme);
    expect(await screen.findByLabelText('7-day average, 80.1 kg')).toBeTruthy();
    expect(screen.getByTestId('weight-change')).toHaveTextContent('+0.1 kg');
    await layout('weight-chart-plot');
    await fireEvent(screen.getByTestId('weight-chart-plot'), 'responderGrant', {
      nativeEvent: { locationX: 0 },
    });
    expect(screen.getByTestId('weight-chart-callout')).toHaveTextContent('1 Nov · 80 kg · 80 kg');
    await fireEvent.press(screen.getByTestId('body-tab-measurements'));
    expect(screen.getByTestId('measure-waistCm')).toHaveTextContent(/84 cm/);
    expect(screen.getByTestId('measure-waistCm')).toHaveTextContent(/−1 cm in this range/);
  });
});

describe('Body states', () => {
  it('empty, error and delete with undo', async () => {
    const { unmount } = await renderThemed(<BodyScreen />);
    expect(await screen.findByTestId('body-empty')).toBeTruthy();
    await unmount();

    const spy = jest
      .spyOn(repo, 'useLiveBody')
      .mockReturnValue({ data: [], loading: false, error: new Error('x') });
    const second = await renderThemed(<BodyScreen />);
    expect(screen.getByTestId('body-error')).toBeTruthy();
    spy.mockRestore();
    await second.unmount();

    seedBody();
    await renderThemed(<BodyScreen />);
    await fireEvent.press(await screen.findByTestId('entry-delete-2026-11-08'));
    expect(repo.bodyMetricsRepo.list()).toHaveLength(3);
    await act(async () => useToastStore.getState().current?.onAction?.());
    expect(repo.bodyMetricsRepo.list().map((r) => r.date)).toContain('2026-11-08');
  });

  it('longer ranges are Pro (paywall for free users)', async () => {
    useBillingStore.setState({ paymentsEnabled: true });
    seedBody();
    await renderThemed(<BodyScreen />);
    await screen.findByTestId('weight-chart');
    await fireEvent.press(screen.getByTestId('range-picker-6M'));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
  });
});

describe.each(SCHEMES)('Strength (S31) (%s)', (scheme) => {
  it('lists exercises and PRs', async () => {
    seedTraining();
    await renderThemed(<RecordsScreen />, scheme);
    expect(await screen.findByTestId('exercise-bench')).toHaveTextContent(/83\.3 kg/);
    await fireEvent.press(screen.getByTestId('records-tab-prs'));
    expect(screen.getByTestId('pr-row-0')).toHaveTextContent(/e1RM 83\.3 kg/);
    expect(screen.getByTestId('pr-row-1')).toHaveTextContent(/62\.5 kg × 8/);
    await fireEvent.press(screen.getByTestId('pr-row-1'));
    expect(mockRouter.push).toHaveBeenCalledWith('/progress/exercise/bench');
  });

  it('exercise detail: best e1RM, chart, records', async () => {
    seedTraining();
    mockParams = { id: 'bench' };
    await renderThemed(<ExerciseRecordsScreen />, scheme);
    expect(await screen.findByLabelText('Best estimated 1RM, 83.3 kg')).toBeTruthy();
    expect(screen.getByTestId('screen-progress-exercise-title')).toHaveTextContent('Bench Press');
    expect(screen.getByTestId('exercise-chart')).toBeTruthy();
    expect(screen.getByTestId('exercise-pr-0')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('exercise-metric-volume'));
    await layout('exercise-chart-plot');
    await fireEvent(screen.getByTestId('exercise-chart-plot'), 'responderGrant', {
      nativeEvent: { locationX: 1000 },
    });
    expect(screen.getByTestId('exercise-chart-callout')).toHaveTextContent('9 Nov · 625 kg');
  });
});

describe('Strength empty', () => {
  it('shows empty states', async () => {
    await renderThemed(<RecordsScreen />);
    expect(await screen.findByTestId('records-empty')).toBeTruthy();
  });
});

describe.each(SCHEMES)('Heatmap (S32) (%s)', (scheme) => {
  it('lists worked muscles and selects one', async () => {
    seedTraining();
    await renderThemed(<HeatmapScreen now={at(10, 8)} />, scheme);
    expect(await screen.findByTestId('body-map')).toBeTruthy();
    expect(screen.getByTestId('heatmap-focus')).toHaveTextContent(/Quads/);
    await fireEvent.press(screen.getByTestId('muscle-chest'));
    expect(screen.getByTestId('heatmap-focus')).toHaveTextContent(/Chest/);
    expect(screen.getByTestId('heatmap-focus')).toHaveTextContent(/2 hard sets in 7 days/);
    // Tap on the figure: left quad in view units (40, 120) at the default 356 / 212 scale.
    const k = 356 / 212;
    await fireEvent(screen.getByTestId('body-map'), 'responderRelease', {
      nativeEvent: { locationX: 40 * k, locationY: 120 * k },
    });
    expect(screen.getByTestId('heatmap-focus')).toHaveTextContent(/Quads/);
  });

  it('switches to the back view when a back muscle is picked', async () => {
    seedTraining();
    await renderThemed(<HeatmapScreen now={at(10, 8)} />, scheme);
    await fireEvent.press(await screen.findByTestId('muscle-glutes'));
    expect(screen.getByTestId('heatmap-view-back')).toBeSelected();
  });
});

describe('Heatmap empty', () => {
  it('all fresh', async () => {
    await renderThemed(<HeatmapScreen now={NOW} />);
    expect(await screen.findByTestId('heatmap-empty')).toBeTruthy();
  });
});

describe.each(SCHEMES)('Trends (%s)', (scheme) => {
  it('volume, adherence and calories', async () => {
    seedTraining();
    seedNutrition();
    await renderThemed(<TrendsScreen />, scheme);
    expect(await screen.findByTestId('volume-chart')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('volume-chest'));
    await layout('volume-chart-plot');
    await fireEvent(screen.getByTestId('volume-chart-plot'), 'responderGrant', {
      nativeEvent: { locationX: 150 },
    });
    expect(screen.getByTestId('volume-chart-callout')).toHaveTextContent(/sets/);
    expect(screen.getByTestId('adherence-detail')).toHaveTextContent(
      'Week of 16 Nov: 0/1 workouts · 0/0 meals',
    );
    expect(screen.getByTestId('calories-summary')).toHaveTextContent(
      'Avg 1125 kcal · 1 of 2 logged days within 10% of target',
    );
  });

  it('empty states', async () => {
    await renderThemed(<TrendsScreen />, scheme);
    expect(await screen.findByTestId('volume-empty')).toBeTruthy();
    expect(screen.getByTestId('adherence-empty')).toBeTruthy();
    expect(screen.getByTestId('calories-empty')).toBeTruthy();
  });
});

describe.each(SCHEMES)('Photos (S33) (%s)', (scheme) => {
  it('adds a photo into private storage from the library', async () => {
    await renderThemed(<PhotosScreen />, scheme);
    expect(await screen.findByTestId('photos-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('photos-add'));
    await fireEvent.press(screen.getByTestId('pose-side'));
    await fireEvent.press(screen.getByTestId('photos-library'));
    await waitFor(() => expect(repo.photosRepo.list()).toHaveLength(1));
    const row = repo.photosRepo.list()[0]!;
    expect(row).toMatchObject({ date: '2026-11-19', pose: 'side' });
    expect(row.localUri).toMatch(/^progress-photos\/[0-9a-f-]+\.heic$/);
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'] }),
    );
  });

  it('compares two photos and shares the comparison', async () => {
    seedPhotos();
    await renderThemed(<PhotosScreen />, scheme);
    await fireEvent.press(await screen.findByTestId('photos-mode-compare'));
    expect(screen.getByTestId('compare-days')).toHaveTextContent('70 days apart');
    await layout('compare-slider', 300, 400);
    await fireEvent(screen.getByTestId('compare-slider'), 'responderMove', {
      nativeEvent: { locationX: 75 },
    });
    expect(screen.getByTestId('compare-slider').props.accessibilityValue).toEqual({
      text: '25% of the newer photo shown',
    });
    await fireEvent.press(screen.getByTestId('compare-share'));
    await waitFor(() =>
      expect(sharing.shareAsync).toHaveBeenCalledWith(
        expect.stringMatching(/^file:\/\/\/cache\/repwise-compare-2026-11-19\.png$/),
        expect.objectContaining({ mimeType: 'image/png' }),
      ),
    );
    expect(skia.makeImageFromView).toHaveBeenCalled();
  });
});

describe('Photos gating and delete', () => {
  it('is Pro: free users see the lock with a way to the paywall', async () => {
    useBillingStore.setState({ paymentsEnabled: true });
    await renderThemed(<PhotosScreen />);
    await fireEvent.press(screen.getByText('See Pro'));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
  });

  it('opens a photo and deletes it', async () => {
    seedPhotos();
    await renderThemed(<PhotosScreen />);
    await fireEvent.press(await screen.findByTestId('photo-ph1'));
    await fireEvent.press(screen.getByTestId('photo-delete'));
    expect(repo.photosRepo.list().map((p) => p.id)).toEqual(['ph2']);
  });

  it('camera permission denied is handled calmly', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await renderThemed(<PhotosScreen />);
    await fireEvent.press(await screen.findByTestId('photos-add'));
    await fireEvent.press(screen.getByTestId('photos-camera'));
    await waitFor(() =>
      expect(useToastStore.getState().current?.message).toMatch(/Camera access is off/),
    );
    expect(repo.photosRepo.list()).toHaveLength(0);
  });
});

describe.each(SCHEMES)('Wrapped (S34) (%s)', (scheme) => {
  it('builds the month story and shares a card', async () => {
    seedTraining();
    seedNutrition();
    await renderThemed(<WrappedScreen />, scheme);
    expect(await screen.findByTestId('wrapped-card-intro')).toHaveTextContent(/Your November/);
    expect(screen.getByTestId('wrapped-card-volume')).toHaveTextContent(/3,085 kg/);
    expect(screen.getByTestId('wrapped-card-prs')).toHaveTextContent(/2 PRs/);
    expect(screen.getByTestId('wrapped-card-muscle')).toHaveTextContent(/Chest/);
    expect(screen.getByTestId('wrapped-next')).toBeDisabled();
    // Colourful story: cards rotate backgrounds instead of one inverse slab.
    const bg = (k: string) =>
      StyleSheet.flatten(screen.getByTestId(`wrapped-card-${k}`).props.style).backgroundColor;
    expect(new Set(['intro', 'workouts', 'volume', 'prs'].map(bg)).size).toBe(4);
    expect(screen.getByTestId('wrapped-progress')).toBeTruthy();
    expect(
      screen.getByTestId('wrapped-brand-intro', { includeHiddenElements: true }),
    ).toHaveTextContent('Repwise');
    await fireEvent.press(screen.getByTestId('wrapped-share'));
    await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalled());
  });

  it('empty month', async () => {
    seedTraining();
    await renderThemed(<WrappedScreen />, scheme);
    await fireEvent.press(await screen.findByTestId('wrapped-prev'));
    await fireEvent.press(screen.getByTestId('wrapped-prev'));
    expect(screen.getByTestId('wrapped-month')).toHaveTextContent('September 2026');
    expect(screen.getByTestId('wrapped-empty')).toBeTruthy();
  });

  it('free users: months older than last month lock, the same rule as Progress (P2-12)', async () => {
    useBillingStore.setState({ paymentsEnabled: true });
    seedTraining();
    await renderThemed(<WrappedScreen />, scheme);
    await fireEvent.press(await screen.findByTestId('wrapped-prev'));
    expect(screen.queryByTestId('wrapped-locked')).toBeNull();
    await fireEvent.press(screen.getByTestId('wrapped-prev'));
    expect(screen.getByTestId('wrapped-locked')).toHaveTextContent(/September is in your history/);
    expect(screen.queryByTestId('wrapped-share')).toBeNull();
  });
});

describe.each(SCHEMES)('History (S36) (%s)', (scheme) => {
  it('lists workouts and food days newest first', async () => {
    seedTraining();
    seedNutrition();
    await renderThemed(<HistoryScreen />, scheme);
    expect(await screen.findByTestId('history-w-s3')).toHaveTextContent(/Push/);
    expect(screen.getByTestId('history-f-2026-11-18')).toHaveTextContent(/300 kcal/);
    expect(screen.queryByTestId('history-more')).toBeNull();
    // One row design with Train (N4): rows open the summary / the day's food log.
    await fireEvent.press(screen.getByTestId('history-w-s3'));
    expect(mockRouter.push).toHaveBeenCalledWith('/workout/s3/summary');
    await fireEvent.press(screen.getByTestId('history-f-2026-11-18'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/meal/day/[date]',
      params: { date: '2026-11-18' },
    });
  });
});

describe('History states', () => {
  it('empty, and free users see 30 days', async () => {
    const first = await renderThemed(<HistoryScreen />);
    expect(await screen.findByTestId('history-empty')).toBeTruthy();
    await first.unmount();
    useBillingStore.setState({ paymentsEnabled: true });
    seedTraining();
    sessionsRepo.insert({
      id: 'old',
      date: '2026-09-01',
      title: 'Old',
      status: 'done',
      startedAt: null,
      endedAt: null,
      pausedMs: 0,
    });
    await renderThemed(<HistoryScreen />);
    expect(await screen.findByTestId('history-more')).toHaveTextContent(/1 older day/);
    expect(screen.queryByTestId('history-w-old')).toBeNull();
  });
});
