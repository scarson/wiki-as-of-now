// ABOUTME: Tests abuse-report validation + codes-only audit row (G13, CC-12). Pure logic + real D1.
// ABOUTME: A free-text description must never reach the persisted payload; only a category code + optional claim key.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { validateAbuseReport, recordAbuseReport, ABUSE_CATEGORIES } from "../../src/abuse/report";
import { makeAuditLog } from "../../src/db/audit-log";

describe("abuse report", () => {
  it("accepts a known category and optional claim key", () => {
    const r = validateAbuseReport({ category: "machine_text", claimKey: "a".repeat(64) });
    expect(r.ok).toBe(true);
  });

  it("accepts a known category with no claim key", () => {
    const r = validateAbuseReport({ category: "other" });
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown category", () => {
    const r = validateAbuseReport({ category: "not_a_category" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/category/i);
  });

  it("rejects an empty category", () => {
    const r = validateAbuseReport({ category: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-64-hex claim key rather than persisting raw input (G13)", () => {
    const r = validateAbuseReport({ category: "other", claimKey: "DROP TABLE audit_log" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/claimKey|hex/i);
  });

  it("rejects an uppercase-hex claim key (canonical form is lowercase)", () => {
    const r = validateAbuseReport({ category: "other", claimKey: "A".repeat(64) });
    expect(r.ok).toBe(false);
  });

  it("writes a codes-only audit row that excludes any free-text description (CC-12)", async () => {
    const db = await freshTestExecutor();
    await recordAbuseReport(db, {
      category: "unverified_citation",
      claimKey: "b".repeat(64),
      description: "the reporter typed a long PII-laden complaint here",
    } as never);
    const rows = await makeAuditLog(db).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe("abuse.report");
    expect(rows[0].payload).toEqual({ category: "unverified_citation", claimKey: "b".repeat(64) });
    // The free-text description must NOT appear anywhere in the persisted payload.
    expect(JSON.stringify(rows[0].payload)).not.toMatch(/reporter typed/);
  });

  it("omits claimKey from the audit row when not provided", async () => {
    const db = await freshTestExecutor();
    await recordAbuseReport(db, { category: "machine_text" });
    const rows = await makeAuditLog(db).read();
    expect(rows[0].payload).toEqual({ category: "machine_text" });
  });

  it("does not persist anything when validation fails", async () => {
    const db = await freshTestExecutor();
    const r = await recordAbuseReport(db, { category: "nope" });
    expect(r.ok).toBe(false);
    const rows = await makeAuditLog(db).read();
    expect(rows).toHaveLength(0);
  });

  it("exposes the canonical category set for the UI", () => {
    expect(ABUSE_CATEGORIES).toContain("machine_text");
    expect(ABUSE_CATEGORIES).toContain("unverified_citation");
    expect(ABUSE_CATEGORIES).toContain("other");
  });
});
