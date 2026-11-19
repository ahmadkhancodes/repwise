/**
 * Train deep link: `/train?sessionId=…&start=1` (Today, notifications, widgets).
 * Pure: parses the route params and decides what the Train tab does with them.
 */

export type TrainLink = { sessionId: string; start: boolean };

type Param = string | string[] | undefined;

function first(p: Param): string | undefined {
  const v = Array.isArray(p) ? p[0] : p;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

export function parseTrainLink(params: { sessionId?: Param; start?: Param }): TrainLink | null {
  const sessionId = first(params.sessionId);
  if (!sessionId) return null;
  const start = first(params.start);
  return { sessionId, start: start === '1' || start === 'true' };
}

export type LinkSession = { id: string; status: string | null; deletedAt?: number | null };

export type TrainLinkAction =
  /** The session isn't on this device (deleted, or not synced yet). */
  | { kind: 'missing' }
  /** Finished: show its summary. */
  | { kind: 'summary'; sessionId: string; route: string }
  /** Open the player; `run` says whether to start or resume it first. */
  | { kind: 'open'; sessionId: string; route: string; run: 'start' | 'resume' | null };

/**
 * Decide what a Train deep link does.
 * - `start=1` starts a planned/skipped session or resumes a paused one; an active one just opens.
 * - It never starts a second workout while another one is in progress: it opens the requested
 *   session's overview instead, so the user chooses (the resume banner stays on Train).
 */
export function resolveTrainLink(
  link: TrainLink,
  session: LinkSession | undefined | null,
  activeSessionId?: string | null,
): TrainLinkAction {
  if (!session || session.deletedAt) return { kind: 'missing' };
  const id = session.id;
  const route = `/workout/${id}`;
  if (session.status === 'done') return { kind: 'summary', sessionId: id, route: `${route}/summary` };
  if (!link.start) return { kind: 'open', sessionId: id, route, run: null };
  const otherActive = activeSessionId != null && activeSessionId !== id;
  const status = session.status ?? 'planned';
  if (status === 'paused') return { kind: 'open', sessionId: id, route, run: 'resume' };
  if ((status === 'planned' || status === 'skipped') && !otherActive) return { kind: 'open', sessionId: id, route, run: 'start' };
  return { kind: 'open', sessionId: id, route, run: null };
}
