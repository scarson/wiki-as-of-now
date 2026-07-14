// ABOUTME: Resolves the request's AuthContext — session cookie (jose) → authenticated; single-admin header fallback; else anonymous.
// ABOUTME: Anonymous is browse-only; the research enqueue gate (gate.ts) is what refuses anonymous with 401. No PII surfaces (CC-12).
import { verifySession } from "./session";
import { resolveAuthMode, verifyAdminSecret, SINGLE_ADMIN_USER_ID } from "./mode";
import { readCookie } from "./cookies";
import type { AuthContext } from "../app/api/research/gate";

export const SESSION_COOKIE = "wikinow_session";
/** Header carrying the admin secret in single-admin mode (no secret in a query param or flag). */
export const ADMIN_SECRET_HEADER = "x-admin-secret";

interface CurrentUserEnv {
  SESSION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_SECRET?: string;
}

/**
 * Resolves who is making the request:
 *  - A valid signed session cookie → authenticated with its opaque userId.
 *  - In single-admin mode (no Google creds), a valid ADMIN_SECRET header → authenticated as the
 *    fixed single-admin user. The header path is disabled in oauth mode (sessions only).
 *  - Otherwise → anonymous (browse-only).
 * Never throws: a malformed/expired/forged session is treated as not-authenticated, falling through.
 */
export async function resolveCurrentUser(req: Request, env: CurrentUserEnv): Promise<AuthContext> {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (token && env.SESSION_SECRET) {
    try {
      const claims = await verifySession(token, env.SESSION_SECRET);
      return { kind: "authenticated", userId: claims.userId };
    } catch {
      // Forged/expired/malformed session → fall through to the other paths (do not 500).
    }
  }

  if (resolveAuthMode(env) === "single-admin") {
    const presented = req.headers.get(ADMIN_SECRET_HEADER);
    if (presented !== null && (await verifyAdminSecret(env, presented))) {
      return { kind: "authenticated", userId: SINGLE_ADMIN_USER_ID };
    }
  }

  return { kind: "anonymous" };
}
