// ABOUTME: POST /api/queue/enqueue-research — batch-enqueue research jobs for a set of candidate ids.
// ABOUTME: Thin glue: resolves DB + queue bindings, delegates to enqueueCandidatesForResearch, returns a summary.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { enqueueCandidatesForResearch } from "@/queue/enqueue-candidates";
import type { ResearchMessage } from "@/queue/research-jobs";

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
  const ids = (parsed as { candidateIds?: unknown })?.candidateIds;
  if (!Array.isArray(ids) || !ids.every((i) => Number.isInteger(i) && (i as number) > 0)) {
    return json({ error: "'candidateIds' must be an array of positive integers" }, 400);
  }
  const { env } = getCloudflareContext();
  if (!env.RESEARCH_QUEUE) return json({ error: "Research queue is not configured" }, 503);
  const db = d1Executor(env.DB);
  // Void adapter: Queue.send() returns Promise<QueueSendResponse>, not Promise<void>,
  // so it doesn't structurally satisfy the producer param (integration-contract §2.2 / D5).
  const queue = {
    send: async (m: ResearchMessage) => {
      await env.RESEARCH_QUEUE.send(m);
    },
  };
  try {
    const result = await enqueueCandidatesForResearch(db, queue, ids as number[]);
    return json(result, 200);
  } catch {
    return json({ error: "Enqueue failed" }, 500);
  }
}
