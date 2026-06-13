// ABOUTME: Workers-pool test for POST /api/sources/open request validation (the 400 paths before any binding access).
// ABOUTME: The happy-path G5 audit-commit logic is tested against real D1 in test/worksheet/source-gate.test.ts (Node pool).
import { describe, it, expect } from "vitest";
import { POST } from "../../src/app/api/sources/open/route";

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
    const res = await POST(req({ actor: "a", claimKey: "c".repeat(64), url: "https://x/y", sourceRevisionId: "100" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the claimKey is not 64-char lowercase hex", async () => {
    const res = await POST(req({ actor: "a", claimKey: "not-hex", url: "https://x/y", sourceRevisionId: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/claimKey/);
  });
});
