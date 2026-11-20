/**
 * Swap exercise (RW-13, S15): up to 3 alternatives — same movement pattern, equipment the user
 * has, injury-safe, not already in the session and not used in the last 2 sessions.
 *
 * Order of sources:
 *  1. a provider registered by the planner service (`registerSwapProvider`), when present;
 *  2. the engine's `swapExercise` directly, over the content catalogue mapped to engine shape by
 *     `@repwise/content`'s `exerciseToEngine` adapter (the one adapter the planner also uses);
 *  3. the catalogue's curated `alternatives` (never empty for a catalogue exercise).
 * The selection rules live in the engine; this file only adapts data and filters equipment
 * against the profile's own vocabulary.
 */
import type { Exercise as ContentExercise } from '@repwise/content';
import { exerciseToEngine } from '@repwise/content/toEngine';
import {
  EQUIPMENT,
  swapExercise,
  type Equipment as EngineEquipment,
  type Exercise as EngineExercise,
  type Injury,
  type PlannedSession,
  type ProfileInput,
} from '@repwise/engine';

export type SwapRequest = {
  /** Session date ('YYYY-MM-DD'). */
  date: string;
  /** Exercise ids in the session, in order. */
  sessionExerciseIds: string[];
  /** Index of the exercise to replace. */
  index: number;
  /** Exercise ids from the last sessions (newest last) — not suggested again. */
  recentSessions: { date: string; exerciseIds: string[] }[];
  now: number;
};

export type SwapProvider = (req: SwapRequest) => string[];

let provider: SwapProvider | null = null;

/** The planner service registers its own swap (e.g. with the full plan history). */
export function registerSwapProvider(p: SwapProvider | null): void {
  provider = p;
}

export type SwapProfile = {
  equipment?: string[] | null;
  injuries?: string[] | null;
  experience?: string | null;
  goal?: string | null;
  sex?: string | null;
  birthYear?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  days?: number | null;
  sessionMin?: number | null;
};

const ENGINE_INJURIES = new Set<string>(['shoulder', 'knee', 'lower_back', 'wrist', 'elbow', 'hip', 'ankle', 'neck']);
/** Equipment is filtered in the content vocabulary (`hasEquipment`) before the engine runs. */
const ALL_ENGINE_EQUIPMENT: EngineEquipment[] = [...EQUIPMENT];

/** Profile equipment that may be written in either vocabulary → content vocabulary. */
const PROFILE_ALIASES: Record<string, string[]> = {
  smith: ['smith_machine'],
  pullup_bar: ['pull_up_bar'],
  cardio_machine: ['treadmill', 'bike', 'rower', 'elliptical', 'stair_climber'],
};

/**
 * Content catalogue item → engine `Exercise`, via `@repwise/content`'s adapter. Null when the item
 * cannot be planned (e.g. cardio without a MET value) or is mobility (never swapped in).
 */
export function toEngineExercise(ex: ContentExercise): EngineExercise | null {
  const e = exerciseToEngine(ex);
  if ('reason' in e || e.pattern === 'mobility') return null;
  return e;
}

/** Equipment the user has, in content vocabulary. Null = not set (assume a full gym). */
export function availableEquipment(profileEquipment: string[] | null | undefined): Set<string> | null {
  if (!profileEquipment || profileEquipment.length === 0) return null;
  const out = new Set<string>(['bodyweight']);
  for (const e of profileEquipment) {
    out.add(e);
    for (const alias of PROFILE_ALIASES[e] ?? []) out.add(alias);
  }
  return out;
}

export function hasEquipment(ex: Pick<ContentExercise, 'equipment'>, available: Set<string> | null): boolean {
  return available === null || ex.equipment.every((e) => e === 'bodyweight' || available.has(e));
}

function clampInt(v: number | null | undefined, lo: number, hi: number, dflt: number): number {
  return v == null || !Number.isFinite(v) ? dflt : Math.min(hi, Math.max(lo, Math.round(v)));
}

