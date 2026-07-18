// ABOUTME: POST /api/account/delete — deletes the user's profile (email/PII) and NULLs their quota_ledger
// ABOUTME: attribution (row kept for the global cost cap), appends account.deleted (G13), clears the session cookie.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { appendIfUserExistsStatement } from "@/db/audit-log";
import { getUserById } from "@/db/users";
import { resolveCurrentUser, SESSION_COOKIE } from "@/auth/current-user";
import { clearCookie } from "@/auth/cookies";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number, setCookie?: string): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  // CSRF guard: the session cookie is SameSite=Lax, which still accompanies top-level
  // and same-site (sibling-subdomain) POSTs. Browsers always send Origin on POST, so a
  // present-but-mismatched Origin means the request was authored by another origin —
  // refuse before touching anything. (Absent Origin = non-browser client; the JWT gate
  // below still applies.)
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin request refused" }, 403);
  }
  const { env } = getCloudflareContext();
  const auth = await resolveCurrentUser(request, env as unknown as Parameters<typeof resolveCurrentUser>[1]);
  if (auth.kind !== "authenticated") return json({ error: "Authentication required" }, 401);
  const userId = auth.userId;
  const db = d1Executor(env.DB);

  // Replay guard: a still-valid JWT can outlive the account (no revocation — design §4.3).
  // If the row is already gone the deletion happened; answer idempotently WITHOUT appending
  // another account.deleted (a replayed token must not spam the audit log).
  if ((await getUserById(db, userId)) === undefined) {
    return json({ status: "deleted" }, 200, clearCookie(SESSION_COOKIE));
  }

  // Audit append comes FIRST and is conditional on the users row still existing inside
  // this same transaction — a concurrent delete that wins the race leaves nothing for
  // this batch to append, so replays can never duplicate account.deleted.
  await db.batch([
    appendIfUserExistsStatement(db, { actor: userId, eventType: "account.deleted", payload: {} }, userId),
    db.prepare("UPDATE quota_ledger SET user_id = NULL WHERE user_id = ?").bind(userId),  // detach; keep rows for the global cap
    db.prepare("DELETE FROM users WHERE user_id = ?").bind(userId),                       // remove the profile (email = PII)
  ]);
  return json({ status: "deleted" }, 200, clearCookie(SESSION_COOKIE));
}
