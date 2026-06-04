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
 */
export interface SqlExecutor {
  prepare(sql: string): SqlStatement;
}

/**
 * Opens a better-sqlite3 in-memory or file-based database for local/test use.
 * The returned value is assignable to SqlExecutor.
 */
export function openLocalDb(path: string = ":memory:"): SqlExecutor {
  return new Database(path);
}
