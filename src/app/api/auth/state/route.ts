// ABOUTME: GET /api/auth/state — the client-readable auth signal for the UI ({authenticated}), never cached.
// ABOUTME: Reuses resolveCurrentUser; force-dynamic + no-store so a per-user signal is never statically cached.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveCurrentUser } from "@/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  // SESSION_SECRET isn't in the generated CloudflareEnv types (CC-9); read it through the
  // runtime view of the same object, mirroring the research/feedback routes.
  const auth = await resolveCurrentUser(request, env as unknown as Parameters<typeof resolveCurrentUser>[1]);
  return new Response(JSON.stringify({ authenticated: auth.kind === "authenticated" }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
