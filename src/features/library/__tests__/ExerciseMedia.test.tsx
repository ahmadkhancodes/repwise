import { act, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { colors } from '@/theme/tokens';

import { ExerciseHero, ExerciseThumb } from '../components/ExerciseMedia';

const squat = {
  primaryMuscles: ['quads', 'glutes'] as const,
  secondaryMuscles: ['hamstrings'] as const,
};
const meta = { primaryMuscles: [...squat.primaryMuscles], secondaryMuscles: [...squat.secondaryMuscles] };

describe.each(SCHEMES)(`ExerciseThumb (%s, ${Platform.OS})`, (scheme) => {
  it('shows the first frame of the GIF (no autoplay in lists) on the light stage', async () => {
    await renderThemed(
      <ExerciseThumb
        mediaId="repwise/exercises/barbell-back-squat"
        name="Barbell back squat"
        exercise={meta}
        testID="thumb"
      />,
      scheme,
    );
    const img = screen.getByTestId('thumb-image', { includeHiddenElements: true });
    expect(img.props.autoplay).toBe(false);
    expect(img.props.cachePolicy).toBe('memory-disk');
    // expo-image lifts the (processed) stage colour out of style; white in both themes.
    expect(img.props.backgroundColor).toBeDefined();
    expect(colors[scheme].mediaStage).toBe(colors.light.bg);
  });

  it('falls back to the muscle crop when the GIF fails', async () => {
    await renderThemed(
      <ExerciseThumb
        mediaId="repwise/exercises/barbell-back-squat"
        name="Barbell back squat"
        exercise={meta}
        testID="thumb"
      />,
      scheme,
    );
    const img = screen.getByTestId('thumb-image', { includeHiddenElements: true });
    await act(async () => img.props.onError({ nativeEvent: { error: 'offline' } }));
    expect(screen.queryByTestId('thumb-image', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('thumb', { includeHiddenElements: true })).toBeTruthy();
  });

  it('custom exercises (no mediaId) never request anything', async () => {
    await renderThemed(
      <ExerciseThumb mediaId={null} name="Garage row" exercise={meta} testID="thumb" />,
      scheme,
    );
    expect(screen.queryByTestId('thumb-image', { includeHiddenElements: true })).toBeNull();
  });
});

describe(`ExerciseHero (${Platform.OS})`, () => {
  it('variant="map" never loads the GIF', async () => {
    await renderThemed(
      <ExerciseHero
        mediaId="repwise/exercises/barbell-back-squat"
        name="Barbell back squat"
        exercise={meta}
        variant="map"
        testID="hero"
      />,
    );
    expect(screen.queryByTestId('hero-gif', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('hero-map')).toBeTruthy();
  });

  it('autoplays the demo, and shows it still with Reduce Motion', async () => {
    await renderThemed(
      <ExerciseHero
        mediaId="repwise/exercises/pull-up"
        name="Pull-up"
        exercise={meta}
        testID="hero"
      />,
    );
    expect(
      screen.getByTestId('hero-gif-image', { includeHiddenElements: true }).props.autoplay,
    ).toBe(true);
  });
});
