/**
 * Training split + weekly volume (sheet 28 "Training maths").
 * 2–3 days full body, 4 upper/lower, 5–6 PPL (or the user's choice).
 * Volume: 10–20 hard sets per muscle group per week by experience, starting at the low end,
 * capped by what the user's days × session length can actually hold.
 */
import type { Exercise, Experience, Muscle, Pattern, SplitType } from './schemas';

// ---------------------------------------------------------------------------
// Split choice + templates
// ---------------------------------------------------------------------------

export type SlotRole = 'main' | 'secondary' | 'accessory';

export interface SlotDef {
  /** Stable key; main slots share keys across templates so the block's main lift is reused. */
  key: string;
  pattern: Pattern;
  role: SlotRole;
  /** Required primary muscle (isolation slots). */
  muscle?: Muscle;
}

export interface DayTemplate {
  key: string;
  name: string;
  /** Ordered by priority: short sessions keep the first N slots. */
  slots: SlotDef[];
}

const S = (key: string, pattern: Pattern, role: SlotRole, muscle?: Muscle): SlotDef =>
  muscle ? { key, pattern, role, muscle } : { key, pattern, role };
const iso = (muscle: Muscle): SlotDef => S(`iso_${muscle}`, 'isolation', 'accessory', muscle);
const core = S('core', 'core', 'accessory');

export const TEMPLATES: Record<string, DayTemplate> = {
  full_a: {
    key: 'full_a',
    name: 'Full body A',
    slots: [S('squat_main', 'squat', 'main'), S('push_h_main', 'push_h', 'main'), S('pull_v_2', 'pull_v', 'secondary'), S('hinge_acc', 'hinge', 'accessory'), iso('side_delts'), iso('biceps'), core, iso('calves')],
  },
  full_b: {
    key: 'full_b',
    name: 'Full body B',
    slots: [S('hinge_main', 'hinge', 'main'), S('push_v_main', 'push_v', 'main'), S('pull_h_2', 'pull_h', 'secondary'), S('lunge_acc', 'lunge', 'accessory'), S('push_h_acc', 'push_h', 'accessory'), iso('triceps'), iso('hamstrings'), core],
  },
  full_c: {
    key: 'full_c',
    name: 'Full body C',
    slots: [S('push_h_main', 'push_h', 'main'), S('pull_h_main', 'pull_h', 'main'), S('squat_acc', 'squat', 'accessory'), S('hinge_acc', 'hinge', 'accessory'), iso('rear_delts'), iso('biceps'), iso('triceps'), core],
  },
  upper_a: {
    key: 'upper_a',
    name: 'Upper A',
    slots: [S('push_h_main', 'push_h', 'main'), S('pull_h_main', 'pull_h', 'main'), S('push_v_2', 'push_v', 'secondary'), S('pull_v_2', 'pull_v', 'secondary'), iso('biceps'), iso('triceps'), iso('side_delts'), iso('rear_delts')],
  },
  lower_a: {
    key: 'lower_a',
    name: 'Lower A',
    slots: [S('squat_main', 'squat', 'main'), S('hinge_2', 'hinge', 'secondary'), S('lunge_acc', 'lunge', 'accessory'), iso('hamstrings'), iso('quads'), iso('calves'), core, iso('glutes')],
  },
  upper_b: {
    key: 'upper_b',
    name: 'Upper B',
    slots: [S('push_v_main', 'push_v', 'main'), S('pull_v_main', 'pull_v', 'main'), S('push_h_2', 'push_h', 'secondary'), S('pull_h_2', 'pull_h', 'secondary'), iso('triceps'), iso('biceps'), iso('side_delts'), iso('chest')],
  },
  lower_b: {
    key: 'lower_b',
    name: 'Lower B',
    slots: [S('hinge_main', 'hinge', 'main'), S('squat_2', 'squat', 'secondary'), S('lunge_acc', 'lunge', 'accessory'), iso('quads'), iso('hamstrings'), iso('glutes'), core, iso('calves')],
  },
  push: {
    key: 'push',
    name: 'Push',
    slots: [S('push_h_main', 'push_h', 'main'), S('push_v_2', 'push_v', 'secondary'), S('push_h_acc', 'push_h', 'accessory'), iso('side_delts'), iso('triceps'), iso('chest'), core],
  },
  pull: {
    key: 'pull',
    name: 'Pull',
    slots: [S('pull_v_main', 'pull_v', 'main'), S('pull_h_2', 'pull_h', 'secondary'), S('pull_v_acc', 'pull_v', 'accessory'), iso('rear_delts'), iso('biceps'), S('hinge_acc', 'hinge', 'accessory'), core],
  },
  legs: {
    key: 'legs',
    name: 'Legs',
    slots: [S('squat_main', 'squat', 'main'), S('hinge_2', 'hinge', 'secondary'), S('lunge_acc', 'lunge', 'accessory'), iso('quads'), iso('hamstrings'), iso('calves'), core, iso('glutes')],
  },
};

