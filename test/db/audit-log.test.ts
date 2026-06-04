// ABOUTME: Tests for the append-only audit-log module.
// ABOUTME: Verifies append, read-back in insertion order, and absence of mutation methods.
import { describe, it, expect } from "vitest";
import { makeAuditLog } from "../../src/db/audit-log";
import { freshTestDb } from "../helpers/db";

describe("audit log", () => {
  it("appends and reads back in insertion order", () => {
    const log = makeAuditLog(freshTestDb());
    log.append({ actor: "system", eventType: "detector.run", payload: { pageId: 42 } });
    log.append({ actor: "u1", eventType: "source.opened", payload: { candidateId: 7 } });
    const rows = log.read();
    expect(rows.map(r => r.eventType)).toEqual(["detector.run", "source.opened"]);
    expect(rows[0].payload).toEqual({ pageId: 42 });
    expect(rows[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO 8601 UTC
  });

  it("returns an empty array when no rows have been appended", () => {
    const log = makeAuditLog(freshTestDb());
    expect(log.read()).toEqual([]);
  });

  it("exposes no update or delete method (append-only)", () => {
    const log = makeAuditLog(freshTestDb()) as Record<string, unknown>;
    expect(log.update).toBeUndefined();
    expect(log.delete).toBeUndefined();
  });
});
