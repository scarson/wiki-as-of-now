// ABOUTME: resolveCurrentUser branch coverage — valid session, forged/expired session, admin-secret fallback, anonymous default.
// ABOUTME: Real jose sessions (issueSession) so the cookie path exercises real verification, not a stub.
import { describe, it, expect } from "vitest";
import { resolveCurrentUser, SESSION_COOKIE, ADMIN_SECRET_HEADER } from "../../src/auth/current-user";
import { issueSession } from "../../src/auth/session";

const SESSION_SECRET = "current-user-test-secret-at-least-32-bytes!";

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/research/1", { method: "POST", headers });
}

describe("resolveCurrentUser", () => {
  it("authenticates from a valid session cookie", async () => {
    const token = await issueSession({ userId: "u_real" }, SESSION_SECRET, { ttlSeconds: 3600 });
    const ctx = await resolveCurrentUser(reqWith({ cookie: `${SESSION_COOKIE}=${token}` }), { SESSION_SECRET });
    expect(ctx).toEqual({ kind: "authenticated", userId: "u_real" });
  });

  it("ignores a session cookie signed with the wrong secret and falls through to anonymous", async () => {
    const token = await issueSession({ userId: "u_real" }, "some-other-secret-32-bytes-xxxxxxxxxxx", { ttlSeconds: 3600 });
    const ctx = await resolveCurrentUser(reqWith({ cookie: `${SESSION_COOKIE}=${token}` }), { SESSION_SECRET });
    expect(ctx).toEqual({ kind: "anonymous" });
  });

  it("treats an expired session as not-authenticated (anonymous)", async () => {
    const token = await issueSession({ userId: "u_real" }, SESSION_SECRET, { ttlSeconds: -1 });
    const ctx = await resolveCurrentUser(reqWith({ cookie: `${SESSION_COOKIE}=${token}` }), { SESSION_SECRET });
    expect(ctx).toEqual({ kind: "anonymous" });
  });

  it("in single-admin mode, a valid ADMIN_SECRET header authenticates as the single-admin user", async () => {
    const ctx = await resolveCurrentUser(
      reqWith({ [ADMIN_SECRET_HEADER]: "admin-secret-value-32-bytes-xxxxxxxxx" }),
      { ADMIN_SECRET: "admin-secret-value-32-bytes-xxxxxxxxx" },
    );
    expect(ctx).toEqual({ kind: "authenticated", userId: "u_admin" });
  });

  it("rejects a wrong ADMIN_SECRET header (anonymous)", async () => {
    const ctx = await resolveCurrentUser(
      reqWith({ [ADMIN_SECRET_HEADER]: "wrong" }),
      { ADMIN_SECRET: "admin-secret-value-32-bytes-xxxxxxxxx" },
    );
    expect(ctx).toEqual({ kind: "anonymous" });
  });

  it("ignores the admin-secret header in oauth mode (Google creds present → sessions only)", async () => {
    const ctx = await resolveCurrentUser(
      reqWith({ [ADMIN_SECRET_HEADER]: "admin-secret-value-32-bytes-xxxxxxxxx" }),
      {
        ADMIN_SECRET: "admin-secret-value-32-bytes-xxxxxxxxx",
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        SESSION_SECRET,
      },
    );
    expect(ctx).toEqual({ kind: "anonymous" });
  });

  it("defaults to anonymous with no cookie and no admin header", async () => {
    const ctx = await resolveCurrentUser(reqWith({}), { SESSION_SECRET });
    expect(ctx).toEqual({ kind: "anonymous" });
  });

  it("prefers a valid session cookie over the admin-secret fallback", async () => {
    const token = await issueSession({ userId: "u_session" }, SESSION_SECRET, { ttlSeconds: 3600 });
    const ctx = await resolveCurrentUser(
      reqWith({ cookie: `${SESSION_COOKIE}=${token}`, [ADMIN_SECRET_HEADER]: "admin-secret-value-32-bytes-xxxxxxxxx" }),
      { SESSION_SECRET, ADMIN_SECRET: "admin-secret-value-32-bytes-xxxxxxxxx" },
    );
    expect(ctx).toEqual({ kind: "authenticated", userId: "u_session" });
  });
});
