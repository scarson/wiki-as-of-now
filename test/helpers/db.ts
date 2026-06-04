// ABOUTME: Test helper — opens a fresh in-memory SQLite DB with the schema applied.
// ABOUTME: Enables foreign-key enforcement so local tests match Cloudflare D1's default.
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

/**
 * Opens a fresh in-memory SQLite database with the 0001_init migration applied
 * and foreign-key enforcement ON (matching Cloudflare D1's default). Use this in
 * tests instead of a bare `new Database(":memory:")` so local referential-integrity
 * behavior matches production — otherwise better-sqlite3 silently ignores foreign
 * keys and tests can false-pass on violations.
 */
export function freshTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
  return db;
}
