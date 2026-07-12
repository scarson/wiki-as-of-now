// ABOUTME: Arctic Google OAuth client factory (gated on creds) + opaque user-id derivation (no raw subject leaks).
// ABOUTME: Returns null when creds absent so routes can disable cleanly; deriveUserId hashes (provider, subject).
import { Google } from "arctic";

interface OAuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_ORIGIN?: string;
}

export function makeGoogleClient(env: OAuthEnv): Google | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.APP_ORIGIN) return null;
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${env.APP_ORIGIN}/api/auth/google/callback`);
}

/** Opaque, deterministic app user id from the OAuth identity. SHA-256 hex (truncated) — the raw
 *  provider subject never becomes the user_id (which is the audit-log actor; CC-12). */
export async function deriveUserId(provider: string, subject: string): Promise<string> {
  const data = new TextEncoder().encode(`${provider} ${subject}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `u_${hex.slice(0, 32)}`;
}
