// ABOUTME: Database client — async SqlExecutor port with better-sqlite3 (local/test) and D1 (prod) adapters.
// ABOUTME: One async contract runs the same SQL on both engines; the adapters absorb their API differences.
import Database from "better-sqlite3";

/**
 * Prepared-statement surface shared by every data-layer caller. Parameters are
 * supplied via `bind(...)` (D1 requires this; the better-sqlite3 adapter emulates
 * it), and both `run` and `all` are async so the same call sites run unchanged on
 * Cloudflare D1 (Promise-based) and on better-sqlite3 (synchronous, wrapped).
 *
 * `all` always resolves to a plain rows array — the D1 adapter unwraps D1's
 * `{ results }` envelope so callers never see engine-specific shapes.
 */
export interface SqlStatement {
  bind(...params: unknown[]): SqlStatement;
  run(): Promise<void>;
  all<T>(): Promise<T[]>;
}

/**
 * Database surface satisfied by both adapters. Production handlers accept a
 * SqlExecutor so the same persistence/audit logic runs locally (better-sqlite3)
 * and on Workers (D1). D1 is the source of application truth in production.
 */
export interface SqlExecutor {
  prepare(sql: string): SqlStatement;
}

/**
 * Wraps a better-sqlite3 Database in the async SqlExecutor port. The engine is
 * synchronous, so `run`/`all` resolve immediately; binding is captured per
 * statement instance (each `bind` returns a fresh statement carrying its params)
 * to mirror D1's immutable-bind contract and avoid shared mutable state.
 */
export function betterSqliteExecutor(db: Database.Database): SqlExecutor {
  return {
    prepare(sql: string): SqlStatement {
      const stmt = db.prepare(sql);
      const withParams = (params: unknown[]): SqlStatement => ({
        bind: (...next: unknown[]) => withParams(next),
        run: async () => {
          stmt.run(...params);
        },
        all: async <T>() => stmt.all(...params) as T[],
      });
      return withParams([]);
    },
  };
}

/** Minimal structural view of D1's prepared statement (duck-typed, no workers-types import). */
interface D1StatementLike {
  bind(...params: unknown[]): D1StatementLike;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

/** Minimal structural view of D1Database (duck-typed). `env.DB` satisfies this. */
interface D1DatabaseLike {
  prepare(sql: string): D1StatementLike;
}

/**
 * Wraps a Cloudflare D1Database in the async SqlExecutor port. Delegates directly
 * to D1's `bind`/`run`/`all` and unwraps `all()`'s `{ results }` envelope into the
 * plain array the port promises.
 */
export function d1Executor(db: D1DatabaseLike): SqlExecutor {
  const wrap = (stmt: D1StatementLike): SqlStatement => ({
    bind: (...params: unknown[]) => wrap(stmt.bind(...params)),
    run: async () => {
      await stmt.run();
    },
    all: async <T>() => (await stmt.all<T>()).results,
  });
  return {
    prepare: (sql: string) => wrap(db.prepare(sql)),
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
