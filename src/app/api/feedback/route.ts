// ABOUTME: POST /api/feedback — records a codes-only session-completion feedback row over the audit log (G13, CC-12).
// ABOUTME: Thin glue: resolves the current user for the actor id, validates the outcome via src/db/feedback, no PII.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { recordFeedback, type FeedbackOutcome } from "@/db/feedback";
import { resolveCurrentUser } from "@/auth/current-user";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

const HEX64 = /^[0-9a-f]{64}$/;

export async function POST(request: Request): Promise<Response> {
  let body: { outcome?: string; claimKey?: string };
  try {
    body = (await request.json()) as { outcome?: string; claimKey?: string };
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  if (body.claimKey !== undefined && (typeof body.claimKey !== "string" || !HEX64.test(body.claimKey))) {
    return json({ error: "claimKey must be 64-char lowercase hex" }, 400);
  }

  const { env } = getCloudflareContext();
  // The actor is an identifier (an opaque userId or 'AnonUser'), never PII. recordFeedback
  // rejects any outcome outside the codes-only enum, so free text cannot enter the audit log.
  // The session/admin secrets aren't in the generated CloudflareEnv types (CC-9); read them
  // through the runtime-only view of the same object, mirroring the research route.
  const auth = await resolveCurrentUser(request, env as unknown as Parameters<typeof resolveCurrentUser>[1]);
  const actor = auth.kind === "authenticated" ? auth.userId : "AnonUser";
  try {
    await recordFeedback(d1Executor(env.DB), {
      actor,
      outcome: String(body.outcome ?? "") as FeedbackOutcome,
      claimKey: body.claimKey,
    });
  } catch {
    return json({ error: "outcome must be one of edit_made, no_edit, abandoned" }, 400);
  }
  return json({ ok: true }, 200);
}
