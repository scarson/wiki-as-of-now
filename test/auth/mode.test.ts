// ABOUTME: Auth-mode resolution from env presence + admin-secret verify (fail-closed, timing-constant compare).
// ABOUTME: Covers both flag states and the empty/wrong/absent-secret rejection paths (testing-pitfalls §3/§6).
import { describe, it, expect } from "vitest";
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

  it("admin-secret verify accepts the exact secret and rejects mismatches", () => {
    const env = { ADMIN_SECRET: "the-admin-secret-value-32-bytes-xxxxxx" };
    expect(verifyAdminSecret(env, "the-admin-secret-value-32-bytes-xxxxxx")).toBe(true);
    expect(verifyAdminSecret(env, "wrong")).toBe(false);
    expect(verifyAdminSecret(env, "")).toBe(false);
  });

  it("admin-secret verify rejects a same-length-but-different guess", () => {
    const env = { ADMIN_SECRET: "abcdefghij" };
    expect(verifyAdminSecret(env, "abcdefghiX")).toBe(false);
  });

  it("admin-secret verify rejects when no ADMIN_SECRET is configured (fail closed)", () => {
    expect(verifyAdminSecret({}, "anything")).toBe(false);
    expect(verifyAdminSecret({ ADMIN_SECRET: "" }, "anything")).toBe(false);
  });

  it("exposes a stable single-admin user id", () => {
    expect(SINGLE_ADMIN_USER_ID).toBe("u_admin");
  });
});
