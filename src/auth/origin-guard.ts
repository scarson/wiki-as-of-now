// ABOUTME: Same-origin guard for cookie-authenticated mutating endpoints — refuses requests whose Origin
// ABOUTME: header mismatches the request's own origin (SameSite=Lax still sends cookies on sibling-subdomain POSTs).

/**
 * Returns a 403 refusal Response when the Origin header is present and differs from the
 * request's own origin; null when the request may proceed. Browsers always send Origin on
 * POST, so a mismatch means another origin authored the request. An absent Origin is a
 * non-browser client (curl, tests) — the endpoint's own auth gate still applies to those.
 */
export function crossOriginRefusal(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return new Response(JSON.stringify({ error: "Cross-origin request refused" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return null;
}
