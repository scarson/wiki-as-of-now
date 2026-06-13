// ABOUTME: Auth-mode resolution from env presence + admin-secret verify (fail-closed, timing-constant compare).
// ABOUTME: Covers both flag states and the empty/wrong/absent-secret rejection paths (testing-pitfalls §3/§6).
import { describe, it, expect, vi } from "vitest";
import { resolveAuthMode, verifyAdminSecret, SINGLE_ADMIN_USER_ID } from "../../src/auth/mode";

describe("auth mode resolution", () => {
  it("resolves oauth mode when both Google creds are present", () => {
    const env = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", SESSION_SECRET: "s" };
    expect(resolveAuthMode(env)).toBe("oauth");
  });

  it("falls back to single-admin mode when either Google cred is absent", () => {
    expect(resolveAuthMode({ GOOGLE_CLIENT_ID: "id", SESSION_SECRET: "s" })).toBe("single-admin");
    expect(resolveAuthMode({ GOOGLE_CLIENT_SECRET: "secret", SESSION_SECRET: "s" })).toBe("single-admin");
    expect(resolveAuthMode({ SESSION_SECRET: "s" })).toBe("single-admin");
  });

  it("falls back to single-admin when a Google cred is present but empty", () => {
    expect(resolveAuthMode({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "" })).toBe("single-admin");
  });

  it("admin-secret verify accepts the exact secret and rejects mismatches", async () => {
    const env = { ADMIN_SECRET: "the-admin-secret-value-32-bytes-xxxxxx" };
    expect(await verifyAdminSecret(env, "the-admin-secret-value-32-bytes-xxxxxx")).toBe(true);
    expect(await verifyAdminSecret(env, "wrong")).toBe(false);
    expect(await verifyAdminSecret(env, "")).toBe(false);
  });

  it("admin-secret verify rejects a same-length-but-different guess", async () => {
    const env = { ADMIN_SECRET: "abcdefghij" };
    expect(await verifyAdminSecret(env, "abcdefghiX")).toBe(false);
  });

  it("admin-secret verify rejects when no ADMIN_SECRET is configured (fail closed)", async () => {
    expect(await verifyAdminSecret({}, "anything")).toBe(false);
    expect(await verifyAdminSecret({ ADMIN_SECRET: "" }, "anything")).toBe(false);
  });

  // SECURITY (Fix 4): the compare must be constant-time regardless of input length — it MUST NOT
  // short-circuit on a length mismatch (which would leak the secret length via timing). The mechanism
  // is hash-both-then-fixed-length-compare: assert (a) correctness across many length classes and
  // (b) that crypto.subtle.digest runs for BOTH operands even on a length mismatch (no early return).
  it("rejects wrong guesses of varying length without leaking length (no length-mismatch early return)", async () => {
    const env = { ADMIN_SECRET: "abcdefghij" }; // 10 chars
    // Wrong guesses far shorter and far longer than the secret must all reject AND all run the digest path.
    for (const guess of ["", "x", "short", "abcdefghi", "abcdefghiX", "abcdefghij_way_too_long_guess_value"]) {
      expect(await verifyAdminSecret(env, guess)).toBe(false);
    }
    // The exact secret still accepts.
    expect(await verifyAdminSecret(env, "abcdefghij")).toBe(true);
  });

  it("hashes BOTH operands (no length-dependent short-circuit) — proves the constant-time mechanism", async () => {
    const env = { ADMIN_SECRET: "abcdefghij" };
    const digestSpy = vi.spyOn(crypto.subtle, "digest");
    // A length-MISMATCHED wrong guess: the old code returned false BEFORE any hashing.
    await verifyAdminSecret(env, "x");
    // Hash-then-compare must digest both the stored secret AND the presented guess (>= 2 digest calls),
    // even though their lengths differ — proving there is no length-mismatch early return.
    expect(digestSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    digestSpy.mockRestore();
  });

  it("exposes a stable single-admin user id", () => {
    expect(SINGLE_ADMIN_USER_ID).toBe("u_admin");
  });
});
