// ABOUTME: Portable async SqlExecutor interface and Cloudflare D1 adapter.
// ABOUTME: No Node-only imports — safe to bundle for Cloudflare Workers.

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

