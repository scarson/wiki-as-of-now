// ABOUTME: Workers-pool test for POST /api/account/delete — deletes the profile, NULLs ledger attribution, appends audit.
// ABOUTME: Asserts global metering is preserved (row survives with user_id=NULL); anonymous → 401; stale JWT → idempotent 200; batch is atomic.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testEnv } from "./test-env";
import { issueSession } from "../../src/auth/session";
import { d1Executor } from "../../src/db/client";
import { upsertUser } from "../../src/db/users";
import { makeAuditLog } from "../../src/db/audit-log";
import { countPacksGlobalOnDay, countPacksForUserOnDay } from "../../src/db/quota-ledger";

const SESSION_SECRET = "account-delete-test-secret-32-bytes-xxx";
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { DB: testEnv.DB, SESSION_SECRET } }) }));
const { POST } = await import("../../src/app/api/account/delete/route");

const db = () => d1Executor(testEnv.DB);
async function authedReq(userId: string): Promise<Request> {
  const token = await issueSession({ userId }, SESSION_SECRET, { ttlSeconds: 3600 });
  return new Request("https://x/api/account/delete", { method: "POST", headers: { cookie: `wikinow_session=${token}` } });
}
async function seedUserWithLedger(userId: string, day = "2026-07-14T00:00:00.000Z") {
  await upsertUser(db(), { userId, identityProvider: "google", identitySubject: "sub-" + userId, email: `${userId}@e.com`, createdAt: day });
  await db().prepare("INSERT INTO quota_ledger (claim_key, source_revision_id, user_id, evaluated_at, neurons, brave_query_count) VALUES (?,?,?,?,?,?)")
    .bind("ck-" + userId, 1, userId, day, 0, 0).run();
}
async function userExists(userId: string) {
  return (await db().prepare("SELECT user_id FROM users WHERE user_id = ?").bind(userId).all<{ user_id: string }>()).length > 0;
}

describe("POST /api/account/delete", () => {
  beforeEach(async () => {
    await testEnv.DB.exec("DROP TRIGGER IF EXISTS fail_audit_insert");
    await testEnv.DB.exec("DELETE FROM quota_ledger");
    await testEnv.DB.exec("DELETE FROM users");
    await testEnv.DB.exec("DELETE FROM audit_log");
  });

  it("deletes the user, NULLs their ledger attribution (row kept for the global cap), appends one account.deleted, clears cookie", async () => {
    await seedUserWithLedger("u_del");
    const day = "2026-07-14";
    expect(await countPacksGlobalOnDay(db(), day)).toBe(1);
    const res = await POST(await authedReq("u_del"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "deleted" });
    expect(res.headers.get("set-cookie")).toContain("wikinow_session=;");
    expect(await userExists("u_del")).toBe(false);
    expect(await countPacksGlobalOnDay(db(), day)).toBe(1);        // global count PRESERVED
    expect(await countPacksForUserOnDay(db(), "u_del", day)).toBe(0); // attribution gone
    const del = (await makeAuditLog(db()).read()).filter((r) => r.eventType === "account.deleted");
    expect(del).toHaveLength(1);
    expect(del[0].actor).toBe("u_del");
  });

  it("deletes cleanly for a user with zero ledger rows", async () => {
    await upsertUser(db(), { userId: "u_none", identityProvider: "google", identitySubject: "s", email: "n@e.com", createdAt: "2026-07-14T00:00:00.000Z" });
    const res = await POST(await authedReq("u_none"));
    expect(res.status).toBe(200);
    expect(await userExists("u_none")).toBe(false);
  });

  it("rejects anonymous with 401 and mutates nothing", async () => {
    await seedUserWithLedger("u_keep");
    const res = await POST(new Request("https://x/api/account/delete", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(await userExists("u_keep")).toBe(true);
    expect(await makeAuditLog(db()).read()).toHaveLength(0);
  });

  it("returns idempotent 200 for a valid JWT whose user row is already gone, WITHOUT appending audit (replay guard)", async () => {
    // No users row seeded — simulates a replayed post-deletion session token.
    const res = await POST(await authedReq("u_ghost"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "deleted" });
    expect(res.headers.get("set-cookie")).toContain("wikinow_session=;");
    expect(await makeAuditLog(db()).read()).toHaveLength(0); // replays must not spam account.deleted
  });

  it("rejects a POST whose Origin header does not match the request origin (CSRF) and mutates nothing", async () => {
    await seedUserWithLedger("u_csrf");
    const token = await issueSession({ userId: "u_csrf" }, SESSION_SECRET, { ttlSeconds: 3600 });
    const res = await POST(
      new Request("https://x/api/account/delete", {
        method: "POST",
        headers: { cookie: `wikinow_session=${token}`, origin: "https://evil.scarson.io" },
      }),
    );
    expect(res.status).toBe(403);
    expect(await userExists("u_csrf")).toBe(true);
    expect(await makeAuditLog(db()).read()).toHaveLength(0);
  });

  it("accepts a POST whose Origin header matches the request origin", async () => {
    await seedUserWithLedger("u_sameorigin");
    const token = await issueSession({ userId: "u_sameorigin" }, SESSION_SECRET, { ttlSeconds: 3600 });
    const res = await POST(
      new Request("https://x/api/account/delete", {
        method: "POST",
        headers: { cookie: `wikinow_session=${token}`, origin: "https://x" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await userExists("u_sameorigin")).toBe(false);
  });

  it("appendIfUserExistsStatement appends only when the user row exists (race-safe replay guard)", async () => {
    const { appendIfUserExistsStatement } = await import("../../src/db/audit-log");
    const exec = db();
    // No users row → the conditional insert must be a no-op even when executed directly
    // (covers the check-then-batch race: a concurrent delete can remove the row between
    // the route's fast-path check and the batch executing).
    await exec.batch([appendIfUserExistsStatement(exec, { actor: "u_gone", eventType: "account.deleted", payload: {} }, "u_gone")]);
    expect(await makeAuditLog(exec).read()).toHaveLength(0);

    await upsertUser(exec, { userId: "u_here", identityProvider: "google", identitySubject: "s", email: "h@e.com", createdAt: "2026-07-18T00:00:00.000Z" });
    await exec.batch([appendIfUserExistsStatement(exec, { actor: "u_here", eventType: "account.deleted", payload: {} }, "u_here")]);
    const rows = await makeAuditLog(exec).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe("u_here");
  });

  it("rolls back the ledger UPDATE and user DELETE when the audit append fails (atomic batch)", async () => {
    await seedUserWithLedger("u_atomic");
    await testEnv.DB.exec(
      "CREATE TRIGGER fail_audit_insert BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END"
    );
    await expect(POST(await authedReq("u_atomic"))).rejects.toThrow();
    expect(await userExists("u_atomic")).toBe(true); // user delete rolled back
    const attributed = await db().prepare("SELECT user_id FROM quota_ledger WHERE claim_key = 'ck-u_atomic'").all<{ user_id: string | null }>();
    expect(attributed[0].user_id).toBe("u_atomic"); // ledger update rolled back
  });
});