export const SPLIT_ROTATIONS: Record<SplitType, string[]> = {
  full_body: ['full_a', 'full_b', 'full_c'],
  upper_lower: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
  ppl: ['push', 'pull', 'legs'],
  ppl_ul: ['push', 'pull', 'legs', 'upper_a', 'lower_a'],
};

/** Default by days per week; a user preference wins when it fits the days. */
export function chooseSplit(daysPerWeek: number, preference?: SplitType): SplitType {
  if (daysPerWeek < 2 || daysPerWeek > 6) throw new RangeError('daysPerWeek must be 2–6');
  if (preference) {
    const minDays: Record<SplitType, number> = { full_body: 2, upper_lower: 2, ppl: 3, ppl_ul: 5 };
    if (daysPerWeek >= minDays[preference]) return preference;
  }
  if (daysPerWeek <= 3) return 'full_body';
  if (daysPerWeek === 4) return 'upper_lower';
  return 'ppl';
}

/** Default weekdays (0 = Mon) spreading sessions with rest days between where possible. */
export const DEFAULT_WEEKDAYS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

export function trainingWeekdays(daysPerWeek: number, preferred?: number[]): number[] {
  if (preferred && preferred.length === daysPerWeek && new Set(preferred).size === daysPerWeek) {
    return [...preferred].sort((a, b) => a - b);
  }
  const d = DEFAULT_WEEKDAYS[daysPerWeek];
  if (!d) throw new RangeError('daysPerWeek must be 2–6');
  return d;
}

/** Exercises per session by session length. */
export function exercisesPerSession(sessionMin: number): number {
  if (sessionMin <= 30) return 4;
  if (sessionMin <= 45) return 5;
  if (sessionMin <= 60) return 6;
  if (sessionMin <= 75) return 7;
  return 8;
}

/** Working sets that fit in a session (~3 min per set incl. rest), 8–30. */
export function setsPerSession(sessionMin: number): number {
  return Math.min(30, Math.max(8, Math.floor(sessionMin / 3)));
}

/** The slot key used for the consecutive-variant rule. Isolation is split by target muscle. */
export function patternKey(pattern: Pattern, muscle?: Muscle): string {
  return pattern === 'isolation' && muscle ? `isolation:${muscle}` : pattern;
}

export function isCompound(ex: Pick<Exercise, 'pattern' | 'compound'>): boolean {
  if (ex.compound !== undefined) return ex.compound;
  return !['isolation', 'core', 'cardio', 'carry'].includes(ex.pattern);
}

