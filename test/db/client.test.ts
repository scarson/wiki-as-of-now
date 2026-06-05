// ABOUTME: Tests for openLocalDb — the local/test better-sqlite3 helper in src/db/client.ts.
// ABOUTME: Verifies it enables foreign-key enforcement so local behavior matches Cloudflare D1.
import { describe, it, expect } from "vitest";
import type Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { openLocalDb } from "../../src/db/client";

describe("openLocalDb", () => {
  it("enables foreign-key enforcement (matches D1's default)", () => {
    // openLocalDb returns the SqlExecutor surface; the runtime value is a
    // better-sqlite3 Database, which we inspect here to assert the pragma.
    const db = openLocalDb() as unknown as Database.Database;
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("opens a usable connection whose foreign keys actually fire after migration", () => {
    const db = openLocalDb() as unknown as Database.Database;
    db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
    // Inserting a stale_candidate referencing a non-existent page_id must throw,
    // proving FK enforcement is live (better-sqlite3 leaves it OFF by default).
    const insertOrphan = () =>
      db
        .prepare(
          "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) " +
            "VALUES (999, 'S', 't', 2017, 'plans to', 1.0, 'e', '1.0.0', 1)"
        )
        .run();
    expect(insertOrphan).toThrow(/FOREIGN KEY/i);
  });
});
