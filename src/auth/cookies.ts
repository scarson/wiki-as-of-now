// ABOUTME: Set-Cookie serialization for auth cookies — HttpOnly/Secure/SameSite=Lax, with a clear-cookie helper.
// ABOUTME: Centralized so the session + OAuth flow cookies share one hardened attribute set (no PII in cookie names/flags).
interface CookieOptions {
  maxAgeSeconds: number;
  /** Path the cookie applies to; defaults to "/". */
  path?: string;
}

/** Serializes a hardened cookie: HttpOnly + Secure + SameSite=Lax. Values are URL-encoded. */
export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const path = opts.path ?? "/";
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${opts.maxAgeSeconds}`;
}

/** Serializes an immediately-expiring cookie to clear a previously-set one. */
export function clearCookie(name: string, path = "/"): string {
  return `${name}=; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Reads one cookie value out of a Cookie header (URL-decoded). Returns undefined if absent. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined; // malformed percent-encoding → treat as absent
      }
    }
  }
  return undefined;
}