/** Lower-body lift → +5 kg progression step. */
export function isLowerBody(ex: Pick<Exercise, 'pattern' | 'primaryMuscles'>): boolean {
  if (['squat', 'hinge', 'lunge'].includes(ex.pattern)) return true;
  const lower: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'];
  return ex.primaryMuscles.every((m) => lower.includes(m));
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export const VOLUME_GROUPS = {
  chest: ['chest'],
  back: ['lats', 'upper_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  quads: ['quads'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  biceps: ['biceps'],
  triceps: ['triceps'],
} as const satisfies Record<string, readonly Muscle[]>;
export type VolumeGroup = keyof typeof VOLUME_GROUPS;
export const VOLUME_GROUP_KEYS = Object.keys(VOLUME_GROUPS) as VolumeGroup[];

export type VolumeMap = Record<VolumeGroup, number>;
export type VolumeRange = Record<VolumeGroup, { min: number; max: number }>;

export const emptyVolume = (): VolumeMap =>
  Object.fromEntries(VOLUME_GROUP_KEYS.map((g) => [g, 0])) as VolumeMap;

/** Hard-set credit per group for one set: 1 if any primary muscle is in the group, 0.5 for secondary. */
export function groupContribution(ex: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'>): VolumeMap {
  const out = emptyVolume();
  for (const g of VOLUME_GROUP_KEYS) {
    const muscles = VOLUME_GROUPS[g] as readonly Muscle[];
    if (ex.primaryMuscles.some((m) => muscles.includes(m))) out[g] = 1;
    else if (ex.secondaryMuscles.some((m) => muscles.includes(m))) out[g] = 0.5;
  }
  return out;
}

export function weeklyVolume(
  sessions: readonly { readonly items: readonly { exerciseId: string; sets: number }[] }[],
  exById: ReadonlyMap<string, Exercise>,
): VolumeMap {
  const v = emptyVolume();
  for (const s of sessions) {
    for (const it of s.items) {
      const ex = exById.get(it.exerciseId);
      if (!ex) continue;
      const c = groupContribution(ex);
      for (const g of VOLUME_GROUP_KEYS) v[g] += c[g] * it.sets;
    }
  }
  return v;
}

export const VOLUME_BASE: Record<Experience, { start: number; max: number }> = {
  beginner: { start: 10, max: 16 },
  intermediate: { start: 12, max: 18 },
  advanced: { start: 14, max: 20 },
};

export interface VolumeTargetInput {
  experience: Experience;
  daysPerWeek: number;
  sessionMin: number;
  /** 0-based week within the block; +1 set per week (progressive overload of volume). */
  weekInBlock?: number;
  deload?: boolean;
  /** Groups that have at least one usable primary exercise; others get min 0. */
  trainableGroups?: ReadonlySet<VolumeGroup>;
}

/**
 * Weekly hard-set range per group. min = start (+1/week in block, ≤ max), capped by capacity
 * (days × sets per session / 8 groups); max = experience cap (≤ 20).
 * Deload: min halves (the planner cuts sets by 40%).
 */
export function volumeTargets(input: VolumeTargetInput): VolumeRange {
  const base = VOLUME_BASE[input.experience];
  const capacity = input.daysPerWeek * setsPerSession(input.sessionMin);
  const capMin = Math.floor(capacity / VOLUME_GROUP_KEYS.length);
  let min = Math.min(base.start + (input.weekInBlock ?? 0), base.max, capMin);
  if (input.deload) min = Math.floor(min * 0.5);
  const out = {} as VolumeRange;
  for (const g of VOLUME_GROUP_KEYS) {
    const trainable = input.trainableGroups ? input.trainableGroups.has(g) : true;
    out[g] = { min: trainable ? min : 0, max: base.max };
  }
  return out;
}

export interface AllocItem {
  exerciseId: string;
  role: SlotRole;
  sets: number;
}

export const SET_LIMITS: Record<SlotRole, { initial: number; min: number; max: number }> = {
  main: { initial: 3, min: 3, max: 6 },
  secondary: { initial: 3, min: 2, max: 5 },
  accessory: { initial: 2, min: 2, max: 5 },
};

/** Trim order: accessories lose sets first (0), mains last (2); fill prefers mains on ties. */
const ROLE_RANK: Record<SlotRole, number> = { accessory: 0, secondary: 1, main: 2 };

/**
 * Distribute sets across the week so each group lands inside its range:
 * 1) add sets where a group is short (primary exercises first, spreading load, respecting the
 *    per-session budget and never pushing another group over its max);
 * 2) remove sets where a group is over its max.
 * Mutates and returns `sessions`.
 */
export function allocateSets<T extends { items: AllocItem[] }>(
  sessions: T[],
  exById: ReadonlyMap<string, Exercise>,
  range: VolumeRange,
  budgetPerSession: number,
): T[] {
  const contrib = new Map<string, VolumeMap>();
  for (const s of sessions) for (const it of s.items) {
    const ex = exById.get(it.exerciseId);
    if (ex && !contrib.has(it.exerciseId)) contrib.set(it.exerciseId, groupContribution(ex));
  }
  const c = (id: string): VolumeMap => contrib.get(id) ?? emptyVolume();
  const sessionSets = (s: T) => s.items.reduce((a, it) => a + it.sets, 0);

  // Trim first so the fill step starts from a valid upper bound.
  const trim = () => {
    for (let guard = 0; guard < 500; guard++) {
      const v = weeklyVolume(sessions, exById);
      const over = VOLUME_GROUP_KEYS.filter((g) => v[g] > range[g].max).sort((a, b) => v[b] - range[b].max - (v[a] - range[a].max));
      if (over.length === 0) return;
      const g = over[0] as VolumeGroup;
      let best: { it: AllocItem; harmless: boolean } | undefined;
      for (const s of sessions) for (const it of s.items) {
        if (c(it.exerciseId)[g] === 0 || it.sets <= SET_LIMITS[it.role].min) continue;
        const cc = c(it.exerciseId);
        const harmless = VOLUME_GROUP_KEYS.every((h) => h === g || cc[h] === 0 || v[h] - cc[h] >= range[h].min);
        const better =
          !best ||
          (harmless && !best.harmless) ||
          (harmless === best.harmless &&
            (ROLE_RANK[it.role] < ROLE_RANK[best.it.role] || (it.role === best.it.role && it.sets > best.it.sets)));
        if (better) best = { it, harmless };
      }
      if (!best) return;
      best.it.sets -= 1;
    }
  };

  const fill = () => {
    for (let guard = 0; guard < 1000; guard++) {
      const v = weeklyVolume(sessions, exById);
      const short = VOLUME_GROUP_KEYS.filter((g) => v[g] < range[g].min).sort((a, b) => range[b].min - v[b] - (range[a].min - v[a]));
      let progressed = false;
      for (const g of short) {
        for (const credit of [1, 0.5]) {
          let best: { it: AllocItem; s: T } | undefined;
          for (const s of sessions) {
            if (sessionSets(s) >= budgetPerSession) continue;
            for (const it of s.items) {
              const cc = c(it.exerciseId);
              if (cc[g] !== credit || it.sets >= SET_LIMITS[it.role].max) continue;
              if (VOLUME_GROUP_KEYS.some((h) => cc[h] > 0 && v[h] + cc[h] > range[h].max)) continue;
              const head = it.sets - SET_LIMITS[it.role].initial;
              const bestHead = best ? best.it.sets - SET_LIMITS[best.it.role].initial : 0;
              const better =
                !best ||
                head < bestHead ||
                (head === bestHead && ROLE_RANK[it.role] > ROLE_RANK[best.it.role]) ||
                (head === bestHead && it.role === best.it.role && sessionSets(s) < sessionSets(best.s));
              if (better) best = { it, s };
            }
          }
          if (best) {
            best.it.sets += 1;
            progressed = true;
            break;
          }
        }
        if (progressed) break;
      }
      if (!progressed) return;
    }
  };

  trim();
  fill();
  trim();
  return sessions;
}
