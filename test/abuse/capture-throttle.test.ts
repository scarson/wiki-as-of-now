// ABOUTME: Unit tests for the in-memory per-IP fixed-window capture throttle (pure logic, injected clock).
// ABOUTME: Covers window accounting, retry-after math, per-key isolation, key-cap eviction, and env config parsing.
import { describe, it, expect } from "vitest";
import {
  createCaptureThrottle,
  loadCaptureThrottleConfig,
  DEFAULT_CAPTURE_THROTTLE_LIMIT,
  DEFAULT_CAPTURE_THROTTLE_WINDOW_SECONDS,
  MAX_TRACKED_KEYS,
} from "../../src/abuse/capture-throttle";

const T0 = Date.parse("2026-07-18T12:00:00.000Z");
const CONFIG = { limit: 3, windowSeconds: 60 };

describe("createCaptureThrottle", () => {
  it("allows requests up to the limit within one window", () => {
    const throttle = createCaptureThrottle(CONFIG);
    expect(throttle.check("1.2.3.4", T0)).toEqual({ allowed: true });
    expect(throttle.check("1.2.3.4", T0 + 1_000)).toEqual({ allowed: true });
    expect(throttle.check("1.2.3.4", T0 + 2_000)).toEqual({ allowed: true });
  });

  it("refuses the request after the limit is reached, with retry-after to window end", () => {
    const throttle = createCaptureThrottle(CONFIG);
    for (let i = 0; i < CONFIG.limit; i++) throttle.check("1.2.3.4", T0);
    const decision = throttle.check("1.2.3.4", T0 + 10_000);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      // window ends at T0 + 60s; refused at T0 + 10s → 50s remain
      expect(decision.retryAfterSeconds).toBe(50);
    }
  });

  it("rounds retry-after up to a whole second (never 0 while refused)", () => {
    const throttle = createCaptureThrottle(CONFIG);
    for (let i = 0; i < CONFIG.limit; i++) throttle.check("1.2.3.4", T0);
    const decision = throttle.check("1.2.3.4", T0 + 59_500);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.retryAfterSeconds).toBe(1);
  });

  it("starts a fresh window (fresh budget) once the previous window has elapsed", () => {
    const throttle = createCaptureThrottle(CONFIG);
    for (let i = 0; i < CONFIG.limit; i++) throttle.check("1.2.3.4", T0);
    expect(throttle.check("1.2.3.4", T0 + 59_999).allowed).toBe(false);
    expect(throttle.check("1.2.3.4", T0 + 60_000).allowed).toBe(true);
  });

  it("tracks each key independently — one exhausted IP never affects another", () => {
    const throttle = createCaptureThrottle(CONFIG);
    for (let i = 0; i < CONFIG.limit; i++) throttle.check("1.2.3.4", T0);
    expect(throttle.check("1.2.3.4", T0).allowed).toBe(false);
    expect(throttle.check("5.6.7.8", T0).allowed).toBe(true);
  });

  it("refused attempts do not extend the window", () => {
    const throttle = createCaptureThrottle(CONFIG);
    for (let i = 0; i < CONFIG.limit; i++) throttle.check("1.2.3.4", T0);
    // hammering while refused…
    for (let i = 0; i < 20; i++) throttle.check("1.2.3.4", T0 + 30_000);
    // …still gets a fresh window at the original window end
    expect(throttle.check("1.2.3.4", T0 + 60_000).allowed).toBe(true);
  });

  it("bounds tracked keys: expired entries are pruned rather than accumulating forever", () => {
    const throttle = createCaptureThrottle(CONFIG);
    // Fill to the cap with keys whose windows all expire at T0 + 60s.
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) throttle.check(`ip-${i}`, T0);
    // After expiry a brand-new key must still be accepted (prune made room),
    // and an old key gets a fresh budget rather than a stale refusal.
    expect(throttle.check("fresh-key", T0 + 61_000).allowed).toBe(true);
    for (let i = 0; i < CONFIG.limit; i++) {
      expect(throttle.check("ip-0", T0 + 61_000).allowed).toBe(true);
    }
    expect(throttle.check("ip-0", T0 + 61_000).allowed).toBe(false);
  });

  it("under live-key pressure at the cap, evicts the oldest key instead of failing open for none or growing unbounded", () => {
    const throttle = createCaptureThrottle(CONFIG);
    // Exhaust key A, then flood with MAX_TRACKED_KEYS distinct live keys in the same window.
    for (let i = 0; i < CONFIG.limit; i++) throttle.check("victim", T0);
    expect(throttle.check("victim", T0).allowed).toBe(false);
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) throttle.check(`flood-${i}`, T0 + 1);
    // "victim" was the oldest tracked key; eviction means its refusal state is
    // forgotten — the honest failure mode of a bounded in-memory throttle
    // (fails open per-key under memory pressure, never blocks legitimate users).
    expect(throttle.check("victim", T0 + 2).allowed).toBe(true);
  });
});

describe("loadCaptureThrottleConfig", () => {
  it("returns defaults when env vars are absent or empty", () => {
    expect(loadCaptureThrottleConfig({})).toEqual({
      limit: DEFAULT_CAPTURE_THROTTLE_LIMIT,
      windowSeconds: DEFAULT_CAPTURE_THROTTLE_WINDOW_SECONDS,
    });
    expect(
      loadCaptureThrottleConfig({ CAPTURE_THROTTLE_LIMIT: "", CAPTURE_THROTTLE_WINDOW_SECONDS: "" })
    ).toEqual({
      limit: DEFAULT_CAPTURE_THROTTLE_LIMIT,
      windowSeconds: DEFAULT_CAPTURE_THROTTLE_WINDOW_SECONDS,
    });
  });

  it("parses explicit positive-integer overrides", () => {
    expect(
      loadCaptureThrottleConfig({ CAPTURE_THROTTLE_LIMIT: "2", CAPTURE_THROTTLE_WINDOW_SECONDS: "10" })
    ).toEqual({ limit: 2, windowSeconds: 10 });
  });

  it("rejects non-integer, zero, and negative values at load (fail at load, not first use)", () => {
    expect(() => loadCaptureThrottleConfig({ CAPTURE_THROTTLE_LIMIT: "abc" })).toThrow(/CAPTURE_THROTTLE_LIMIT/);
    expect(() => loadCaptureThrottleConfig({ CAPTURE_THROTTLE_LIMIT: "0" })).toThrow(/CAPTURE_THROTTLE_LIMIT/);
    expect(() => loadCaptureThrottleConfig({ CAPTURE_THROTTLE_WINDOW_SECONDS: "-5" })).toThrow(
      /CAPTURE_THROTTLE_WINDOW_SECONDS/
    );
    expect(() => loadCaptureThrottleConfig({ CAPTURE_THROTTLE_WINDOW_SECONDS: "1.5" })).toThrow(
      /CAPTURE_THROTTLE_WINDOW_SECONDS/
    );
  });
});
