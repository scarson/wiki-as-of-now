// ABOUTME: Tests for the async SqlExecutor port and its two adapters in src/db/client.ts.
// ABOUTME: Verifies better-sqlite3 round-trips, FK enforcement, and D1 delegation/unwrapping.
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { betterSqliteExecutor, d1Executor, openLocalDb } from "../../src/db/client";
import { freshTestDb } from "../helpers/db";

describe("betterSqliteExecutor", () => {
  it("round-trips an insert and reads back a plain array", async () => {
    const exec = betterSqliteExecutor(freshTestDb());
    await exec
      .prepare("INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?)")
      .bind(1, "Test", 100, "2026-06-05T00:00:00.000Z")
      .run();
    const rows = await exec
      .prepare("SELECT page_id, title FROM articles")
      .all<{ page_id: number; title: string }>();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toEqual([{ page_id: 1, title: "Test" }]);
  });

  it("propagates foreign-key violations as a rejected promise", async () => {
    const exec = betterSqliteExecutor(freshTestDb());
    // page_id 999 has no parent articles row; FK enforcement (ON in freshTestDb) must reject.
    const orphan = exec
      .prepare(
        "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(999, "S", "t", 2017, "plans to", 1.0, "e", "1.0.0", 1)
      .run();
    await expect(orphan).rejects.toThrow(/FOREIGN KEY/i);
  });
});

describe("openLocalDb", () => {
  it("returns an executor with foreign-key enforcement live", async () => {
    const exec = openLocalDb();
    await exec.prepare("CREATE TABLE parent (id INTEGER PRIMARY KEY)").run();
    await exec
      .prepare("CREATE TABLE child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id))")
      .run();
    const orphan = exec.prepare("INSERT INTO child (id, pid) VALUES (1, 42)").run();
    await expect(orphan).rejects.toThrow(/FOREIGN KEY/i);
  });
});

describe("d1Executor", () => {
  it("delegates prepare/bind/run and unwraps all() results", async () => {
    const calls: { sql: string; params: unknown[]; method: string }[] = [];
    // Minimal structural fake of the D1 surface (bind→run/all, all() returns {results}).
    const makeStmt = (sql: string, params: unknown[] = []) => ({
      bind: (...p: unknown[]) => makeStmt(sql, p),
      run: async () => {
        calls.push({ sql, params, method: "run" });
        return { success: true };
      },
      all: async <T,>(): Promise<{ results: T[] }> => {
        calls.push({ sql, params, method: "all" });
        return { results: [{ n: 1 } as T] };
      },
    });
    const fakeD1 = { prepare: (sql: string) => makeStmt(sql) };

    const exec = d1Executor(fakeD1);
    await exec.prepare("INSERT INTO t VALUES (?)").bind("x").run();
    const rows = await exec.prepare("SELECT n FROM t").all<{ n: number }>();

    expect(rows).toEqual([{ n: 1 }]);
    expect(calls).toEqual([
      { sql: "INSERT INTO t VALUES (?)", params: ["x"], method: "run" },
      { sql: "SELECT n FROM t", params: [], method: "all" },
    ]);
  });
});

// Sanity: the raw better-sqlite3 handle still opens (used by freshTestDb and adapters).
describe("better-sqlite3 availability", () => {
  it("opens an in-memory database", () => {
    const db = new Database(":memory:");
    expect(db.open).toBe(true);
    db.close();
  });
});
