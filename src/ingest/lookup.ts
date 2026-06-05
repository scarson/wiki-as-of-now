// ABOUTME: Single-article lookup orchestrator — fetch → parse → detect → persist → audit.
// ABOUTME: Deterministic (no LLM, G10); supplies asOfYear from the app clock, keeping the detector clockless.
import type { SqlExecutor } from "../db/client";
import { upsertArticle, insertCandidates, getCandidatesByPageId, type PersistedCandidate } from "../db/articles";
import { makeAuditLog } from "../db/audit-log";
import { parseArticle } from "../detector/parse";
import { detectStaleClaims, DETECTOR_VERSION } from "../detector/detect";
import { fetchArticle, type FetchLike } from "./wikimedia";

export interface LookupOptions {
  fetchFn?: FetchLike;
  userAgent?: string;
  /** Reference year the detector compares against. Defaults to the current UTC year. */
  asOfYear?: number;
}

/** Summary returned to the API/UI after a lookup. `candidates` is the persisted (read-back) set. */
export interface LookupResult {
  pageId: number;
  title: string;
  revisionId: number;
  candidateCount: number;
  candidates: PersistedCandidate[];
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

  const persisted = await getCandidatesByPageId(db, fetched.pageId);
  return {
    pageId: fetched.pageId,
    title: fetched.title,
    revisionId: fetched.revisionId,
    candidateCount: persisted.length,
    candidates: persisted,
  };
}
