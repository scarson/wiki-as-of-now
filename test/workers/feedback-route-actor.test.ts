// ABOUTME: Workers-pool test for POST /api/feedback — the anonymous branch records actor 'AnonUser' (not 'system'),
// ABOUTME: so audit rows distinguish anonymous humans from genuine backend actions. Server-resolved, never client-supplied.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { makeAuditLog } from "../../src/db/audit-log";

// No SESSION_SECRET → every request resolves anonymous.
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { DB: testEnv.DB } }),
}));
const { POST } = await import("../../src/app/api/feedback/route");

describe("POST /api/feedback — anonymous actor label", () => {
  beforeEach(async () => {
    await testEnv.DB.exec("DELETE FROM audit_log");
  });

  it("returns 400 for an unknown outcome code", async () => {
    const res = await POST(
      new Request("https://x/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome: "made_it_worse" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 (not 400) when the audit write itself fails", async () => {
    await testEnv.DB.exec(
      "CREATE TRIGGER fail_feedback_insert BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'forced'); END",
    );
    try {
      const res = await POST(
        new Request("https://x/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outcome: "no_edit" }),
        }),
      );
      expect(res.status).toBe(500);
    } finally {
      await testEnv.DB.exec("DROP TRIGGER IF EXISTS fail_feedback_insert");
    }
  });

  it("records actor 'AnonUser' for an anonymous submission", async () => {
    const res = await POST(
      new Request("https://x/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome: "no_edit" }),
      }),
    );
    expect(res.status).toBe(200);
    const rows = await makeAuditLog(d1Executor(testEnv.DB)).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe("session.feedback");
    expect(rows[0].actor).toBe("AnonUser");
  });
});
