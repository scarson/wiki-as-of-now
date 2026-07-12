// ABOUTME: GET /api/seed-lists/[topic] — pageview-ranked seed list, served from storage, refreshed if stale.
// ABOUTME: Thin glue: awaits the Promise params (Next 15/16), wires live MediaWiki clients, delegates.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { getOrRefreshSeedList } from "@/ingest/seed-topics";
import { fetchCategoryMembers } from "@/ingest/category-members";
import { fetchPageviewCount } from "@/ingest/pageviews";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topic: string }> }
): Promise<Response> {
  const { topic } = await params;
  const { env } = getCloudflareContext();
  const db = d1Executor(env.DB);
  try {
    const read = await getOrRefreshSeedList(db, topic, {
      now: new Date(),
      fetchCategoryMembers: (cat) => fetchCategoryMembers(cat),
      fetchPageviewCount: (title, w) => fetchPageviewCount(title, w),
    });
    if (read.state === "not_found") return json({ error: "Unknown topic" }, 404);
    return json(read, 200);
  } catch {
    return json({ error: "Seed list unavailable" }, 503);
  }
}
