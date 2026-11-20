/** Declares the per-property tests for one shard of generated profiles. */
import { runPlanProperties, summarise, type Property, type RunStats } from './property';

/**
 * Profiles per shard; 4 shards (seeds 101–104) = 2,000 profiles per property. ENGINE_PROPERTY_SHARD
 * shrinks it for a quick local loop; the committed default (and CI) is 500.
 */
declare const process: { env: Record<string, string | undefined> };
export const SHARD_SIZE = Number(process.env.ENGINE_PROPERTY_SHARD ?? 500);
/** Generous regression guard for the mean plan time inside jest (the measured mean is in docs/ENGINE_QA.md). */
export const MEAN_MS_GUARD = 400;

export function planPropertySuite(seed: number): void {
  let stats: RunStats;
  beforeAll(async () => {
    stats = await runPlanProperties(seed, SHARD_SIZE);
  }, 600_000);

  const props: [Property, string][] = [
    ['no_throw', 'never throws'],
    ['finite', 'no NaN, Infinity or negative number anywhere in the plan'],
    ['nutrition', 'kcal ≥ floor and ≤ ceiling; macros add up to kcal; whole grams'],
    ['meals', 'no allergen, diet, dislike or slot violation; portions in bounds; totals add up; empty days explained'],
    ['sessions', 'equipment, injuries, level respected; valid prescriptions; ≤ 20 sets/group; no repeat in the week; session validation passes'],
    ['coverage', 'every trainable muscle group gets weekly sets (sessions > 30 min)'],
    ['deterministic', 'same input and seed → identical plan'],
  ];
  test.each(props)(`seed ${seed}: %s — %s`, (prop) => {
    expect(stats.plans + stats.violations.no_throw.length).toBe(SHARD_SIZE);
    expect(stats.violations[prop].slice(0, 3)).toEqual([]);
  });

  test(`seed ${seed}: mean plan time stays under the regression guard`, () => {
    expect(summarise(stats.ms).mean).toBeLessThan(MEAN_MS_GUARD);
  });
}
