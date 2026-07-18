// ABOUTME: Workers-pool tests for POST /api/queue/capture per-IP throttling — 429 + Retry-After once the
// ABOUTME: fixed window is exhausted, per-IP isolation, and the no-CF-Connecting-IP (non-edge) skip path.
import { describe, it, expect, vi } from "vitest";
import { testEnv } from "./test-env";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: { DB: testEnv.DB, CAPTURE_THROTTLE_LIMIT: "2", CAPTURE_THROTTLE_WINDOW_SECONDS: "60" },
  }),
}));
const { POST } = await import("../../src/app/api/queue/capture/route");

/**
 * All requests carry an invalid (non-JSON) body so they terminate at the cheap
 * 400 parse guard — the throttle must count them anyway (it gates the request,
 * not just successful captures), and no live Wikimedia fetch ever happens.
 */
function req(ip: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip !== null) headers["cf-connecting-ip"] = ip;
  return new Request("https://x/api/queue/capture", { method: "POST", headers, body: "not json" });
}

describe("POST /api/queue/capture — per-IP throttle", () => {
  it("refuses with 429 + Retry-After once an IP exhausts its window budget", async () => {
    expect((await POST(req("203.0.113.1"))).status).toBe(400);
    expect((await POST(req("203.0.113.1"))).status).toBe(400);
    const refused = await POST(req("203.0.113.1"));
    expect(refused.status).toBe(429);
    const retryAfter = Number(refused.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    const body = (await refused.json()) as { error: string };
    expect(body.error).toMatch(/too many/i);
  });

  it("throttles per IP — an exhausted IP does not affect another", async () => {
    expect((await POST(req("203.0.113.2"))).status).toBe(400);
    expect((await POST(req("203.0.113.2"))).status).toBe(400);
    expect((await POST(req("203.0.113.2"))).status).toBe(429);
    expect((await POST(req("203.0.113.3"))).status).toBe(400);
  });

  it("skips throttling when CF-Connecting-IP is absent (local dev/preview; Cloudflare always sets it at the edge)", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await POST(req(null))).status).toBe(400);
    }
  });
});
