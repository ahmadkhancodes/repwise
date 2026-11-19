/** Move one item from `from` to `to` (both clamped) and return the new order. Pure. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [it] = out.splice(from, 1);
  out.splice(target, 0, it as T);
  return out;
}

/** Position updates needed so `orderedIds` gets positions 0..n-1 (only rows that change). */
export function positionChanges(
  current: readonly { id: string; position: number }[],
  orderedIds: readonly string[],
): { id: string; position: number }[] {
  const pos = new Map(current.map((c) => [c.id, c.position]));
  return orderedIds
    .map((id, i) => ({ id, position: i }))
    .filter(({ id, position }) => pos.has(id) && pos.get(id) !== position);
}
