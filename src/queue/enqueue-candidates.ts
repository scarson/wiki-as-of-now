// ABOUTME: Gated batch enqueue — routes a set of persisted candidate ids through the SAME composed gate as the single route.
// ABOUTME: kill-switch → auth (once) → per candidate: lookup → G11 eligibility → quota → enqueue; reuses gateResearchEnqueue (no G11 duplication).
import type { SqlExecutor } from "../db/client";
import { getCandidateById } from "../db/candidate-lookup"; // Phase 2 Task 2.2 — single home for this reader
import type { ResearchMessage } from "./research-jobs";
import { gateResearchEnqueue, type AuthContext } from "../app/api/research/gate";
import { isResearchKillSwitchOn } from "../research/kill-switch";
import type { QuotaConfig } from "../quota/config";

/** Per-candidate disposition. Codes/ids only (CC-12) — `reasons` are safe-lane reason codes, never claim text. */
export interface CandidateEnqueueResult {
  candidateId: number;
  outcome: "enqueued" | "skipped_ineligible" | "skipped_quota" | "not_found";
  /** Present on "skipped_ineligible": the G11 safe-lane reason codes (codes only). */
  reasons?: string[];
}

/** Batch-level outcome. A disabled (kill-switch) or anonymous request rejects the WHOLE batch cheaply
 *  (mirrors the single-candidate route's 503 / 401); otherwise every candidate gets a per-candidate result. */
export type BatchEnqueueResult =
  | { outcome: "disabled" }
  | { outcome: "unauthenticated" }
  | { outcome: "processed"; results: CandidateEnqueueResult[] };

/**
 * Gated batch enqueue. The batch is a second door onto the metered research path, so it MUST be gated
 * identically to the single-candidate route — anonymous callers, a paused system, ineligible (non-easy_win,
 * fail-closed-to-human_only) candidates, and over-budget candidates must never enqueue research.
 *
 * It composes with (does NOT duplicate) the shared building blocks: each candidate is delegated to
 * gateResearchEnqueue, which carries the same kill-switch → auth → G11 eligibility → quota → enqueue chain
 * and the same persisted-verdict read (evaluatePersistedEligibility). Kill-switch + auth are checked once up
 * front so a disabled or anonymous request rejects the whole batch before any per-candidate DB work.
 */
export async function gateEnqueueCandidatesForResearch(deps: {
  env: { RESEARCH_KILL_SWITCH?: string };
  db: SqlExecutor;
  authContext: AuthContext;
  candidateIds: number[];
  now: string;
  queue: { send(message: ResearchMessage): Promise<void> };
  quotaConfig: QuotaConfig;
}): Promise<BatchEnqueueResult> {
  // Batch-level rejections (mirror the single route): paused system and anonymous caller reject everything.
  // gateResearchEnqueue also re-checks both per candidate (defense in depth), but rejecting up front keeps
  // an anonymous or kill-switched batch from touching the candidate table at all.
  if (isResearchKillSwitchOn(deps.env)) return { outcome: "disabled" };
  if (deps.authContext.kind !== "authenticated") return { outcome: "unauthenticated" };

  const results: CandidateEnqueueResult[] = [];
  for (const candidateId of deps.candidateIds) {
    // sequential, never Promise.all — G14 host politeness + advisory quota fast-fail are order-sensitive.
    const candidate = await getCandidateById(deps.db, candidateId);
    if (candidate === null) {
      results.push({ candidateId, outcome: "not_found" });
      continue;
    }

    const gated = await gateResearchEnqueue({
      env: deps.env,
      db: deps.db,
      authContext: deps.authContext,
      candidate: {
        pageId: candidate.pageId,
        sourceRevisionId: candidate.sourceRevisionId,
        sentenceText: candidate.sentenceText,
        sectionHeading: candidate.sectionHeading,
        year: candidate.year,
      },
      now: deps.now,
      queue: deps.queue,
      quotaConfig: deps.quotaConfig,
    });

    switch (gated.outcome) {
      case "enqueued":
        results.push({ candidateId, outcome: "enqueued" });
        break;
      case "ineligible":
        results.push({ candidateId, outcome: "skipped_ineligible", reasons: gated.reasons });
        break;
      case "quota_exceeded":
        results.push({ candidateId, outcome: "skipped_quota" });
        break;
      // "disabled"/"unauthenticated" cannot occur here: both were rejected at the batch level above.
      case "disabled":
      case "unauthenticated":
        throw new Error(`unexpected per-candidate gate outcome after batch-level checks: ${gated.outcome}`);
    }
  }
  return { outcome: "processed", results };
}
