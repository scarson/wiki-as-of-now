// ABOUTME: Single-article lookup orchestrator — fetch → parse → detect → persist → audit.
// ABOUTME: Deterministic (no LLM, G10); supplies asOfYear from the app clock, keeping the detector clockless.
import type { SqlExecutor } from "../db/client";
import type { EligibilityDecision } from "../domain/types";
import { upsertArticle, insertCandidates, getCandidatesByPageId, type PersistedCandidate } from "../db/articles";
import { makeAuditLog } from "../db/audit-log";
import { parseArticle } from "../detector/parse";
import { detectStaleClaims, DETECTOR_VERSION } from "../detector/detect";
import { fetchArticle, toArticleMetadata, type FetchLike } from "./wikimedia";
import { evaluateEligibility, GATE_VERSION } from "../safelane/eligibility";

export interface LookupOptions {
  fetchFn?: FetchLike;
  userAgent?: string;
  /** Reference year the detector compares against. Defaults to the current UTC year. */
  asOfYear?: number;
  /** Reference instant the safe-lane freshness check compares against. Defaults to the app clock. */
  now?: Date;
}

/** Summary returned to the API/UI after a lookup. `candidates` is the persisted (read-back) set. */
export interface LookupResult {
  pageId: number;
  title: string;
  revisionId: number;
  candidateCount: number;
  candidates: PersistedCandidate[];
  eligibility: EligibilityDecision["eligibility"];
  reasons: string[];
}

/**
 * Looks up a Wikipedia article by title, runs the deterministic detector over it,
 * persists the article and its stale candidates, records an audit event, and
 * returns the persisted candidates.
 *
 * The detector is consumed unchanged and stays clockless: "as of now" is an
 * application concern, so `asOfYear` is supplied here (default: the current UTC
 * year) and injectable for deterministic tests. The fetched wikitext is untrusted
 * data — it flows only into the parser/detector, never to a model or as
 * instructions. The audit payload is identifiers only (no title/content).
 */
export async function lookupAndPersist(
  db: SqlExecutor,
  title: string,
  options: LookupOptions = {}
): Promise<LookupResult> {
  const asOfYear = options.asOfYear ?? new Date().getUTCFullYear();

  const fetched = await fetchArticle(title, { fetchFn: options.fetchFn, userAgent: options.userAgent });

  const parsed = parseArticle({
    title: fetched.title,
    revisionId: fetched.revisionId,
    wikitext: fetched.wikitext,
  });
  const candidates = detectStaleClaims(parsed, asOfYear);

  // Safe-lane eligibility: deterministic, fail-closed verdict over the same-snapshot metadata.
  // The gate stays clock-free; `now` is supplied here (app clock, injectable in tests). The verdict
  // is computed, returned, and audited — never persisted in v1 (re-evaluated at point-of-use; spec §6).
  const decision = evaluateEligibility(toArticleMetadata(fetched), options.now ?? new Date(), GATE_VERSION);

  await upsertArticle(db, {
    pageId: fetched.pageId,
    title: fetched.title,
    revisionId: fetched.revisionId,
    fetchedAt: new Date().toISOString(),
  });
  await insertCandidates(db, fetched.pageId, fetched.revisionId, candidates);

  await makeAuditLog(db).append({
    actor: "system",
    eventType: "article.lookup",
    payload: {
      pageId: fetched.pageId,
      revisionId: fetched.revisionId,
      candidateCount: candidates.length,
      detectorVersion: DETECTOR_VERSION,
    },
  });

  // Identifiers/codes only — never title, wikitext, or any document content (G13/R4-7).
  await makeAuditLog(db).append({
    actor: "system",
    eventType: "article.eligibility",
    payload: {
      pageId: fetched.pageId,
      revisionId: fetched.revisionId,
      namespace: fetched.namespace,
      blpProbe: fetched.blpProbe,
      eligibility: decision.eligibility,
      recentlyEdited: decision.reasons.includes("recently_edited"),
      reasons: decision.reasons,
      fetchedAt: fetched.fetchedAt,
      gateVersion: GATE_VERSION,
      probeFired: fetched.blpProbe === "present",
      wikitextFired: decision.reasons.some(r => r === "blp_wikitext" || r.startsWith("dispute_template:")),
    },
  });

  const persisted = await getCandidatesByPageId(db, fetched.pageId);
  return {
    pageId: fetched.pageId,
    title: fetched.title,
    revisionId: fetched.revisionId,
    candidateCount: persisted.length,
    candidates: persisted,
    eligibility: decision.eligibility,
    reasons: decision.reasons,
  };
}
