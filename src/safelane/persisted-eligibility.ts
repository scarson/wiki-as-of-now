// ABOUTME: Single home for the G11 safe-lane read — the persisted-verdict lookup, fail-closed to human_only.
// ABOUTME: A missing or corrupt verdict (getVerdict → null) reads as human_only with reason "no_verdict" (compliance G11).
import type { SqlExecutor } from "../db/client";
import type { EligibilityDecision } from "../domain/types";
import { getVerdict } from "../db/eligibility-verdicts";
import { GATE_VERSION } from "./eligibility";

/**
 * Reads the persisted safe-lane verdict for (pageId, sourceRevisionId) at the pinned gate version.
 * Fails CLOSED: when no verdict exists (or the stored row is unreadable, so getVerdict returns null),
 * the decision is human_only with reason "no_verdict" — the metered research path is refused. This is
 * the Phase 2 G11 guardrail, shared by the enqueue route and the Phase 5 composed gate so it lives once.
 */
export async function evaluatePersistedEligibility(
  db: SqlExecutor,
  pageId: number,
  sourceRevisionId: number,
): Promise<EligibilityDecision> {
  const verdict = await getVerdict(db, pageId, sourceRevisionId, GATE_VERSION);
  return verdict ?? { eligibility: "human_only", reasons: ["no_verdict"] };
}
