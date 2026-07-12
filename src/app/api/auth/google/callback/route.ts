// ABOUTME: GET /api/auth/google/callback — verifies OAuth state (CSRF), exchanges the code, upserts the user, sets the session.
// ABOUTME: userId is an opaque hash of (provider, sub) — never the raw sub or email (CC-12). 404s when OAuth is disabled.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { makeGoogleClient, deriveUserId } from "@/auth/oauth";
import { issueSession } from "@/auth/session";
import { upsertUser } from "@/db/users";
import { readCookie, serializeCookie, clearCookie } from "@/auth/cookies";
import { SESSION_COOKIE } from "@/auth/current-user";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from "../route";

export const dynamic = "force-dynamic";

interface CallbackEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_ORIGIN?: string;
  SESSION_SECRET?: string;
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7-day session
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function GET(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  const secrets = env as unknown as CallbackEnv;
  const client = makeGoogleClient(secrets);
  if (client === null) return fail(404, "OAuth is not configured");
  if (!secrets.SESSION_SECRET) return fail(500, "Session signing key is not configured");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookieHeader = request.headers.get("cookie");
  const expectedState = readCookie(cookieHeader, OAUTH_STATE_COOKIE);
  const codeVerifier = readCookie(cookieHeader, OAUTH_VERIFIER_COOKIE);

  // CSRF defense: the returned state MUST match the one we stored in the short-lived cookie.
  if (!code || !returnedState || !expectedState || returnedState !== expectedState || !codeVerifier) {
    return fail(400, "Invalid OAuth callback");
  }

  let email: string;
  let subject: string;
  try {
    const tokens = await client.validateAuthorizationCode(code, codeVerifier);
    const res = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${tokens.accessToken()}` } });
    if (!res.ok) return fail(502, "Failed to fetch user info");
    const profile = (await res.json()) as { sub?: unknown; email?: unknown };
    if (typeof profile.sub !== "string" || typeof profile.email !== "string") {
      return fail(502, "Incomplete user info");
    }
    subject = profile.sub;
    email = profile.email;
  } catch {
    return fail(400, "OAuth exchange failed");
  }

  const userId = await deriveUserId("google", subject);
  const db = d1Executor(env.DB);
  await upsertUser(db, {
    userId,
    identityProvider: "google",
    identitySubject: subject, // kept only for re-login lookup; never logged, never in the JWT
    email, // for display only; never in the audit log or the session token (CC-12)
    createdAt: new Date().toISOString(),
  });

  const token = await issueSession({ userId }, secrets.SESSION_SECRET, { ttlSeconds: SESSION_TTL_SECONDS });
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_SECONDS }));
  // Clear the short-lived flow cookies (path-scoped to /api/auth where they were set).
  headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE, "/api/auth"));
  headers.append("Set-Cookie", clearCookie(OAUTH_VERIFIER_COOKIE, "/api/auth"));
  return new Response(null, { status: 302, headers });
}
