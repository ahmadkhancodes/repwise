import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { EXERCISES_WITH_MEDIA, RecipeSchema, exerciseHasMedia, exercises, recipes } from './helpers';

type MapEntry = {
  sourceId: string;
  confidence: 'high' | 'medium';
  start: { url: string; publicId: string };
  end: { url: string; publicId: string };
};
const map = JSON.parse(readFileSync(new URL('../media/exercise-media-map.json', import.meta.url), 'utf8')) as {
  source: { licence: string; commit: string; licenceUrl: string };
  counts: { exercises: number; matched: number; unmatched: number };
  unmatched: string[];
  exercises: Record<string, MapEntry>;
};
const ids = new Set(exercises.map((e) => e.id));

describe('exercise media map', () => {
  it('records a CC0-compatible licence with a pinned proof URL', () => {
    assert.equal(map.source.licence, 'Unlicense');
    assert.match(map.source.commit, /^[0-9a-f]{40}$/);
    assert.ok(map.source.licenceUrl.includes(map.source.commit));
  });

  it('covers every exercise exactly once (matched or listed as unmatched)', () => {
    const matched = Object.keys(map.exercises);
    assert.equal(matched.length + map.unmatched.length, exercises.length);
    assert.equal(map.counts.exercises, exercises.length);
    for (const id of [...matched, ...map.unmatched]) assert.ok(ids.has(id), `unknown exercise ${id}`);
    assert.equal(new Set([...matched, ...map.unmatched]).size, exercises.length);
  });

  it('uses the agreed public ids and commit-pinned HTTPS source URLs', () => {
    for (const [id, m] of Object.entries(map.exercises)) {
      assert.equal(m.start.publicId, `repwise/exercises/${id}`);
      assert.equal(m.end.publicId, `repwise/exercises/${id}-end`);
      for (const u of [m.start.url, m.end.url]) {
        assert.ok(u.startsWith(`https://raw.githubusercontent.com/yuhonas/free-exercise-db/${map.source.commit}/exercises/`), u);
        assert.match(u, /\.jpg$/);
      }
      assert.ok(m.confidence === 'high' || m.confidence === 'medium', id);
    }
  });

  it('exposes exactly the matched exercises to the app', () => {
    assert.deepEqual([...EXERCISES_WITH_MEDIA].sort(), Object.keys(map.exercises).sort());
    for (const id of map.unmatched) assert.equal(exerciseHasMedia(id), false, id);
    assert.equal(exerciseHasMedia('not-an-exercise'), false);
  });
});

describe('recipe media', () => {
  it('accepts recipes with and without a photo (backwards compatible)', () => {
    const r = recipes[0]!;
    assert.ok(RecipeSchema.safeParse({ ...r, mediaId: `repwise/recipes/${r.id}` }).success);
    const { mediaId: _omit, ...withoutPhoto } = r;
    assert.ok(RecipeSchema.safeParse(withoutPhoto).success);
    assert.equal(RecipeSchema.safeParse({ ...r, mediaId: 'repwise/recipes/someone-else' }).success, false);
  });
});