/** Profile row → a valid engine ProfileInput (safe defaults for anything not answered yet). */
export function toEngineProfile(p: SwapProfile | null | undefined): ProfileInput {
  const goal = (['fat_loss', 'muscle_gain', 'recomp', 'maintain'] as const).find((g) => g === p?.goal);
  const exp = (['beginner', 'intermediate', 'advanced'] as const).find((e) => e === p?.experience);
  return {
    goal: goal ?? 'maintain',
    sex: p?.sex === 'female' ? 'female' : 'male',
    birthYear: clampInt(p?.birthYear, 1900, 2100, 1995),
    heightCm: Math.min(230, Math.max(120, p?.heightCm ?? 175)),
    weightKg: Math.min(300, Math.max(30, p?.weightKg ?? 75)),
    experience: exp ?? 'intermediate',
    daysPerWeek: clampInt(p?.days, 2, 6, 3),
    sessionMin: clampInt(p?.sessionMin, 20, 180, 60),
    equipment: ALL_ENGINE_EQUIPMENT,
    injuries: (p?.injuries ?? []).filter((i) => ENGINE_INJURIES.has(i)) as Injury[],
  };
}

function engineSwap(
  req: SwapRequest,
  catalogue: readonly ContentExercise[],
  profile: SwapProfile | null | undefined,
): string[] {
  const available = availableEquipment(profile?.equipment);
  const usable = catalogue.filter((e) => hasEquipment(e, available));
  const engineCat = usable.map(toEngineExercise).filter((e): e is EngineExercise => e !== null);
  // Keep the current exercise in the catalogue even if the user's equipment changed since.
  const current = catalogue.find((e) => e.id === req.sessionExerciseIds[req.index]);
  const currentEngine = current ? toEngineExercise(current) : null;
  if (currentEngine && !engineCat.some((e) => e.id === currentEngine.id)) engineCat.push(currentEngine);
  const session: PlannedSession = {
    date: req.date,
    weekday: 0,
    templateKey: 'live',
    title: 'Live session',
    fingerprint: '',
    deload: false,
    items: req.sessionExerciseIds.map((exerciseId, i) => ({
      exerciseId,
      slotKey: `s${i}`,
      patternKey: '',
      role: 'main',
      sets: 3,
      repRange: [8, 12],
      targetReps: 8,
      rpe: 8,
      restS: 90,
      loadKg: null,
    })),
  };
  return swapExercise({
    profile: toEngineProfile(profile),
    history: {
      sessions: req.recentSessions.filter((s) => s.date < req.date),
    },
    catalogues: { exercises: engineCat, recipes: [] },
    session,
    index: req.index,
    now: req.now,
    // Ask for more: the engine only treats sessions before this week as "recent", so
    // swapAlternatives drops same-week repeats afterwards and keeps 3.
    count: 6,
  });
}

/** Curated alternatives from the catalogue, then same-pattern exercises, same filters. */
function catalogueSwap(
  req: SwapRequest,
  catalogue: readonly ContentExercise[],
  profile: SwapProfile | null | undefined,
): string[] {
  const byId = new Map(catalogue.map((e) => [e.id, e]));
  const current = byId.get(req.sessionExerciseIds[req.index] ?? '');
  if (!current) return [];
  const available = availableEquipment(profile?.equipment);
  const injuries = new Set(profile?.injuries ?? []);
  const inSession = new Set(req.sessionExerciseIds);
  const recent = new Set(req.recentSessions.slice(-2).flatMap((s) => s.exerciseIds));
  const ok = (e: ContentExercise | undefined): e is ContentExercise =>
    !!e &&
    !inSession.has(e.id) &&
    !recent.has(e.id) &&
    hasEquipment(e, available) &&
    !e.contraindications.some((c) => injuries.has(c));
  const curated = current.alternatives.map((id) => byId.get(id)).filter(ok);
  const samePattern = catalogue.filter((e) => e.pattern === current.pattern && ok(e) && !curated.includes(e));
  return [...curated, ...samePattern].slice(0, 3).map((e) => e.id);
}

/** Up to 3 alternative exercise ids for the exercise at `req.index`. Never throws. */
export function swapAlternatives(
  req: SwapRequest,
  catalogue: readonly ContentExercise[],
  profile?: SwapProfile | null,
): string[] {
  const known = new Set(catalogue.map((e) => e.id));
  const inSession = new Set(req.sessionExerciseIds);
  const recent = new Set(req.recentSessions.slice(-2).flatMap((s) => s.exerciseIds));
  const valid = (ids: string[]) =>
    [...new Set(ids)].filter((id) => known.has(id) && !inSession.has(id) && !recent.has(id)).slice(0, 3);
  if (provider) {
    try {
      const ids = valid(provider(req));
      if (ids.length) return ids;
    } catch {
      // fall through to the engine
    }
  }
  try {
    const ids = valid(engineSwap(req, catalogue, profile));
    if (ids.length) return ids;
  } catch {
    // fall through to the catalogue
  }
  return catalogueSwap(req, catalogue, profile);
}
