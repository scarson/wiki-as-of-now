// ABOUTME: Pure, total, clock-free safe-lane gate — maps article metadata to easy_win/human_only + reason codes.
// ABOUTME: Fail-closed floor (BLP probe, namespace, freshness, indeterminate) + one-way advisory wikitext signals.
import type { ArticleMetadata, EligibilityDecision } from "../domain/types";
import { scanWikitextSignals } from "./wikitext-signals";

export const GATE_VERSION = "1.0.0";
export const FRESHNESS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes — category-lag backstop (spec §7)

const FLOOR_ORDER = ["metadata_unavailable", "non_mainspace", "blp_category", "recently_edited"] as const;

/**
 * Deterministic eligibility verdict. `now` is injected (the gate is clock-free); the freshness
 * check parses the injected revision timestamp. `gateVersion` is recorded by callers in the audit
 * log, not used by the verdict itself.
 */
export function evaluateEligibility(
  meta: ArticleMetadata,
  now: Date,
  _gateVersion: string
): EligibilityDecision {
  const floor = new Set<string>();
  if (meta.blpProbe === "unknown") floor.add("metadata_unavailable");
  if (meta.namespace !== 0) floor.add("non_mainspace");
  if (meta.blpProbe === "present") floor.add("blp_category");
  if (now.getTime() - new Date(meta.revisionTimestamp).getTime() < FRESHNESS_WINDOW_MS) {
    floor.add("recently_edited");
  }

  const advisory = scanWikitextSignals(meta.wikitext); // sorted, deduped advisory codes
  // Canonical order: floor codes in FLOOR_ORDER, then blp_wikitext, then sorted dispute_template:*
  const ordered: string[] = FLOOR_ORDER.filter(c => floor.has(c));
  if (advisory.includes("blp_wikitext")) ordered.push("blp_wikitext");
  ordered.push(...advisory.filter(c => c.startsWith("dispute_template:")).sort());

  return { eligibility: ordered.length === 0 ? "easy_win" : "human_only", reasons: ordered };
}
