// ABOUTME: POST /api/research/:candidateId — enqueues a research job for an easy-win candidate (safe-lane guardrail G11 gate).
// ABOUTME: Producer only (integration-contract §2.7); enqueueResearch computes the claimKey — the route never constructs it.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { getCandidateById } from "@/db/candidate-lookup";
import { enqueueResearch, type ResearchMessage } from "@/queue/research-jobs";
import { getVerdict } from "@/db/eligibility-verdicts";
import { GATE_VERSION } from "@/safelane/eligibility";
import type { SqlExecutor } from "@/db/client";
import type { EligibilityDecision } from "@/domain/types";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

/** Pure-ish enqueue logic: lookup → eligibility gate (G11) → enqueue. Returned Response is the HTTP result. */
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

export async function POST(_request: Request, { params }: { params: Promise<{ candidateId: string }> }): Promise<Response> {
  const { candidateId } = await params;
  const { env } = getCloudflareContext();          // inside the handler body (CC-11)
  const db = d1Executor(env.DB);
  // Adapt Queue.send (returns QueueSendResponse under the installed runtime types) to the void-return
  // contract enqueueResearch/handleResearchEnqueue expect — mirrors the sendBatch adapter in
  // workers/research/index.ts (the same v4-API deviation from integration-contract §2.2).
  const queue = { send: async (m: ResearchMessage): Promise<void> => { await env.RESEARCH_QUEUE.send(m); } };
  // Read the persisted safe-lane verdict written by the easy-win lane (gate version pinned).
  const gate = async (pageId: number, sourceRevisionId: number): Promise<EligibilityDecision> => {
    const verdict = await getVerdict(db, pageId, sourceRevisionId, GATE_VERSION);
    return verdict ?? { eligibility: "human_only", reasons: ["no_verdict"] }; // fail-closed: no verdict → human_only (G11)
  };
  return handleResearchEnqueue(db, queue, Number(candidateId), gate);
}
