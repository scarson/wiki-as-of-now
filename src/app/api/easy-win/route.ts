// ABOUTME: POST /api/easy-win — re-validate the recorded easy-win pages and return the surfaced lane.
// ABOUTME: Thin glue: resolves the D1 binding, delegates to getEasyWinLane (which isolates per-page failures), maps a top-level failure to 500.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { getEasyWinLane } from "@/ingest/easy-win-lane";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// POST (not GET): the lane fetches and writes verdict/audit rows, so it is side-effecting and must not be
// cacheable/prefetchable. Per-page Wikimedia failures are caught inside getEasyWinLane and reported in
// `summary.skipped`, never rethrown — so there is no 503 branch here; only an unexpected failure reaches 500.
export async function POST(): Promise<Response> {
  const { env } = getCloudflareContext();
  const db = d1Executor(env.DB);

  try {
    const result = await getEasyWinLane(db, { now: new Date() });
    return json(result, 200);
  } catch {
    // Don't leak internal/upstream detail verbatim to the client.
    return json({ error: "Easy-win lane failed" }, 500);
  }
}
