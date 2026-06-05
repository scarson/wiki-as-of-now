// ABOUTME: POST /api/articles/lookup — title in, fetch+detect+persist, candidate summary out.
// ABOUTME: Thin glue: resolves the D1 binding, delegates to lookupAndPersist, maps typed errors to status codes.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { lookupAndPersist } from "@/ingest/lookup";
import { ArticleNotFoundError, WikimediaUnavailableError } from "@/ingest/wikimedia";

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

  const title = (parsed as { title?: unknown })?.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    return json({ error: "A non-empty 'title' is required" }, 400);
  }

  const { env } = getCloudflareContext();
  const db = d1Executor(env.DB);

  try {
    const result = await lookupAndPersist(db, title.trim());
    return json(result, 200);
  } catch (err) {
    if (err instanceof ArticleNotFoundError) {
      return json({ error: err.message }, 404);
    }
    if (err instanceof WikimediaUnavailableError) {
      return json({ error: "Wikimedia is temporarily unavailable; please try again shortly" }, 503);
    }
    // Don't leak internal/upstream detail verbatim to the client.
    return json({ error: "Lookup failed" }, 500);
  }
}
