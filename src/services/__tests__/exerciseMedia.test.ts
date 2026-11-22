import { Image } from 'expo-image';
import { Platform } from 'react-native';

import exercises from '../../../packages/content/exercises.json';
import mediaMap from '../../../packages/content/exercise_media.json';
import v1 from '../../../packages/content/exercisedb_v1.json';
import {
  DEFAULT_MEDIA_BASE,
  __resetExerciseMediaForTests,
  gifForMediaId,
  gifUrlFor,
  gifUrlsForExercises,
  mediaBase,
  mediaFor,
  prefetchExerciseMedia,
  v1IdForExercise,
  v1IdForMediaId,
} from '../exerciseMedia';

const v1ById = new Map(
  (v1 as { exerciseId: string; gifUrl: string | null }[]).map((e) => [e.exerciseId, e]),
);
const map = mediaMap.exercises as Record<string, string | null>;

beforeEach(() => __resetExerciseMediaForTests());

describe(`exerciseMedia (${Platform.OS})`, () => {
  describe('the hand-checked map (packages/content/exercise_media.json)', () => {
    it('has an entry for every engine exercise and nothing else', () => {
      expect(Object.keys(map).sort()).toEqual(exercises.map((e) => e.id).sort());
    });

    it('only points at V1 exercises that HAVE a GIF on our CDN', () => {
      for (const [id, v1Id] of Object.entries(map)) {
        if (v1Id === null) continue;
        const rec = v1ById.get(v1Id);
        expect({ id, found: Boolean(rec) }).toEqual({ id, found: true });
        expect({ id, gif: rec!.gifUrl }).toEqual({
          id,
          gif: `${DEFAULT_MEDIA_BASE}/exercisedb/v1/gifs/${v1Id}.gif`,
        });
      }
    });

    it('covers the big gym lifts', () => {
      const core = [
        'barbell-back-squat',
        'barbell-bench-press',
        'conventional-deadlift',
        'romanian-deadlift',
        'overhead-press',
        'barbell-row',
        'lat-pulldown',
        'pull-up',
        'seated-cable-row',
        'leg-press',
        'pec-deck',
        'dumbbell-curl',
        'triceps-pushdown',
        'dumbbell-lateral-raise',
        'face-pull',
        'lying-leg-curl',
        'leg-extension',
        'hip-thrust',
      ];
      for (const id of core) expect({ id, gif: v1IdForExercise(id) !== null }).toEqual({ id, gif: true });
      expect(Object.values(map).filter(Boolean).length).toBeGreaterThanOrEqual(180);
    });
  });

  describe('mediaBase', () => {
    it('uses EXPO_PUBLIC_MEDIA_BASE when it is a clean https URL', () => {
      expect(mediaBase('https://cdn.repwise.app/media/')).toBe('https://cdn.repwise.app/media');
    });
    it.each([undefined, '', 'http://cdn.example.com', 'javascript:alert(1)', 'https://a b'])(
      'falls back to our host for %p',
      (v) => expect(mediaBase(v)).toBe(DEFAULT_MEDIA_BASE),
    );
  });

  describe('URLs', () => {
    it('builds <base>/exercisedb/v1/gifs/<id>.gif', () => {
      expect(gifUrlFor('qXTaZnJ', 'https://x.test')).toBe('https://x.test/exercisedb/v1/gifs/qXTaZnJ.gif');
    });
    it('rejects unsafe ids (no URL injection)', () => {
      for (const bad of ['', '../x', 'a/b', 'a?b', null, undefined]) expect(gifUrlFor(bad)).toBeNull();
    });
    it('reads both kinds of mediaId', () => {
      expect(v1IdForMediaId('repwise/exercises/barbell-back-squat')).toBe('qXTaZnJ');
      expect(v1IdForMediaId('exercisedb/0lQnxMZ')).toBe('0lQnxMZ');
      expect(v1IdForMediaId('exercisedb/../../x')).toBeNull();
      expect(v1IdForMediaId('repwise/recipes/oats')).toBeNull();
      expect(v1IdForMediaId(null)).toBeNull();
      expect(gifForMediaId('repwise/exercises/cat-cow')).toBeNull();
    });
  });

  describe('mediaFor', () => {
    it('returns the GIF and the muscles for an engine exercise', () => {
      const m = mediaFor({ id: 'barbell-bench-press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] });
      expect(m.gifUrl).toMatch(/\/exercisedb\/v1\/gifs\/[A-Za-z0-9]+\.gif$/);
      expect(m.muscles).toEqual({ primary: ['chest'], secondary: ['triceps'] });
    });
    it('returns null (muscle map) for unmapped, custom and unknown exercises', () => {
      expect(mediaFor({ id: 'cat-cow' }).gifUrl).toBeNull();
      expect(mediaFor({ id: '0190f0a0-custom' }).gifUrl).toBeNull();
      expect(mediaFor({ id: 'not-an-exercise' }).muscles).toEqual({ primary: [], secondary: [] });
    });
    it('accepts library-only exercisedb-<id> ids', () => {
      expect(mediaFor({ id: 'exercisedb-0lQnxMZ' }, 'https://x.test').gifUrl).toBe(
        'https://x.test/exercisedb/v1/gifs/0lQnxMZ.gif',
      );
    });
  });

  describe('prefetch', () => {
    it('de-duplicates and skips exercises without a GIF', () => {
      const urls = gifUrlsForExercises(['barbell-back-squat', 'barbell-back-squat', 'cat-cow', 'pull-up']);
      expect(urls).toHaveLength(2);
    });

    it('warms the memory-disk cache once per URL per run', async () => {
      const spy = jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
      expect(await prefetchExerciseMedia(['barbell-back-squat', 'cat-cow'])).toBe(1);
      expect(spy).toHaveBeenCalledWith([expect.stringMatching(/qXTaZnJ\.gif$/)], 'memory-disk');
      expect(await prefetchExerciseMedia(['barbell-back-squat'])).toBe(0);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('never throws offline, and retries next time', async () => {
      const spy = jest.spyOn(Image, 'prefetch').mockRejectedValueOnce(new Error('offline'));
      await expect(prefetchExerciseMedia(['pull-up'])).resolves.toBe(1);
      spy.mockResolvedValue(true);
      expect(await prefetchExerciseMedia(['pull-up'])).toBe(1);
      spy.mockRestore();
    });
  });
});
