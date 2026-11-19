/**
 * Jest stand-in for expo-sqlite backed by Node's built-in `node:sqlite` (real SQLite, in memory),
 * so Drizzle queries, migrations and live queries run for real in tests. Only the sync API surface
 * Drizzle's expo-sqlite driver uses is implemented, plus the change listener for useLiveQuery.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
type Listener = (e: { databaseName: string; databaseFilePath: string; tableName: string; rowId: number }) => void;

type NodeStatement = {
  run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  all: (...p: unknown[]) => Record<string, unknown>[];
  setReturnArrays?: (on: boolean) => void;
  columns?: () => { name: string }[];
};
type NodeDatabase = { prepare: (sql: string) => NodeStatement; exec: (sql: string) => void; close: () => void };

const listeners = new Set<Listener>();

function openNode(): NodeDatabase {
  // jest.config.js disables node:sqlite's ExperimentalWarning for the workers.
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => NodeDatabase;
  };
  return new DatabaseSync(':memory:');
}

const WRITE_RE = /^\s*(?:insert(?:\s+or\s+\w+)?\s+into|update|delete\s+from)\s+["`]?(\w+)["`]?/i;

function normalise(params: unknown): unknown[] {
  const list = Array.isArray(params) ? params : params === undefined ? [] : [params];
  return list.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
}

function notify(name: string, sql: string) {
  const m = WRITE_RE.exec(sql);
  if (!m?.[1]) return;
  const tableName = m[1];
  for (const l of [...listeners]) {
    l({ databaseName: name, databaseFilePath: name, tableName, rowId: 0 });
  }
}

function toNumber(v: number | bigint): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

export function openDatabaseSync(name: string, options?: { enableChangeListener?: boolean }) {
  const db = openNode();
  const emit = options?.enableChangeListener === true;
  const api = {
    databaseName: name,
    execSync(sql: string) {
      db.exec(sql);
      if (emit) notify(name, sql);
    },
    runSync(sql: string, ...params: unknown[]) {
      const r = db.prepare(sql).run(...normalise(params.length === 1 ? params[0] : params));
      if (emit) notify(name, sql);
      return { changes: toNumber(r.changes), lastInsertRowId: toNumber(r.lastInsertRowid) };
    },
    getAllSync(sql: string, ...params: unknown[]) {
      return db.prepare(sql).all(...normalise(params.length === 1 ? params[0] : params));
    },
    getFirstSync(sql: string, ...params: unknown[]) {
      return db.prepare(sql).all(...normalise(params.length === 1 ? params[0] : params))[0] ?? null;
    },
    withTransactionSync(fn: () => void) {
      db.exec('begin');
      try {
        fn();
        db.exec('commit');
      } catch (e) {
        db.exec('rollback');
        throw e;
      }
    },
    prepareSync(sql: string) {
      const stmt = db.prepare(sql);
      const isRead = /^\s*(select|with|pragma)/i.test(sql) || /\breturning\b/i.test(sql);
      return {
        executeSync(params?: unknown[]) {
          const p = normalise(params);
          if (isRead) {
            stmt.setReturnArrays?.(false);
            const rows = stmt.all(...p);
            if (emit) notify(name, sql);
            return {
              changes: 0,
              lastInsertRowId: 0,
              getAllSync: () => rows,
              getFirstSync: () => rows[0] ?? null,
            };
          }
          const r = stmt.run(...p);
          if (emit) notify(name, sql);
          return {
            changes: toNumber(r.changes),
            lastInsertRowId: toNumber(r.lastInsertRowid),
            getAllSync: () => [],
            getFirstSync: () => null,
          };
        },
        executeForRawResultSync(params?: unknown[]) {
          const p = normalise(params);
          let rows: unknown[][];
          if (stmt.setReturnArrays) {
            stmt.setReturnArrays(true);
            rows = stmt.all(...p) as unknown as unknown[][];
          } else {
            rows = stmt.all(...p).map((r) => Object.values(r));
          }
          if (emit) notify(name, sql);
          return { getAllSync: () => rows };
        },
        finalizeSync() {},
      };
    },
    closeSync() {
      db.close();
    },
  };
  return api;
}

export function addDatabaseChangeListener(listener: Listener) {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}

export type SQLiteDatabase = ReturnType<typeof openDatabaseSync>;
