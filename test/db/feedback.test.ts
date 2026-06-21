// ABOUTME: Tests session-completion feedback as codes-only audit rows over the existing audit_log (G13, CC-12).
// ABOUTME: Quality-not-volume — outcome codes only, never free text/PII; additive, no second table or pipeline.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { recordFeedback, appendFeedbackStatement, type FeedbackEntry } from "../../src/db/feedback";
import { makeAuditLog } from "../../src/db/audit-log";

describe("session-completion feedback", () => {
  it("writes a codes-only session.feedback audit row with an outcome code", async () => {
    const db = await freshTestExecutor();
    await recordFeedback(db, { actor: "system", outcome: "edit_made", claimKey: "a".repeat(64) });

    const rows = await makeAuditLog(db).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe("session.feedback");
    expect(rows[0].actor).toBe("system");
    expect(rows[0].payload).toEqual({ outcome: "edit_made", claimKey: "a".repeat(64) });
  });

  it("omits claimKey from the payload when not provided (no empty-string leakage)", async () => {
    const db = await freshTestExecutor();
    await recordFeedback(db, { actor: "system", outcome: "no_edit" });
    const rows = await makeAuditLog(db).read();
    expect(rows[0].payload).toEqual({ outcome: "no_edit" });
  });

  it("rejects an unknown outcome code rather than persisting an arbitrary string (no PII channel)", async () => {
    const db = await freshTestExecutor();
    await expect(
      recordFeedback(db, { actor: "system", outcome: "free text the user typed" as FeedbackEntry["outcome"] }),
    ).rejects.toThrow(/outcome/i);
    const rows = await makeAuditLog(db).read();
    expect(rows).toHaveLength(0); // nothing persisted on rejection
  });

  it("rejects an empty outcome string rather than persisting it", async () => {
    const db = await freshTestExecutor();
    await expect(
      recordFeedback(db, { actor: "system", outcome: "" as FeedbackEntry["outcome"] }),
    ).rejects.toThrow(/outcome/i);
    const rows = await makeAuditLog(db).read();
    expect(rows).toHaveLength(0);
  });

  it("accepts all three canonical outcome codes", async () => {
    const db = await freshTestExecutor();
    await recordFeedback(db, { actor: "system", outcome: "edit_made" });
    await recordFeedback(db, { actor: "u_admin", outcome: "no_edit" });
    await recordFeedback(db, { actor: "system", outcome: "abandoned" });
    const rows = await makeAuditLog(db).read();
    expect(rows.map((r) => (r.payload as { outcome: string }).outcome)).toEqual(["edit_made", "no_edit", "abandoned"]);
    expect(rows[1].actor).toBe("u_admin"); // actor passes through (Phase 5 identity convention)
  });

  it("appendFeedbackStatement returns a bound unexecuted statement that can join an atomic batch", async () => {
    const db = await freshTestExecutor();
    const stmt = appendFeedbackStatement(db, { actor: "system", outcome: "abandoned" });
    await db.batch([stmt]); // executes atomically
    const rows = await makeAuditLog(db).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ outcome: "abandoned" });
  });

  it("appendFeedbackStatement validates the outcome before returning a statement", () => {
    const db = freshTestExecutor();
    expect(() => appendFeedbackStatement(db, { actor: "system", outcome: "bogus" as FeedbackEntry["outcome"] })).toThrow(/outcome/i);
  });
});
