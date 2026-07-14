// ABOUTME: Cookie serialization — asserts the hardened attribute set (HttpOnly/Secure/SameSite=Lax) and clear semantics.
// ABOUTME: These attributes are security-relevant (session + OAuth-state cookies), so they are pinned by test.
import { describe, it, expect } from "vitest";
import { serializeCookie, clearCookie } from "../../src/auth/cookies";

describe("auth cookies", () => {
  it("serializes a hardened cookie with HttpOnly, Secure, SameSite=Lax and Max-Age", () => {
    const c = serializeCookie("wikinow_session", "tok.en", { maxAgeSeconds: 3600 });
    expect(c).toContain("wikinow_session=tok.en");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Max-Age=3600");
    expect(c).toContain("Path=/");
  });

  it("URL-encodes the value so a token's special chars cannot break the header", () => {
    const c = serializeCookie("k", "a b;c", { maxAgeSeconds: 60 });
    expect(c).toContain("k=a%20b%3Bc");
  });

  it("honours a custom path", () => {
    const c = serializeCookie("k", "v", { maxAgeSeconds: 60, path: "/api/auth" });
    expect(c).toContain("Path=/api/auth");
  });

  it("clearCookie expires the cookie immediately (Max-Age=0)", () => {
    const c = clearCookie("wikinow_session");
    expect(c).toContain("wikinow_session=;");
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("HttpOnly");
  });
});
