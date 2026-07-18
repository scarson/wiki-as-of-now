// ABOUTME: Workers-pool tests for POST /api/dev/mint-session — double fail-closed gate (env flag +
// ABOUTME: admin secret), minted-session fidelity (real user row, working cookie), and deletion parity.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { getUserById } from "../../src/db/users";
import { resolveCurrentUser, SESSION_COOKIE } from "../../src/auth/current-user";

const SESSION_SECRET = "mint-route-test-session-secret-32-bytes";
const ADMIN_SECRET = "mint-route-test-admin-secret";

/** Mutable env so each test can toggle the gates; the route reads it at request time. */
let mockEnv: Record<string, unknown>;
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: mockEnv }),
}));
const { POST } = await import("../../src/app/api/dev/mint-session/route");
const { POST: DELETE_ACCOUNT } = await import("../../src/app/api/account/delete/route");

function fullEnv(): Record<string, unknown> {
  return { DB: testEnv.DB, SESSION_SECRET, ADMIN_SECRET, DEV_SESSION_MINT: "enabled" };
}

function mintReq(opts: { secret?: string; body?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.secret !== undefined) headers["x-admin-secret"] = opts.secret;
  return new Request("https://x/api/dev/mint-session", {
    method: "POST",
    headers,
    body: opts.body,
  });
}

function cookieOf(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/wikinow_session=([^;]+)/);
  return m ? `${SESSION_COOKIE}=${m[1]}` : "";
}

beforeEach(async () => {
  mockEnv = fullEnv();
  await testEnv.DB.exec("DELETE FROM audit_log");
  await testEnv.DB.exec("DELETE FROM quota_ledger");
  await testEnv.DB.exec("DELETE FROM users");
});

describe("POST /api/dev/mint-session — fail-closed gates", () => {
  it("404s when DEV_SESSION_MINT is absent, even with the correct secret", async () => {
    delete mockEnv.DEV_SESSION_MINT;
    expect((await POST(mintReq({ secret: ADMIN_SECRET }))).status).toBe(404);
  });

  it("404s when DEV_SESSION_MINT has any value other than \"enabled\"", async () => {
    mockEnv.DEV_SESSION_MINT = "true";
    expect((await POST(mintReq({ secret: ADMIN_SECRET }))).status).toBe(404);
  });

  it("404s without the admin-secret header", async () => {
    expect((await POST(mintReq())).status).toBe(404);
  });

  it("404s with a wrong admin secret", async () => {
    expect((await POST(mintReq({ secret: "wrong" }))).status).toBe(404);
  });

  it("404s when ADMIN_SECRET is not configured (fail closed), even with a header presented", async () => {
    delete mockEnv.ADMIN_SECRET;
    expect((await POST(mintReq({ secret: "anything" }))).status).toBe(404);
  });

  it("500s when SESSION_SECRET is missing but the gates pass (misconfiguration, not probing)", async () => {
    delete mockEnv.SESSION_SECRET;
    expect((await POST(mintReq({ secret: ADMIN_SECRET }))).status).toBe(500);
  });
});

describe("POST /api/dev/mint-session — minted session fidelity", () => {
  it("mints a real user row and a session cookie that resolveCurrentUser accepts", async () => {
    const res = await POST(mintReq({ secret: ADMIN_SECRET }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; subject: string; expiresInSeconds: number };
    expect(body.subject).toBe("dev-test-user");
    expect(body.expiresInSeconds).toBe(3600);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("wikinow_session=");
    expect(setCookie).toContain("HttpOnly");

    const user = await getUserById(d1Executor(testEnv.DB), body.userId);
    expect(user?.identityProvider).toBe("dev-test");
    expect(user?.email).toBe("dev-test-user@dev-test.invalid");

    const auth = await resolveCurrentUser(
      new Request("https://x/anything", { headers: { cookie: cookieOf(res) } }),
      { SESSION_SECRET }
    );
    expect(auth).toEqual({ kind: "authenticated", userId: body.userId });
  });

  it("re-minting the same subject yields the same userId (re-login semantics)", async () => {
    const a = (await (await POST(mintReq({ secret: ADMIN_SECRET }))).json()) as { userId: string };
    const b = (await (await POST(mintReq({ secret: ADMIN_SECRET }))).json()) as { userId: string };
    expect(a.userId).toBe(b.userId);
  });

  it("accepts a custom subject and derives a distinct userId", async () => {
    const a = (await (await POST(mintReq({ secret: ADMIN_SECRET }))).json()) as { userId: string };
    const res = await POST(mintReq({ secret: ADMIN_SECRET, body: JSON.stringify({ subject: "qa-alt" }) }));
    expect(res.status).toBe(200);
    const b = (await res.json()) as { userId: string; subject: string };
    expect(b.subject).toBe("qa-alt");
    expect(b.userId).not.toBe(a.userId);
  });

  it("rejects malformed subjects with 400 (uppercase, symbols, overlong, wrong type)", async () => {
    for (const subject of ["QA", "has space", "a".repeat(65), 7]) {
      const res = await POST(mintReq({ secret: ADMIN_SECRET, body: JSON.stringify({ subject }) }));
      expect(res.status, `subject ${JSON.stringify(subject)} must be refused`).toBe(400);
    }
  });

  it("rejects an invalid JSON body with 400", async () => {
    expect((await POST(mintReq({ secret: ADMIN_SECRET, body: "not json" }))).status).toBe(400);
  });
});

describe("minted session drives the real deletion flow (the QA path this route exists for)", () => {
  it("mint → delete account → row gone, cookie cleared; re-mint recreates the same userId", async () => {
    const minted = await POST(mintReq({ secret: ADMIN_SECRET }));
    const { userId } = (await minted.json()) as { userId: string };
    const cookie = cookieOf(minted);

    const del = await DELETE_ACCOUNT(
      new Request("https://x/api/account/delete", {
        method: "POST",
        headers: { cookie, origin: "https://x" },
      })
    );
    expect(del.status).toBe(200);
    expect(del.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await getUserById(d1Executor(testEnv.DB), userId)).toBeUndefined();

    const again = (await (await POST(mintReq({ secret: ADMIN_SECRET }))).json()) as { userId: string };
    expect(again.userId).toBe(userId);
  });
});
