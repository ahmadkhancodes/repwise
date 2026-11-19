/** Custom routines (RW-15, S16): stored as JSON `items` on the routines table. */
export type RoutineItem = {
  exerciseId: string;
  sets: number;
  reps: string;
  restS: number;
};

export const FREE_ROUTINE_LIMIT = 3;

export const DEFAULT_ITEM: Omit<RoutineItem, 'exerciseId'> = { sets: 3, reps: '8-12', restS: 90 };

/** Read the JSON column defensively (synced rows can come from older app versions). */
export function parseRoutineItems(raw: unknown): RoutineItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RoutineItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    if (typeof r.exerciseId !== 'string' || !r.exerciseId) continue;
    const sets = typeof r.sets === 'number' && r.sets >= 1 ? Math.min(10, Math.round(r.sets)) : DEFAULT_ITEM.sets;
    const reps = typeof r.reps === 'string' && r.reps ? r.reps : DEFAULT_ITEM.reps;
    const restS = typeof r.restS === 'number' && r.restS >= 0 ? Math.round(r.restS) : DEFAULT_ITEM.restS;
    out.push({ exerciseId: r.exerciseId, sets, reps, restS });
  }
  return out;
}

/** Free users keep up to 3 routines; Pro is unlimited (sheet 07 RW-15). */
export function canAddRoutine(count: number, isPro: boolean): boolean {
  return isPro || count < FREE_ROUTINE_LIMIT;
}

export function routineSetCount(items: RoutineItem[]): number {
  return items.reduce((a, i) => a + i.sets, 0);
}
