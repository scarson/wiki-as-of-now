// ABOUTME: Node-only better-sqlite3 adapter for the async SqlExecutor port.
// ABOUTME: Used locally and in tests; never bundled for Cloudflare Workers (no native module in workerd).
import Database from "better-sqlite3";
import type { SqlExecutor, SqlStatement } from "./client";

/**
 * Wraps a better-sqlite3 Database in the async SqlExecutor port. The engine is
 * synchronous, so `run`/`all` resolve immediately; binding is captured per
 * statement instance (each `bind` returns a fresh statement carrying its params)
 * to mirror D1's immutable-bind contract and avoid shared mutable state.
 *
 * The syncRunner WeakMap associates each SqlStatement with a synchronous executor
 * so that batch() can drive multiple statements inside a single better-sqlite3
 * transaction (which requires a synchronous callback) without exposing
 * engine-specific internals on the public SqlStatement interface.
 */
export function betterSqliteExecutor(db: Database.Database): SqlExecutor {
  const syncRunner = new WeakMap<SqlStatement, () => void>();
  return {
    prepare(sql: string): SqlStatement {
      const stmt = db.prepare(sql);
      const withParams = (params: unknown[]): SqlStatement => {
        const wrapped: SqlStatement = {
          bind: (...next: unknown[]) => withParams(next),
          run: async () => {
            stmt.run(...params);
          },
          all: async <T>() => stmt.all(...params) as T[],
        };
        syncRunner.set(wrapped, () => stmt.run(...params));
        return wrapped;
      };
      return withParams([]);
    },
    batch: async (statements: SqlStatement[]): Promise<void> => {
      const txn = db.transaction((stmts: SqlStatement[]) => {
        for (const s of stmts) {
          const runSync = syncRunner.get(s);
          if (!runSync) throw new Error("Statement was not produced by this executor");
          runSync();
        }
      });
      txn(statements);
    },
  };
}

/**
 * Opens a better-sqlite3 in-memory or file-based database for local/test use and
 * returns it as a SqlExecutor.
 *
 * Enables foreign-key enforcement so local/test behavior matches Cloudflare D1,
 * which enforces foreign keys by default. better-sqlite3 leaves them off unless
 * this pragma is set, which would otherwise let referential-integrity violations
 * pass silently in tests.
 */
export function openLocalDb(path: string = ":memory:"): SqlExecutor {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  return betterSqliteExecutor(db);
}
