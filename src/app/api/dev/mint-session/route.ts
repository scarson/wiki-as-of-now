// ABOUTME: POST /api/dev/mint-session — dev-environment-only session mint so agents can QA authed flows.
// ABOUTME: Double fail-closed gate (DEV_SESSION_MINT flag + constant-time ADMIN_SECRET); uniform 404 on refusal.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { deriveUserId } from "@/auth/oauth";
import { verifyAdminSecret } from "@/auth/mode";
import { issueSession } from "@/auth/session";
import { serializeCookie } from "@/auth/cookies";
import { SESSION_COOKIE, ADMIN_SECRET_HEADER } from "@/auth/current-user";
import { upsertUser } from "@/db/users";

export const dynamic = "force-dynamic";

/** Provider tag for minted test users — never "google", so test rows are unmistakable in the DB. */
export const MINT_PROVIDER = "dev-test";
const DEFAULT_SUBJECT = "dev-test-user";
const SUBJECT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Short-lived by design (real logins get 7 days): a QA credential should not outlive its session. */
const MINT_TTL_SECONDS = 3600;

/** Runtime-only vars NOT surfaced by cf-typegen (CC-9) — read off env at request time. */
interface MintRouteVars {
  DEV_SESSION_MINT?: string;
  ADMIN_SECRET?: string;
  SESSION_SECRET?: string;
}

function json(body: unknown, status: number, setCookie?: string): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

/** Uniform refusal: gate failures are indistinguishable from the route not existing (prod state). */
function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

/**
 * Non-POST methods 404 explicitly. Without these, Next.js answers OPTIONS with 204
 * (+ Allow header) and undefined methods with 405 — enough for a client to discover
 * the route on production despite the flag being absent. Uniform 404 keeps the
 * refusal indistinguishable from the route not existing.
 */
export async function GET(): Promise<Response> {
  return notFound();
}
export const HEAD = GET;
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;
export const OPTIONS = GET;

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  const vars = env as unknown as MintRouteVars;

  if (vars.DEV_SESSION_MINT !== "enabled") return notFound();
  const presented = request.headers.get(ADMIN_SECRET_HEADER);
  if (presented === null || !(await verifyAdminSecret(vars, presented))) return notFound();
  if (!vars.SESSION_SECRET) return json({ error: "Session signing key is not configured" }, 500);

  const raw = await request.text();
  let subject = DEFAULT_SUBJECT;
  if (raw.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }
    const requested = (parsed as { subject?: unknown })?.subject;
    if (requested !== undefined) {
      if (typeof requested !== "string" || !SUBJECT_PATTERN.test(requested)) {
        return json({ error: "subject must match ^[a-z0-9][a-z0-9-]{0,63}$" }, 400);
      }
      subject = requested;
    }
  }

  const userId = await deriveUserId(MINT_PROVIDER, subject);
  await upsertUser(d1Executor(env.DB), {
    userId,
    identityProvider: MINT_PROVIDER,
    identitySubject: subject,
    email: `${subject}@dev-test.invalid`,
    createdAt: new Date().toISOString(),
  });

  const token = await issueSession({ userId }, vars.SESSION_SECRET, { ttlSeconds: MINT_TTL_SECONDS });
  return json(
    { userId, subject, expiresInSeconds: MINT_TTL_SECONDS },
    200,
    serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: MINT_TTL_SECONDS })
  );
}
