/**
 * Last-write-wins per row on updated_at (sheet 13). Deletes are soft, so a delete is just a newer
 * row with deleted_at set and wins like any other write. Ties keep the local row (a dirty local
 * row is then pushed and the server answers "conflict", which settles it).
 */
export type MergeDecision = 'insert' | 'replace' | 'keep';

export function decide(
  local: { updatedAt: number } | undefined,
  remote: { updatedAt: number },
): MergeDecision {
  if (!local) return 'insert';
  return remote.updatedAt > local.updatedAt ? 'replace' : 'keep';
}
