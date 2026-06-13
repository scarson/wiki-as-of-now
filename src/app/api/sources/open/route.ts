// ABOUTME: POST /api/sources/open — the G5 gate. Audit-logs the source open (codes-only), unlocks disclosure.
// ABOUTME: The unlock is reported ONLY after the append-only audit row commits (G5/G13); load-bearing logic lives in source-gate.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { confirmSourceOpened, type ConfirmInput } from "@/worksheet/source-gate";

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
      typeof body.actor !== "string" || typeof body.sourceRevisionId !== "number") {
    return json({ error: "claimKey, url, actor, sourceRevisionId are required" }, 400);
  }
  if (!HEX64.test(body.claimKey)) return json({ error: "claimKey must be 64-char lowercase hex" }, 400);

  const { env } = getCloudflareContext();
  try {
    const res = await confirmSourceOpened(d1Executor(env.DB), body as ConfirmInput);
    return json(res, 200);
  } catch {
    return json({ error: "Could not record source open" }, 500);
  }
}
