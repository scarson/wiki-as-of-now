// ABOUTME: POST /api/research/:candidateId — gated research enqueue: kill-switch → auth → eligibility (G11) → quota → enqueue.
// ABOUTME: Producer only (integration-contract §2.7); enqueueResearch computes the claimKey — the route never constructs it.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { getCandidateById } from "@/db/candidate-lookup";
import { enqueueResearch, type ResearchMessage } from "@/queue/research-jobs";
import { evaluatePersistedEligibility } from "@/safelane/persisted-eligibility";
import { gateResearchEnqueue } from "@/app/api/research/gate";
import { resolveCurrentUser } from "@/auth/current-user";
import { crossOriginRefusal } from "@/auth/origin-guard";
import { loadQuotaConfig } from "@/quota/config";
import type { SqlExecutor } from "@/db/client";
import type { EligibilityDecision } from "@/domain/types";

export const dynamic = "force-dynamic";

/** Runtime-only secrets/vars NOT surfaced by cf-typegen (CC-9 / integration-contract §5.3) — read off env at request time. */
interface ResearchRouteSecrets {
  RESEARCH_KILL_SWITCH?: string;
  SESSION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_SECRET?: string;
  QUOTA_PER_USER_DAILY?: string;
  QUOTA_GLOBAL_DAILY?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

/** Inner eligibility+enqueue primitive: lookup → eligibility gate (G11) → enqueue. Returned Response is the HTTP result.
 *  Retained as a standalone primitive (the workers-pool research-enqueue test exercises it directly); the gated POST
 *  handler below uses the composed gateResearchEnqueue instead, which carries the same G11 read via evaluatePersistedEligibility. */
export async function handleResearchEnqueue(
  db: SqlExecutor,
  queue: { send(m: ResearchMessage): Promise<void> },
  candidateId: number,
  evaluateGate: (pageId: number, sourceRevisionId: number) => Promise<EligibilityDecision>,
): Promise<Response> {
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return json({ error: "Candidate id must be a positive integer" }, 400);
  }
  const candidate = await getCandidateById(db, candidateId);
  if (candidate === null) return json({ error: "Candidate not found" }, 404);

  const decision = await evaluateGate(candidate.pageId, candidate.sourceRevisionId);
  if (decision.eligibility !== "easy_win") {
    // Safe-lane guardrail (G11): only easy-win claims enter the metered research path.
    return json({ error: "Candidate is not eligible for automated research", reasons: decision.reasons }, 403);
  }

  await enqueueResearch(queue, {
    pageId: candidate.pageId,
    sourceRevisionId: candidate.sourceRevisionId,
    input: {
      claimText: candidate.sentenceText,
      sectionHeading: candidate.sectionHeading,
      year: candidate.year,
      sourceRevisionId: candidate.sourceRevisionId,
    },
  });
  return json({ status: "queued", candidateId }, 202);
}

export async function POST(request: Request, { params }: { params: Promise<{ candidateId: string }> }): Promise<Response> {
  const refusal = crossOriginRefusal(request); // this route spends metered quota — see origin-guard
  if (refusal) return refusal;
  const { candidateId } = await params;
  const id = Number(candidateId);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "Candidate id must be a positive integer" }, 400);
  }

  const { env } = getCloudflareContext();          // inside the handler body (CC-11)
  const db = d1Executor(env.DB);
  // Secrets/vars (RESEARCH_KILL_SWITCH, SESSION_SECRET, ADMIN_SECRET, QUOTA_*, GOOGLE_*) are not in the
  // generated CloudflareEnv types (CC-9) — read them through the runtime-only view of the same object.
  const secrets = env as unknown as ResearchRouteSecrets;

  // Resolve the candidate first so an unknown id 404s before any gating work (mirrors Phase 2).
  const candidate = await getCandidateById(db, id);
  if (candidate === null) return json({ error: "Candidate not found" }, 404);

  // Adapt Queue.send (returns QueueSendResponse under the installed runtime types) to the void-return
  // contract enqueueResearch expects — mirrors the sendBatch adapter in workers/research/index.ts.
  const queue = { send: async (m: ResearchMessage): Promise<void> => { await env.RESEARCH_QUEUE.send(m); } };

  const authContext = await resolveCurrentUser(request, secrets);
  const result = await gateResearchEnqueue({
    env: secrets,
    db,
    authContext,
    candidate: {
      pageId: candidate.pageId,
      sourceRevisionId: candidate.sourceRevisionId,
      sentenceText: candidate.sentenceText,
      sectionHeading: candidate.sectionHeading,
      year: candidate.year,
    },
    now: new Date().toISOString(),
    queue,
    quotaConfig: loadQuotaConfig(secrets),
  });

  switch (result.outcome) {
    case "disabled":
      return json({ error: "Research is currently disabled" }, 503);
    case "unauthenticated":
      return json({ error: "Authentication required to request research" }, 401);
    case "ineligible":
      // G11 / CC-12: reason codes only — never the candidate sentence or any PII.
      return json({ error: "Candidate is not eligible for automated research", reasons: result.reasons }, 403);
    case "quota_exceeded":
      return json({ error: "Daily research quota exceeded" }, 429);
    case "enqueued":
      return json({ status: "queued", candidateId: id }, 202);
  }
}

// evaluatePersistedEligibility is the shared G11 read used by the gate; re-exported so the route's
// fail-closed-to-human_only behavior has a single, testable home.
export { evaluatePersistedEligibility };
