// ABOUTME: POST /api/auth/logout — clears the session cookie. POST (not GET) so it is not prefetchable/CSRF-trivial.
// ABOUTME: Stateless logout: the session is a signed JWT, so clearing the cookie ends the session client-side.
import { clearCookie } from "@/auth/cookies";
import { SESSION_COOKIE } from "@/auth/current-user";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  headers.append("Set-Cookie", clearCookie(SESSION_COOKIE));
  return new Response(JSON.stringify({ status: "logged_out" }), { status: 200, headers });
}
