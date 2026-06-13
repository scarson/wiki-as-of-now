// ABOUTME: GET /api/auth/google — starts the Google OAuth flow (PKCE + state CSRF token) when creds are present.
// ABOUTME: 404s when OAuth is disabled (creds absent) — single-admin mode carries self-test without OAuth (soft gate).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { generateState, generateCodeVerifier } from "arctic";
import { makeGoogleClient } from "@/auth/oauth";
import { serializeCookie } from "@/auth/cookies";

export const dynamic = "force-dynamic";

/** Runtime-only OAuth secrets/vars (not surfaced by cf-typegen, CC-9). */
interface OAuthRouteEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_ORIGIN?: string;
}

export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_VERIFIER_COOKIE = "oauth_verifier";
const OAUTH_FLOW_TTL_SECONDS = 600; // 10 minutes to complete the round-trip

export async function GET(): Promise<Response> {
  const { env } = getCloudflareContext();
  const client = makeGoogleClient(env as unknown as OAuthRouteEnv);
  if (client === null) {
    return new Response(JSON.stringify({ error: "OAuth is not configured" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // PKCE + state: the state is echoed back by Google and re-checked against the cookie (CSRF defense);
  // the verifier is the PKCE secret kept only on this client, never sent to Google in the start request.
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = client.createAuthorizationURL(state, codeVerifier, ["openid", "email"]);

  const headers = new Headers({ Location: url.toString() });
  headers.append("Set-Cookie", serializeCookie(OAUTH_STATE_COOKIE, state, { maxAgeSeconds: OAUTH_FLOW_TTL_SECONDS, path: "/api/auth" }));
  headers.append("Set-Cookie", serializeCookie(OAUTH_VERIFIER_COOKIE, codeVerifier, { maxAgeSeconds: OAUTH_FLOW_TTL_SECONDS, path: "/api/auth" }));
  return new Response(null, { status: 302, headers });
}
