// ABOUTME: GET /api/articles/:id/candidates — reads a page's persisted stale candidates from D1.
// ABOUTME: Thin glue: resolves the D1 binding and delegates to getCandidatesByPageId.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { getCandidatesByPageId } from "@/db/articles";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const pageId = Number(id);
  if (!Number.isInteger(pageId) || pageId <= 0) {
    return json({ error: "Article id must be a positive integer" }, 400);
  }

  const { env } = getCloudflareContext();
  const db = d1Executor(env.DB);

  // An unknown page and a known page with no candidates are indistinguishable
  // here and both legitimately read as "no candidates" — no existence oracle.
  const candidates = await getCandidatesByPageId(db, pageId);
  return json({ pageId, candidates }, 200);
}
