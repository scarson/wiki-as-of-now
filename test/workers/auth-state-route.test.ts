// ABOUTME: Workers-pool test for GET /api/auth/state — the client-readable auth signal.
// ABOUTME: Asserts authenticated/anonymous projection from a real jose session and the no-store cache header.
import { describe, it, expect, vi } from "vitest";
import { issueSession } from "../../src/auth/session";

const SESSION_SECRET = "auth-state-route-test-secret-32-bytes-xx";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { SESSION_SECRET } }),
}));

const { GET } = await import("../../src/app/api/auth/state/route");

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/auth/state", { method: "GET", headers });
}

describe("GET /api/auth/state", () => {
  it("returns authenticated:true for a valid session cookie", async () => {
    const token = await issueSession({ userId: "u_real" }, SESSION_SECRET, { ttlSeconds: 3600 });
    const res = await GET(req({ cookie: `wikinow_session=${token}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true });
  });

  it("returns authenticated:false when no session cookie is present", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it("never caches the per-user signal", async () => {
    const res = await GET(req());
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
