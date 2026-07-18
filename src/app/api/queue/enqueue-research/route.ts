// ABOUTME: POST /api/queue/enqueue-research — gated batch-enqueue of research jobs for a set of candidate ids.
// ABOUTME: kill-switch → auth → per candidate G11 eligibility → quota → enqueue (same gate as the single route); no second door.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { gateEnqueueCandidatesForResearch } from "@/queue/enqueue-candidates";
import { resolveCurrentUser } from "@/auth/current-user";
import { crossOriginRefusal } from "@/auth/origin-guard";
import { loadQuotaConfig } from "@/quota/config";
import type { ResearchMessage } from "@/queue/research-jobs";

export const dynamic = "force-dynamic";

/** Runtime-only secrets/vars NOT surfaced by cf-typegen (CC-9) — read off env at request time. */
interface BatchRouteSecrets {
  RESEARCH_KILL_SWITCH?: string;
  SESSION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_SECRET?: string;
  QUOTA_PER_USER_DAILY?: string;
  QUOTA_GLOBAL_DAILY?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Upper bound on one batch — the gate reads eligibility + quota per id, so an uncapped
 *  array is a sequential-D1-read amplifier. The lane never surfaces anywhere near this many. */
const MAX_BATCH_CANDIDATES = 50;

export async function POST(request: Request): Promise<Response> {
  const refusal = crossOriginRefusal(request); // this route spends metered quota — see origin-guard
  if (refusal) return refusal;
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const rawIds = (parsed as { candidateIds?: unknown })?.candidateIds;
  if (!Array.isArray(rawIds) || !rawIds.every((i) => Number.isInteger(i) && (i as number) > 0)) {
    return json({ error: "'candidateIds' must be an array of positive integers" }, 400);
  }
  if (rawIds.length > MAX_BATCH_CANDIDATES) {
    return json({ error: `'candidateIds' must contain at most ${MAX_BATCH_CANDIDATES} ids` }, 400);
  }
  const ids = [...new Set(rawIds as number[])];
  const { env } = getCloudflareContext();
  if (!env.RESEARCH_QUEUE) return json({ error: "Research queue is not configured" }, 503);
  const db = d1Executor(env.DB);
  // Secrets/vars (RESEARCH_KILL_SWITCH, SESSION_SECRET, ADMIN_SECRET, QUOTA_*, GOOGLE_*) are not in the
  // generated CloudflareEnv types (CC-9) — read them through the runtime-only view of the same object.
  const secrets = env as unknown as BatchRouteSecrets;
  // Void adapter: Queue.send() returns Promise<QueueSendResponse>, not Promise<void>,
  // so it doesn't structurally satisfy the producer param (integration-contract §2.2 / D5).
  const queue = {
    send: async (m: ResearchMessage) => {
      await env.RESEARCH_QUEUE.send(m);
    },
  };

  const authContext = await resolveCurrentUser(request, secrets);
  try {
    const result = await gateEnqueueCandidatesForResearch({
      env: secrets,
      db,
      authContext,
      candidateIds: ids as number[],
      now: new Date().toISOString(),
      queue,
      quotaConfig: loadQuotaConfig(secrets),
    });
    switch (result.outcome) {
      case "disabled":
        return json({ error: "Research is currently disabled" }, 503);
      case "unauthenticated":
        return json({ error: "Authentication required to request research" }, 401);
      case "processed":
        return json({ results: result.results }, 200);
    }
  } catch {
    return json({ error: "Enqueue failed" }, 500);
  }
}
