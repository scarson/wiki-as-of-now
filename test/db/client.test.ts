// ABOUTME: Tests for the async SqlExecutor port and its two adapters in src/db/client.ts.
// ABOUTME: Verifies better-sqlite3 round-trips, FK enforcement, and D1 delegation/unwrapping.
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { betterSqliteExecutor, openLocalDb } from "../../src/db/local-db";
import { d1Executor } from "../../src/db/client";
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

  it("batch: commits all statements atomically on success", async () => {
    const exec = betterSqliteExecutor(freshTestDb());
    const insertSql = "INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?)";
    const stmtA = exec.prepare(insertSql).bind(10, "Article A", 100, "2026-06-05T00:00:00.000Z");
    const stmtB = exec.prepare(insertSql).bind(20, "Article B", 200, "2026-06-05T00:00:00.000Z");
    await exec.batch([stmtA, stmtB]);
    const rows = await exec
      .prepare("SELECT page_id FROM articles ORDER BY page_id")
      .all<{ page_id: number }>();
    expect(rows).toEqual([{ page_id: 10 }, { page_id: 20 }]);
  });

  it("batch: rolls back all statements when one fails (both-or-neither)", async () => {
    const exec = betterSqliteExecutor(freshTestDb());
    const insertSql = "INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?)";
    // stmtA is a valid insert; stmtB is a duplicate PK → constraint error mid-transaction.
    const stmtA = exec.prepare(insertSql).bind(1, "Article", 100, "2026-06-05T00:00:00.000Z");
    const stmtB = exec.prepare(insertSql).bind(1, "Duplicate", 101, "2026-06-05T00:00:00.000Z");
    await expect(exec.batch([stmtA, stmtB])).rejects.toThrow();
    // The first insert must have been rolled back — neither row survives.
    const rows = await exec
      .prepare("SELECT page_id FROM articles WHERE page_id = 1")
      .all<{ page_id: number }>();
    expect(rows).toHaveLength(0);
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
    const fakeD1 = {
      prepare: (sql: string) => makeStmt(sql),
      batch: async (_stmts: unknown[]) => [],
    };

    const exec = d1Executor(fakeD1);
    await exec.prepare("INSERT INTO t VALUES (?)").bind("x").run();
    const rows = await exec.prepare("SELECT n FROM t").all<{ n: number }>();

    expect(rows).toEqual([{ n: 1 }]);
    expect(calls).toEqual([
      { sql: "INSERT INTO t VALUES (?)", params: ["x"], method: "run" },
      { sql: "SELECT n FROM t", params: [], method: "all" },
    ]);
  });

  it("batch: delegates to D1 native batch with the underlying bound statements", async () => {
    // Track which underlying D1 statement objects were passed to batch().
    let batchCallCount = 0;
    let batchedStatements: unknown[] = [];

    // Each makeStmt returns a distinct object so we can assert identity.
    const makeStmt = (sql: string, _params: unknown[] = []) => ({
      bind: (...p: unknown[]) => makeStmt(sql, p),
      run: async () => ({ success: true }),
      all: async <T,>(): Promise<{ results: T[] }> => ({ results: [] }),
    });

    const fakeD1 = {
      prepare: (sql: string) => makeStmt(sql),
      batch: async (stmts: unknown[]) => {
        batchCallCount++;
        batchedStatements = stmts;
        return [];
      },
    };

    const exec = d1Executor(fakeD1);
    const s1 = exec.prepare("INSERT INTO t VALUES (?)").bind("a");
    const s2 = exec.prepare("INSERT INTO t VALUES (?)").bind("b");
    await exec.batch([s1, s2]);

    // D1 batch must have been called exactly once (not run() called per statement).
    expect(batchCallCount).toBe(1);
    // The adapter must have passed exactly 2 underlying D1 statements.
    expect(batchedStatements).toHaveLength(2);
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
