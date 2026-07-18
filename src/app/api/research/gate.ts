// ABOUTME: Pure gating for the research enqueue route — kill-switch → auth → eligibility (G11) → quota → enqueue, in order.
// ABOUTME: Composes with (does NOT replace) the Phase 2 G11 safe-lane gate; returns a tagged outcome the route maps to HTTP status.
import type { SqlExecutor } from "../../../db/client";
import type { ResearchMessage } from "../../../queue/research-jobs";
import { enqueueResearch } from "../../../queue/research-jobs";
import { isResearchKillSwitchOn } from "../../../research/kill-switch";
import { evaluatePersistedEligibility } from "../../../safelane/persisted-eligibility";
import { assertQuotaAvailable, QuotaExceededError } from "../../../quota/reconcile";
import type { QuotaConfig } from "../../../quota/config";

export type AuthContext =
  | { kind: "authenticated"; userId: string }
  | { kind: "anonymous" };

export interface EnqueueCandidate {
  pageId: number;
  sourceRevisionId: number;
  sentenceText: string;
  sectionHeading: string;
  year: number;
  articleTitle: string;
  surroundingText: string | null;
}

export interface EnqueueGateResult {
  outcome: "disabled" | "unauthenticated" | "ineligible" | "quota_exceeded" | "enqueued";
  /** Present on "ineligible": the safe-lane reason codes (codes only, never PII — CC-12). */
  reasons?: string[];
}

/**
 * The single composed enqueue gate. Order is load-bearing:
 *   (1) kill-switch  — a disabled system rejects cheaply before any auth/DB work.
 *   (2) auth         — anonymous is browse-only; research requires an authenticated user.
 *   (3) eligibility  — G11 safe-lane guardrail: easy_win only, fail closed to human_only on a
 *                      missing/corrupt verdict. Runs before quota so an ineligible claim never
 *                      consumes a quota check or a slot. COMPOSES WITH (does not replace) the
 *                      Phase 2 safe-lane gate — same persisted-verdict read.
 *   (4) quota        — advisory pre-check (count-then-enqueue races, so it cannot be a hard bound); the
 *                      sequential consumer's count-at-commit is the authoritative cap (the only race-free point).
 *   (5) enqueue.
 */
export async function gateResearchEnqueue(deps: {
  env: { RESEARCH_KILL_SWITCH?: string };
  db: SqlExecutor;
  authContext: AuthContext;
  candidate: EnqueueCandidate;
  now: string;
  queue: { send(message: ResearchMessage): Promise<void> };
  quotaConfig: QuotaConfig;
}): Promise<EnqueueGateResult> {
  if (isResearchKillSwitchOn(deps.env)) return { outcome: "disabled" };
  if (deps.authContext.kind !== "authenticated") return { outcome: "unauthenticated" };

  // Safe-lane guardrail G11 (composes with Phase 2 — NOT a replacement).
  const decision = await evaluatePersistedEligibility(deps.db, deps.candidate.pageId, deps.candidate.sourceRevisionId);
  if (decision.eligibility !== "easy_win") {
    return { outcome: "ineligible", reasons: decision.reasons };
  }

  try {
    await assertQuotaAvailable(deps.db, deps.authContext.userId, deps.now, deps.quotaConfig);
  } catch (e) {
    if (e instanceof QuotaExceededError) return { outcome: "quota_exceeded" };
    throw e;
  }

  await enqueueResearch(deps.queue, {
    pageId: deps.candidate.pageId,
    sourceRevisionId: deps.candidate.sourceRevisionId,
    input: {
      claimText: deps.candidate.sentenceText,
      sectionHeading: deps.candidate.sectionHeading,
      year: deps.candidate.year,
      sourceRevisionId: deps.candidate.sourceRevisionId,
      articleTitle: deps.candidate.articleTitle,
      // Conditional spread: a null (pre-capture row) leaves the optional field ABSENT rather
      // than serializing a JSON null onto the queue message.
      ...(deps.candidate.surroundingText !== null ? { surroundingText: deps.candidate.surroundingText } : {}),
    },
    // Thread the enqueuer's opaque userId onto the message so the consumer's quota_ledger row is
    // keyed to the REAL requester (Fix 2) — otherwise the per-user cap reads u_admin and never trips.
    userId: deps.authContext.userId,
  });
  return { outcome: "enqueued" };
}
