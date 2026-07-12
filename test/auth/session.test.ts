// ABOUTME: Real-jose session round-trip + the security rejection paths (wrong secret, tamper, expiry, malformed).
// ABOUTME: No mock verifier — a mocked verifier would test the mock, not the crypto (testing-pitfalls §7).
import { describe, it, expect } from "vitest";
import { issueSession, verifySession } from "../../src/auth/session";

const SECRET = "test-session-secret-at-least-32-bytes-long!!";

describe("session JWT (real jose)", () => {
  it("round-trips a session: issue then verify returns the same userId", async () => {
    const token = await issueSession({ userId: "u_abc" }, SECRET, { ttlSeconds: 3600 });
    const claims = await verifySession(token, SECRET);
    expect(claims.userId).toBe("u_abc");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await issueSession({ userId: "u_abc" }, SECRET, { ttlSeconds: 3600 });
    await expect(verifySession(token, "a-totally-different-secret-32-bytes-xx")).rejects.toThrow();
  });

  it("rejects a tampered token (payload mutated)", async () => {
    const token = await issueSession({ userId: "u_abc" }, SECRET, { ttlSeconds: 3600 });
    const parts = token.split(".");
    // Flip a char in the payload segment.
    const mutatedPayload = parts[1].slice(0, -1) + (parts[1].endsWith("A") ? "B" : "A");
    const tampered = [parts[0], mutatedPayload, parts[2]].join(".");
    await expect(verifySession(tampered, SECRET)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await issueSession({ userId: "u_abc" }, SECRET, { ttlSeconds: -1 });
    await expect(verifySession(token, SECRET)).rejects.toThrow();
  });

  it("rejects a structurally invalid token", async () => {
    await expect(verifySession("not-a-jwt", SECRET)).rejects.toThrow();
  });

  it("rejects a token missing the userId claim", async () => {
    // A token signed for a different shape (no userId) must not verify as a session.
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(SECRET);
    const noUser = await new SignJWT({ other: "x" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    await expect(verifySession(noUser, SECRET)).rejects.toThrow();
  });

  it("the token carries NO PII — only the opaque userId (CC-12)", async () => {
    const token = await issueSession({ userId: "u_abc" }, SECRET, { ttlSeconds: 3600 });
    // Decode the payload segment and assert no email / no raw http(s) URL / no provider subject.
    const payloadJson = Buffer.from(token.split(".")[1], "base64url").toString("utf8");
    expect(payloadJson).not.toContain("@");
    expect(payloadJson).not.toContain("http");
    const decoded = JSON.parse(payloadJson) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(["exp", "iat", "userId"]);
  });
});
