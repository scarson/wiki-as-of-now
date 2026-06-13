// ABOUTME: Arctic Google client factory + opaque user-id derivation — gating on creds, no live Google calls.
// ABOUTME: deriveUserId must be deterministic and must NOT leak the raw subject (CC-12); factory returns null when creds absent.
import { describe, it, expect } from "vitest";
import { makeGoogleClient, deriveUserId } from "../../src/auth/oauth";

describe("oauth google client factory", () => {
  it("returns null when either credential is absent (route should 404/disable)", () => {
    expect(makeGoogleClient({ GOOGLE_CLIENT_SECRET: "s", APP_ORIGIN: "https://x" })).toBeNull();
    expect(makeGoogleClient({ GOOGLE_CLIENT_ID: "i", APP_ORIGIN: "https://x" })).toBeNull();
    expect(makeGoogleClient({})).toBeNull();
  });

  it("returns null when the app origin is absent", () => {
    expect(makeGoogleClient({ GOOGLE_CLIENT_ID: "i", GOOGLE_CLIENT_SECRET: "s" })).toBeNull();
  });

  it("returns a client when both creds + origin are present", () => {
    const client = makeGoogleClient({ GOOGLE_CLIENT_ID: "i", GOOGLE_CLIENT_SECRET: "s", APP_ORIGIN: "https://x.dev" });
    expect(client).not.toBeNull();
  });

  it("deriveUserId is deterministic and opaque (no raw subject leaks)", async () => {
    const a = await deriveUserId("google", "subject-123");
    const b = await deriveUserId("google", "subject-123");
    expect(a).toBe(b);
    expect(a).not.toContain("subject-123");
    expect(a.startsWith("u_")).toBe(true);
  });

  it("deriveUserId distinguishes different subjects", async () => {
    expect(await deriveUserId("google", "a")).not.toBe(await deriveUserId("google", "b"));
  });

  it("deriveUserId distinguishes different providers for the same subject", async () => {
    expect(await deriveUserId("google", "x")).not.toBe(await deriveUserId("github", "x"));
  });
});
