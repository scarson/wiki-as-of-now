// ABOUTME: Tests for the append-only audit-log module.
// ABOUTME: Verifies append, read-back in insertion order, and absence of mutation methods.
import { describe, it, expect } from "vitest";
import { makeAuditLog, appendStatement } from "../../src/db/audit-log";
import { betterSqliteExecutor } from "../../src/db/local-db";
import { freshTestDb, freshTestExecutor } from "../helpers/db";

const newLog = () => makeAuditLog(betterSqliteExecutor(freshTestDb()));

describe("audit log", () => {
  it("appends and reads back in insertion order", async () => {
    const log = newLog();
    await log.append({ actor: "system", eventType: "detector.run", payload: { pageId: 42 } });
    await log.append({ actor: "u1", eventType: "source.opened", payload: { candidateId: 7 } });
    const rows = await log.read();
    expect(rows.map(r => r.eventType)).toEqual(["detector.run", "source.opened"]);
    expect(rows.map(r => r.actor)).toEqual(["system", "u1"]);
    expect(rows[0].payload).toEqual({ pageId: 42 });
    expect(rows[1].payload).toEqual({ candidateId: 7 });
    expect(rows[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); // ISO 8601 UTC
  });

  it("returns an empty array when no rows have been appended", async () => {
    const log = newLog();
    expect(await log.read()).toEqual([]);
  });

  it("exposes no update or delete method (append-only)", () => {
    const log = newLog() as Record<string, unknown>;
    expect(log.update).toBeUndefined();
    expect(log.delete).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// appendStatement — returns a bound statement without executing
// ---------------------------------------------------------------------------

describe("appendStatement", () => {
  it("building the statement does NOT insert a row — read() is empty before .run()", async () => {
    const exec = freshTestExecutor();
    const entry = { actor: "system", eventType: "test.event", payload: { claimKey: "abc" } };

    // Build the statement — must not execute
    appendStatement(exec, entry);

    // No rows yet
    const log = makeAuditLog(exec);
    const rows = await log.read();
    expect(rows).toHaveLength(0);
  });

  it("calling .run() on the built statement inserts exactly one row with correct fields", async () => {
    const exec = freshTestExecutor();
    const entry = { actor: "system", eventType: "research.completed", payload: { claimKey: "deadbeef", cardCount: 3 } };

    const stmt = appendStatement(exec, entry);

    // Still absent before run
    expect(await makeAuditLog(exec).read()).toHaveLength(0);

    await stmt.run();

    const rows = await makeAuditLog(exec).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe("system");
    expect(rows[0].eventType).toBe("research.completed");
    expect(rows[0].payload).toEqual({ claimKey: "deadbeef", cardCount: 3 });
    // ts is captured at build time — must be a valid ISO 8601 UTC string
    expect(rows[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("ts is a valid ISO 8601 timestamp set when the statement is built", async () => {
    // Build the statement, then delay, then run — the ts stored is from build time.
    // We approximate this by checking the ts is set before run() is awaited and
    // that the row's ts field is a valid ISO timestamp (cannot exactly time-travel,
    // but we confirm it is not empty / undefined).
    const exec = freshTestExecutor();
    const entry = { actor: "system", eventType: "test.ts", payload: {} };

    const beforeBuild = new Date().toISOString();
    const stmt = appendStatement(exec, entry);
    const afterBuild = new Date().toISOString();

    await stmt.run();

    const rows = await makeAuditLog(exec).read();
    expect(rows).toHaveLength(1);
    const storedTs = rows[0].ts;
    // The stored ts must fall within [beforeBuild, afterBuild]
    expect(storedTs >= beforeBuild).toBe(true);
    expect(storedTs <= afterBuild).toBe(true);
  });
});
