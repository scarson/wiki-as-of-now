// ABOUTME: Tests for the append-only audit-log module.
// ABOUTME: Verifies append, read-back in insertion order, and absence of mutation methods.
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { makeAuditLog } from "../../src/db/audit-log";

function freshDb() {
  const db = new Database(":memory:");
  db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
  return db;
}

describe("audit log", () => {
  it("appends and reads back in insertion order", () => {
    const log = makeAuditLog(freshDb());
    log.append({ actor: "system", eventType: "detector.run", payload: { pageId: 42 } });
    log.append({ actor: "u1", eventType: "source.opened", payload: { candidateId: 7 } });
    const rows = log.read();
    expect(rows.map(r => r.eventType)).toEqual(["detector.run", "source.opened"]);
    expect(rows[0].payload).toEqual({ pageId: 42 });
    expect(typeof rows[0].ts).toBe("string");
  });

  it("exposes no update or delete method (append-only)", () => {
    const log = makeAuditLog(freshDb()) as Record<string, unknown>;
    expect(log.update).toBeUndefined();
    expect(log.delete).toBeUndefined();
  });
});
