// ABOUTME: Workers-pool tests for POST /api/queue/capture rate limiting via the CAPTURE_RATE_LIMITER
// ABOUTME: binding — our wiring only (key choice, gate order, 429 shaping, fail-open); CF owns the counters.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testEnv } from "./test-env";

/**
 * Deterministic fake of the Workers Rate Limiting binding: fixed budget per key,
 * records every key passed. Tests OUR integration; Cloudflare's counter mechanics
 * are their contract (like D1's atomicity), not under test here.
 */
function fakeRateLimiter(limit: number) {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }: { key: string }): Promise<{ success: boolean }> {
      keys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= limit };
    },
  };
}

let mockEnv: Record<string, unknown>;
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: mockEnv }),
}));
const { POST } = await import("../../src/app/api/queue/capture/route");

function req(ip: string | null, extraHeaders: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
  if (ip !== null) headers["cf-connecting-ip"] = ip;
  // Invalid body: requests terminate at the cheap 400 parse guard, so no live
  // Wikimedia fetch ever happens; the limiter must still count them.
  return new Request("https://x/api/queue/capture", { method: "POST", headers, body: "not json" });
}

beforeEach(() => {
  mockEnv = { DB: testEnv.DB, CAPTURE_RATE_LIMITER: fakeRateLimiter(2) };
});

describe("POST /api/queue/capture — rate limiting via the binding", () => {
  it("passes CF-Connecting-IP as the limit key and refuses with 429 + Retry-After once the binding says no", async () => {
    const limiter = fakeRateLimiter(2);
    mockEnv.CAPTURE_RATE_LIMITER = limiter;
    expect((await POST(req("203.0.113.1"))).status).toBe(400);
    expect((await POST(req("203.0.113.1"))).status).toBe(400);
    const refused = await POST(req("203.0.113.1"));
    expect(refused.status).toBe(429);
    // Retry-After is the window length — an upper bound; limit() reports only success.
    expect(refused.headers.get("retry-after")).toBe("60");
    const body = (await refused.json()) as { error: string };
    expect(body.error).toMatch(/too many/i);
    expect(limiter.keys).toEqual(["203.0.113.1", "203.0.113.1", "203.0.113.1"]);
  });

  it("limits per key — an exhausted IP does not affect another", async () => {
    expect((await POST(req("203.0.113.2"))).status).toBe(400);
    expect((await POST(req("203.0.113.2"))).status).toBe(400);
    expect((await POST(req("203.0.113.2"))).status).toBe(429);
    expect((await POST(req("203.0.113.3"))).status).toBe(400);
  });

  it("fails open when the binding is absent (local dev/preview has no ratelimits binding)", async () => {
    delete mockEnv.CAPTURE_RATE_LIMITER;
    for (let i = 0; i < 5; i++) {
      expect((await POST(req("203.0.113.4"))).status).toBe(400);
    }
  });

  it("fails open when limit() throws — the abuse brake must never become an availability dependency", async () => {
    mockEnv.CAPTURE_RATE_LIMITER = {
      async limit(): Promise<{ success: boolean }> {
        throw new Error("binding unavailable");
      },
    };
    for (let i = 0; i < 3; i++) {
      expect((await POST(req("203.0.113.6"))).status).toBe(400);
    }
  });

  it("skips the limiter when CF-Connecting-IP is absent (Cloudflare always sets it at the edge)", async () => {
    const limiter = fakeRateLimiter(2);
    mockEnv.CAPTURE_RATE_LIMITER = limiter;
    for (let i = 0; i < 5; i++) {
      expect((await POST(req(null))).status).toBe(400);
    }
    expect(limiter.keys).toEqual([]);
  });

  it("refuses cross-origin POSTs with 403 BEFORE consulting the limiter (drive-by budget-drain defense)", async () => {
    const limiter = fakeRateLimiter(2);
    mockEnv.CAPTURE_RATE_LIMITER = limiter;
    for (let i = 0; i < 5; i++) {
      const res = await POST(req("203.0.113.5", { origin: "https://evil.example" }));
      expect(res.status).toBe(403);
    }
    expect(limiter.keys, "cross-origin requests must never charge the budget").toEqual([]);
    // The victim's own (same-origin) budget is untouched.
    expect((await POST(req("203.0.113.5", { origin: "https://x" }))).status).toBe(400);
  });
});
