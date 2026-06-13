// ABOUTME: Auth-mode resolution — oauth when Google creds exist, single-admin fallback behind ADMIN_SECRET otherwise.
// ABOUTME: Constant-time admin-secret compare (hash both, compare fixed-length digests); fail-closed when ADMIN_SECRET is unset. Secrets arrive via env, never flags.
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

/**
 * Constant-time comparison that does NOT leak input length via timing. Both inputs are first hashed to a
 * fixed-length (32-byte) SHA-256 digest, then the digests are compared byte-by-byte with no early return —
 * so the work is identical whether the inputs differ in their first byte, their last byte, or their length.
 * (A naive length check or a short-circuiting loop would leak the secret length / a matched prefix.)
 */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db); // both are exactly 32 bytes — fixed length regardless of input length
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function verifyAdminSecret(env: AuthEnv, presented: string): Promise<boolean> {
  if (!env.ADMIN_SECRET) return false; // fail closed: no secret configured → no admin access
  return constantTimeEqual(env.ADMIN_SECRET, presented);
}
