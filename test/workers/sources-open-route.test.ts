// ABOUTME: Workers-pool test for POST /api/sources/open — request validation AND the server-resolved actor (CC-12/G13).
// ABOUTME: Asserts the append-only audit row records the SERVER-resolved actor, never a client-supplied string.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { makeAuditLog } from "../../src/db/audit-log";

// The route reads its bindings via getCloudflareContext(); back it with the real Miniflare D1
// (and no SESSION_SECRET, so an unauthenticated request resolves to the "system" actor).
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { DB: testEnv.DB } }),
}));

// Import AFTER vi.mock so the route picks up the mocked getCloudflareContext.
const { POST } = await import("../../src/app/api/sources/open/route");

function req(body: unknown): Request {
  return new Request("https://x/api/sources/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sources/open — request validation (no binding access on these paths)", () => {
  it("returns 400 when the body is not JSON", async () => {
    const res = await POST(new Request("https://x/api/sources/open", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Body must be JSON");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(req({ claimKey: "c".repeat(64) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when sourceRevisionId is not a number", async () => {
    const res = await POST(req({ claimKey: "c".repeat(64), url: "https://x/y", sourceRevisionId: "100" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the claimKey is not 64-char lowercase hex", async () => {
    const res = await POST(req({ claimKey: "not-hex", url: "https://x/y", sourceRevisionId: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/claimKey/);
  });
});

describe("POST /api/sources/open — server-resolved actor (no client-supplied PII in the audit log)", () => {
  beforeEach(async () => {
    await testEnv.DB.exec("DELETE FROM audit_log");
  });

  it("records the server-resolved actor ('AnonUser' when unauthenticated), ignoring any client-supplied actor", async () => {
    const claimKey = "a".repeat(64);
    // A malicious client tries to plant an arbitrary actor string in the append-only log.
    const res = await POST(req({ claimKey, url: "https://example.gov/report", sourceRevisionId: 100, actor: "attacker@evil.test" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unlocked: true });

    const rows = await makeAuditLog(d1Executor(testEnv.DB)).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe("source.opened");
    // The actor is resolved server-side, NOT taken from the request body.
    expect(rows[0].actor).toBe("AnonUser");
    expect(rows[0].actor).not.toBe("attacker@evil.test");
    // Codes-only payload — the raw url is never logged (CC-12).
    expect(JSON.stringify(rows[0].payload)).not.toContain("example.gov");
  });
});
