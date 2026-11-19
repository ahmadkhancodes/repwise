#!/usr/bin/env node
/**
 * Suggests free-exercise-db matches for Repwise exercises (review aid, not the source of truth).
 *
 *   node scripts/media/suggest-exercise-matches.mjs <path/to/free-exercise-db/dist/exercises.json> [--all]
 *
 * Prints, for every exercise not yet decided in exercise-match-decisions.json (or every exercise
 * with --all), the top 3 dataset candidates by token similarity on name + aliases, with an
 * equipment-compatibility bonus. A human then records the decision (source id or null) in
 * scripts/media/exercise-match-decisions.json. Nothing here is attached automatically.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const datasetPath = process.argv[2];
if (!datasetPath) {
  console.error('usage: suggest-exercise-matches.mjs <dataset exercises.json> [--all]');
  process.exit(2);
}
const showAll = process.argv.includes('--all');

const ours = JSON.parse(readFileSync(join(root, 'packages/content/exercises.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
let decided = {};
try {
  decided = JSON.parse(readFileSync(join(here, 'exercise-match-decisions.json'), 'utf8')).decisions ?? {};
} catch {
  /* no decisions yet */
}

const STOP = new Set(['the', 'a', 'with', 'on', 'to', 'of', 'and', 'standing', 'exercise']);
const SYN = { dumbbells: 'dumbbell', db: 'dumbbell', bb: 'barbell', kettlebells: 'kettlebell', ups: 'up', raises: 'raise', curls: 'curl', rows: 'row', pulldowns: 'pulldown', extensions: 'extension', flyes: 'fly', flys: 'fly', lunges: 'lunge', squats: 'squat', crunches: 'crunch', dips: 'dip', shrugs: 'shrug' };
const tokens = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP.has(t))
    .map((t) => SYN[t] ?? t);

const EQUIP = {
  barbell: ['barbell'],
  dumbbell: ['dumbbell'],
  kettlebell: ['kettlebells'],
  cable: ['cable'],
  machine: ['machine'],
  smith_machine: ['machine', 'barbell'],
  band: ['bands'],
  bodyweight: ['body only', null],
  ez_bar: ['e-z curl bar', 'barbell'],
  stability_ball: ['exercise ball'],
  foam_roller: ['foam roll'],
  medicine_ball: ['medicine ball'],
};

function score(ex, cand) {
  const ct = new Set(tokens(cand.name));
  let best = 0;
  for (const label of [ex.name, ...ex.aliases]) {
    const ot = new Set(tokens(label));
    const inter = [...ot].filter((t) => ct.has(t)).length;
    const union = new Set([...ot, ...ct]).size;
    best = Math.max(best, union ? inter / union : 0);
  }
  const eq = ex.equipment.flatMap((e) => EQUIP[e] ?? []);
  if (eq.includes(cand.equipment)) best += 0.15;
  return best;
}

for (const ex of ours) {
  if (!showAll && ex.id in decided) continue;
  const top = dataset
    .filter((c) => c.images?.length === 2)
    .map((c) => ({ c, s: score(ex, c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);
  console.log(
    `${ex.id} [${ex.equipment.join(',')}] :: ` +
      top.map(({ c, s }) => `${c.id}(${c.equipment ?? '-'};${s.toFixed(2)})`).join('  '),
  );
}
