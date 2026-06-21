// ABOUTME: Tests the per-row-isolated audit-trail reader for the transparency/disclosure path (CC-19, G13).
// ABOUTME: One corrupt payload_json row degrades to a placeholder instead of aborting the whole read.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { appendStatement } from "../../src/db/audit-log";
import { readAuditTrail, summarizeFeedback } from "../../src/db/audit-queries";

describe("readAuditTrail", () => {
  it("returns rows in insertion order with parsed identifier-only payloads", async () => {
    const db = await freshTestExecutor();
    await appendStatement(db, {
      actor: "system",
      eventType: "research_pack.stored",
      payload: { claimKey: "a".repeat(64), sourceRevisionId: 42 },
    }).run();
    await appendStatement(db, { actor: "system", eventType: "source.opened", payload: { claimKey: "a".repeat(64) } }).run();

    const trail = await readAuditTrail(db);
    expect(trail).toHaveLength(2);
    expect(trail[0].eventType).toBe("research_pack.stored");
    expect(trail[0].payload).toEqual({ claimKey: "a".repeat(64), sourceRevisionId: 42 });
    expect(trail[0].corrupt).toBe(false);
    expect(trail[1].eventType).toBe("source.opened");
    expect(trail[1].corrupt).toBe(false);
  });

  it("isolates a corrupt payload_json row instead of aborting the whole read (CC-19)", async () => {
    const db = await freshTestExecutor();
    // Insert one good row via the typed path, then a row with invalid JSON via raw SQL.
    await appendStatement(db, { actor: "system", eventType: "research_pack.stored", payload: { claimKey: "a".repeat(64) } }).run();
    await db
      .prepare("INSERT INTO audit_log (ts, actor, event_type, payload_json) VALUES (?, ?, ?, ?)")
      .bind("2026-06-13T00:00:00.000Z", "system", "broken.row", "{ this is not json")
      .run();
    await appendStatement(db, { actor: "system", eventType: "disclosure.generated", payload: { claimKey: "a".repeat(64) } }).run();

    const trail = await readAuditTrail(db);
    expect(trail).toHaveLength(3); // none dropped — the corrupt row is degraded, not fatal
    expect(trail[1].eventType).toBe("broken.row");
    expect(trail[1].corrupt).toBe(true);
    expect(trail[1].payload).toBeNull();
    expect(trail[2].eventType).toBe("disclosure.generated"); // read continued past the corrupt row
    expect(trail[2].corrupt).toBe(false);
  });

  it("returns an empty trail (not an error) when the audit log is empty", async () => {
    const db = await freshTestExecutor();
    const trail = await readAuditTrail(db);
    expect(trail).toEqual([]);
  });
});

describe("summarizeFeedback", () => {
  it("counts session.feedback rows by outcome code without exposing PII", async () => {
    const db = await freshTestExecutor();
    await appendStatement(db, { actor: "system", eventType: "session.feedback", payload: { outcome: "edit_made" } }).run();
    await appendStatement(db, { actor: "system", eventType: "session.feedback", payload: { outcome: "no_edit" } }).run();
    await appendStatement(db, { actor: "system", eventType: "session.feedback", payload: { outcome: "edit_made" } }).run();
    // A non-feedback row must not be counted.
    await appendStatement(db, { actor: "system", eventType: "source.opened", payload: { outcome: "edit_made" } }).run();

    const summary = await summarizeFeedback(db);
    expect(summary).toEqual({ edit_made: 2, no_edit: 1 });
  });

  it("skips a corrupt feedback row without aborting the summary", async () => {
    const db = await freshTestExecutor();
    await appendStatement(db, { actor: "system", eventType: "session.feedback", payload: { outcome: "edit_made" } }).run();
    await db
      .prepare("INSERT INTO audit_log (ts, actor, event_type, payload_json) VALUES (?, ?, ?, ?)")
      .bind("2026-06-13T00:00:00.000Z", "system", "session.feedback", "{ not json")
      .run();
    const summary = await summarizeFeedback(db);
    expect(summary).toEqual({ edit_made: 1 });
  });

  it("returns an empty map when no feedback rows exist", async () => {
    const db = await freshTestExecutor();
    const summary = await summarizeFeedback(db);
    expect(summary).toEqual({});
  });
});
