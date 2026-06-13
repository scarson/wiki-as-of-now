// ABOUTME: Auth-mode resolution — oauth when Google creds exist, single-admin fallback behind ADMIN_SECRET otherwise.
// ABOUTME: Length-constant admin-secret compare; fail-closed when ADMIN_SECRET is unset. Secrets arrive via env, never flags.
export const SINGLE_ADMIN_USER_ID = "u_admin";

export type AuthMode = "oauth" | "single-admin";

interface AuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_SECRET?: string;
  SESSION_SECRET?: string;
}

export function resolveAuthMode(env: AuthEnv): AuthMode {
  return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? "oauth" : "single-admin";
}

/** Length-constant comparison so a wrong-length guess can't be distinguished by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyAdminSecret(env: AuthEnv, presented: string): boolean {
  if (!env.ADMIN_SECRET) return false; // fail closed: no secret configured → no admin access
  return timingSafeEqual(env.ADMIN_SECRET, presented);
}
