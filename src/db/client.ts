// ABOUTME: Database client — defines the SqlExecutor interface and a helper to open
// ABOUTME: a better-sqlite3 connection for local/test use.
import Database from "better-sqlite3";

/**
 * Minimal statement shape shared by better-sqlite3 and Cloudflare D1.
 * Both runtimes satisfy this structurally; no import of @cloudflare/workers-types
 * is needed because the check is purely structural (duck-typed).
 */
export interface SqlStatement {
  run(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}

/**
 * Minimal database shape satisfied by both better-sqlite3's Database and
 * Cloudflare's D1Database. Production handlers accept SqlExecutor so the
 * same logic runs locally (better-sqlite3) and on Workers (D1).
 *
 * NOTE (sync/async seam): this models better-sqlite3's *synchronous* contract,
 * which is what the local/test path uses today. D1's real surface is async
 * (prepare().run()/.all() return Promises). Live D1 is not wired in this
 * milestone; when it is, the consuming modules (e.g. the audit log) will need
 * an async-aware adapter rather than calling these methods as if synchronous.
 * See the data-layer entry in docs/pitfalls/implementation-pitfalls.md.
 */
export interface SqlExecutor {
  prepare(sql: string): SqlStatement;
}

/**
 * Opens a better-sqlite3 in-memory or file-based database for local/test use.
 * The returned value is assignable to SqlExecutor.
 *
 * Enables foreign-key enforcement so local/test behavior matches Cloudflare D1,
 * which enforces foreign keys by default. better-sqlite3 leaves them off unless
 * this pragma is set, which would otherwise let referential-integrity
 * violations pass silently in tests.
 */
export function openLocalDb(path: string = ":memory:"): SqlExecutor {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  return db;
}
