// ABOUTME: Tests gateAuditEntry + confirmSourceOpened — the codes-only audit entry for the G5 source-open gate.
// ABOUTME: Verifies no URL/quote/PII leaks into the payload (CC-12); only identifiers; real D1 append-only assertions.
import { describe, it, expect, beforeEach } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import type { SqlExecutor } from "../../src/db/client";
import { makeAuditLog } from "../../src/db/audit-log";
import { gateAuditEntry, confirmSourceOpened, SOURCE_OPENED_EVENT_TYPE } from "../../src/worksheet/source-gate";

describe("gateAuditEntry", () => {
  it("builds a codes-only entry: claimKey + sourceRevisionId + a urlHash, never the raw url", () => {
    const entry = gateAuditEntry({ actor: "admin", claimKey: "b".repeat(64), sourceRevisionId: 100, urlHash: "deadbeef" });
    expect(entry.eventType).toBe(SOURCE_OPENED_EVENT_TYPE);
    expect(entry.actor).toBe("admin");
    expect(entry.payload).toEqual({ claimKey: "b".repeat(64), sourceRevisionId: 100, urlHash: "deadbeef" });
  });

  it("never carries the raw url, the quote, or any free text in the payload (CC-12)", () => {
    const entry = gateAuditEntry({ actor: "admin", claimKey: "b".repeat(64), sourceRevisionId: 100, urlHash: "deadbeef" });
    expect(JSON.stringify(entry.payload)).not.toContain("http");
    expect(JSON.stringify(entry.payload)).not.toContain("quote");
  });
});

describe("confirmSourceOpened (G5 gate, real D1)", () => {
  let db: SqlExecutor;
  beforeEach(async () => { db = await freshTestExecutor(); });

  it("appends exactly one codes-only audit row and reports unlocked", async () => {
    const res = await confirmSourceOpened(db, { actor: "admin", claimKey: "c".repeat(64), sourceRevisionId: 100, url: "https://example.gov/report" });
    expect(res.unlocked).toBe(true);

    const rows = await makeAuditLog(db).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe("source.opened");
    const payload = rows[0].payload as Record<string, unknown>;
    expect(payload.claimKey).toBe("c".repeat(64));
    expect(payload.sourceRevisionId).toBe(100);
    expect(JSON.stringify(payload)).not.toContain("example.gov"); // raw url never logged (CC-12)
  });

  it("logs a stable hash identifier of the source, not the raw url", async () => {
    await confirmSourceOpened(db, { actor: "admin", claimKey: "c".repeat(64), sourceRevisionId: 100, url: "https://example.gov/report" });
    const rows = await makeAuditLog(db).read();
    const payload = rows[0].payload as Record<string, unknown>;
    expect(typeof payload.urlHash).toBe("string");
    expect(payload.urlHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex, not the url
  });

  it("rejects a non-64-hex claimKey before any audit write (no malformed identifiers in the log)", async () => {
    await expect(confirmSourceOpened(db, { actor: "admin", claimKey: "not-hex", sourceRevisionId: 100, url: "https://x/y" }))
      .rejects.toThrow(/claimKey/);
    const rows = await makeAuditLog(db).read();
    expect(rows).toHaveLength(0); // nothing written on rejection
  });
});
