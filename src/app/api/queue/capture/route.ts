// ABOUTME: POST /api/queue/capture — drop a Wikipedia title or URL into the queue via lookupAndPersist.
// ABOUTME: Thin glue: normalizes the target, resolves DB, delegates to lookupAndPersist, maps typed errors.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { lookupAndPersist } from "@/ingest/lookup";
import { ArticleNotFoundError, WikimediaUnavailableError } from "@/ingest/wikimedia";
import { parseWikiTarget } from "@/app/queue/parse-wiki-target";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const target = (parsed as { target?: unknown })?.target;
  if (typeof target !== "string") return json({ error: "A 'target' title or URL is required" }, 400);
  const norm = parseWikiTarget(target);
  if (!norm.ok) return json({ error: "Not a valid Wikipedia article title or URL" }, 400);
  const { env } = getCloudflareContext();
  const db = d1Executor(env.DB);
  try {
    return json(await lookupAndPersist(db, norm.title), 200);
  } catch (err) {
    if (err instanceof ArticleNotFoundError) return json({ error: err.message }, 404);
    if (err instanceof WikimediaUnavailableError)
      return json({ error: "Wikimedia is temporarily unavailable" }, 503);
    return json({ error: "Capture failed" }, 500);
  }
}
