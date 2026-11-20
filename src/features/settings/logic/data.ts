/**
 * "Your data" (S38/S42): pure helpers for the JSON export and the delete-everything flow.
 * No I/O here; `../data.ts` reads SQLite and writes the file.
 */

/** Columns that are sync bookkeeping or link to the server account: never exported. */
export const EXPORT_OMIT = ['dirty', 'userId', 'user_id'] as const;

export type ExportRow = Record<string, unknown>;

export type ExportFile = {
  app: 'Repwise';
  format: 1;
  appVersion: string;
  exportedAt: string;
  /** Rows per table (deleted rows left out). */
  counts: Record<string, number>;
  tables: Record<string, ExportRow[]>;
  note: string;
};

/** Drop internal columns and soft-deleted rows. Pure. */
export function cleanRows(rows: readonly ExportRow[]): ExportRow[] {
  return rows
    .filter((r) => r.deletedAt == null && r.deleted_at == null)
    .map((r) => {
      const out: ExportRow = {};
      for (const [k, v] of Object.entries(r)) {
        if (!(EXPORT_OMIT as readonly string[]).includes(k)) out[k] = v;
      }
      return out;
    });
}

/** The file the user gets: every table, readable JSON. Pure. */
export function buildExport(
  tables: Record<string, readonly ExportRow[]>,
  meta: { appVersion: string; now: number },
): ExportFile {
  const clean: Record<string, ExportRow[]> = {};
  const counts: Record<string, number> = {};
  for (const name of Object.keys(tables).sort()) {
    clean[name] = cleanRows(tables[name] ?? []);
    counts[name] = clean[name].length;
  }
  return {
    app: 'Repwise',
    format: 1,
    appVersion: meta.appVersion,
    exportedAt: new Date(meta.now).toISOString(),
    counts,
    tables: clean,
    note: 'Weights are in kg, lengths in cm, energy in kcal. Progress photos stay on your phone.',
  };
}

/** "repwise-export-2026-11-19.json" (local date). Pure. */
export function exportFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `repwise-export-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Total rows in an export (for the toast). Pure. */
export function exportedRows(file: Pick<ExportFile, 'counts'>): number {
  return Object.values(file.counts).reduce((a, b) => a + b, 0);
}

/** Seconds the user has to undo "Delete all data" after confirming twice. */
export const DELETE_UNDO_MS = 5000;

export type DeletePlan = {
  /** Also delete the Worker account (and its backup) first. */
  deleteServerAccount: boolean;
  /** A failed server delete stops everything (signed in) or is ignored (anonymous). */
  serverRequired: boolean;
};

/** What "Delete all data" does for this auth status. Pure. */
export function deletePlan(status: 'loading' | 'signedOut' | 'anonymous' | 'signedIn'): DeletePlan {
  if (status === 'signedIn') return { deleteServerAccount: true, serverRequired: true };
  if (status === 'anonymous') return { deleteServerAccount: true, serverRequired: false };
  return { deleteServerAccount: false, serverRequired: false };
}
