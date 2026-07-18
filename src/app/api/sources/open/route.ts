// ABOUTME: POST /api/sources/open — the G5 gate. Audit-logs the source open (codes-only), unlocks disclosure.
// ABOUTME: The unlock is reported ONLY after the append-only audit row commits (G5/G13); load-bearing logic lives in source-gate.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { confirmSourceOpened, type ConfirmInput } from "@/worksheet/source-gate";
import { resolveCurrentUser } from "@/auth/current-user";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

const HEX64 = /^[0-9a-f]{64}$/;

export async function POST(request: Request): Promise<Response> {
  let body: Partial<ConfirmInput>;
  try {
    body = (await request.json()) as Partial<ConfirmInput>;
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  if (typeof body.claimKey !== "string" || typeof body.url !== "string" ||
      typeof body.sourceRevisionId !== "number") {
    return json({ error: "claimKey, url, sourceRevisionId are required" }, 400);
  }
  // Revision ids are positive integers; anything else (fractional, zero, negative, NaN)
  // would be written verbatim into the append-only audit payload — refuse it instead.
  if (!Number.isInteger(body.sourceRevisionId) || body.sourceRevisionId <= 0) {
    return json({ error: "sourceRevisionId must be a positive integer" }, 400);
  }
  if (!HEX64.test(body.claimKey)) return json({ error: "claimKey must be 64-char lowercase hex" }, 400);

  const { env } = getCloudflareContext();
  // The actor is resolved SERVER-SIDE — never taken from the request body — so a client cannot plant an
  // arbitrary string (PII or otherwise) into the append-only audit log (CC-12/G13). The session/admin
  // secrets aren't in the generated CloudflareEnv types (CC-9); read them through the runtime-only view
  // of the same object, mirroring the feedback route.
  const auth = await resolveCurrentUser(request, env as unknown as Parameters<typeof resolveCurrentUser>[1]);
  const actor = auth.kind === "authenticated" ? auth.userId : "AnonUser";
  try {
    const res = await confirmSourceOpened(d1Executor(env.DB), body as ConfirmInput, actor);
    return json(res, 200);
  } catch {
    return json({ error: "Could not record source open" }, 500);
  }
}
