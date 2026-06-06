// ABOUTME: Easy-win lane — Stage-1 DB pre-filter then authoritative point-of-use re-fetch + re-run-gate.
// ABOUTME: Positive allowlist (include iff identity + easy_win + revision match); persisted verdict is never the authority.
import type { SqlExecutor } from "../db/client";
import { getCandidatesByPageId, type PersistedCandidate } from "../db/articles";
import { selectEasyWinPageIds, upsertVerdict, deleteVerdict } from "../db/eligibility-verdicts";
import { makeAuditLog } from "../db/audit-log";
import { fetchArticle, toArticleMetadata, type FetchLike, ArticleNotFoundError, WikimediaUnavailableError, WikimediaResponseError } from "./wikimedia";
import { evaluateEligibility, GATE_VERSION } from "../safelane/eligibility";

export const DEFAULT_MAX_PAGES = 25;            // G14 fan-out cap (named, tunable); pagination deferred
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000; // per-page re-fetch wall-clock bound; a hung fetch can't stall the lane

/** Races a promise against a timeout. On timeout, resolves to the `timedOut` sentinel and attaches a
 *  no-op catch to the original promise so a late rejection can't surface as an unhandled rejection
 *  (pristine output). Does NOT abort the underlying fetch (FetchLike has no signal); it bounds how long
 *  the lane WAITS, which is what protects the Worker wall-clock. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ timedOut: true }>(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), ms); });
  p.catch(() => {}); // swallow a post-timeout rejection
  try { return await Promise.race([p, timeout]); } finally { clearTimeout(timer!); }
}

type Outcome = "surfaced" | "demoted" | "revision_drift" | "article_gone" | "fetch_unavailable";
export interface EasyWinItem { pageId: number; title: string; revisionId: number; candidates: PersistedCandidate[]; }
export interface EasyWinLaneResult {
  items: EasyWinItem[];
  summary: { considered: number; surfaced: number; deferred: number; skipped: { pageId: number; outcome: Exclude<Outcome, "surfaced"> }[] };
}
export interface EasyWinLaneOptions { fetchFn?: FetchLike; userAgent?: string; now?: Date; maxPages?: number; fetchTimeoutMs?: number; }

interface StoredArticle { revisionId: number; title: string; }
async function currentArticleRevision(db: SqlExecutor, pageId: number): Promise<StoredArticle> {
  const rows = await db
    .prepare("SELECT revision_id AS revisionId, title FROM articles WHERE page_id = ?")
    .bind(pageId)
    .all<{ revisionId: number; title: string }>();
  return { revisionId: rows[0].revisionId, title: rows[0].title }; // page_id came from Stage-1, so the row exists
}

type Revalidation = { outcome: "surfaced"; item: EasyWinItem } | { outcome: Exclude<Outcome, "surfaced"> };

async function revalidate(db: SqlExecutor, pageId: number, storedRev: StoredArticle, now: Date, options: EasyWinLaneOptions): Promise<Revalidation> {
  const audit = (eligibility: "easy_win" | "human_only", reasons: string[], revisionId: number, outcome: Outcome) =>
    makeAuditLog(db).append({ actor: "system", eventType: "article.eligibility.revalidated",
      payload: { pageId, revisionId, eligibility, reasons, gateVersion: GATE_VERSION, outcome } });

  let fetched;
  try {
    const raced = await withTimeout(
      fetchArticle(storedRev.title, { fetchFn: options.fetchFn, userAgent: options.userAgent }),
      options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    );
    if ("timedOut" in raced) {
      // transient — no verdict mutation; log codes only. revisionId we know is the stored one.
      await audit("human_only", ["fetch_unavailable"], storedRev.revisionId, "fetch_unavailable");
      return { outcome: "fetch_unavailable" };
    }
    fetched = raced;
  } catch (err) {
    if (err instanceof ArticleNotFoundError) {
      await deleteVerdict(db, pageId, storedRev.revisionId, GATE_VERSION); // R3-F8 self-heal: page gone, stop re-selecting
      await audit("human_only", ["article_gone"], storedRev.revisionId, "article_gone");
      return { outcome: "article_gone" };
    }
    if (err instanceof WikimediaUnavailableError || err instanceof WikimediaResponseError) {
      // A per-page fetch failure (service unavailable, or a malformed/API-error response): exclude this
      // page for this read, keep the lane running for the others, and do NOT delete the verdict (the cause
      // may be transient). Per-page isolation only covers fetch failures — see the rethrow below.
      await audit("human_only", ["fetch_unavailable"], storedRev.revisionId, "fetch_unavailable");
      return { outcome: "fetch_unavailable" };
    }
    throw err; // an unexpected (non-fetch) error — a real bug or systemic DB failure — surfaces, never silently swallowed
  }

  // Identity assertion (fail-closed): a rename/redirect rebound the title to a DIFFERENT page → never surface.
  if (fetched.pageId !== pageId) {
    await audit("human_only", ["identity_mismatch"], fetched.revisionId, "demoted");
    return { outcome: "demoted" };
  }

  const decision = evaluateEligibility(toArticleMetadata(fetched), now, GATE_VERSION);

  const candidates = await getCandidatesByPageId(db, pageId);
  const drifted = fetched.revisionId !== storedRev.revisionId;
  const revisionMatches =
    !drifted &&
    candidates.every(c => c.sourceRevisionId === fetched.revisionId); // defense-in-depth: Phase-3 shared-liveRev makes these equal; assert, don't assume

  // Reconcile the persisted verdict with what the live article now shows so Stage-1 self-heals next read
  // (the verdict is a pre-filter, never the surfacing authority):
  //  - same revision → overwrite the stored verdict with the re-run result. A fresh easy_win→human_only
  //    demotion drops the page out of Stage-1; an unchanged easy_win stays selectable for the surfaced path.
  //  - drift (the live revision moved past the stored one) → the stored-revision verdict and its candidates
  //    are stale, so prune that verdict (R3-F8 self-heal) and record NONE at the live revision: no candidates
  //    exist for it yet and the lane never reprocesses (that is Phase-3). This applies whether the re-run is
  //    easy_win (revision_drift) or human_only (demoted); without it a page that drifts to a human_only
  //    revision would be re-selected and re-fetched on every read, eating the maxPages cap.
  if (drifted) {
    await deleteVerdict(db, pageId, storedRev.revisionId, GATE_VERSION);
  } else {
    await upsertVerdict(db, { pageId, revisionId: fetched.revisionId, gateVersion: GATE_VERSION,
      eligibility: decision.eligibility, reasons: decision.reasons, evaluatedAt: now.toISOString() });
  }

  // POSITIVE ALLOWLIST — the ONLY include path.
  if (decision.eligibility === "easy_win" && fetched.pageId === pageId && revisionMatches) {
    await audit(decision.eligibility, decision.reasons, fetched.revisionId, "surfaced");
    return { outcome: "surfaced", item: { pageId, title: fetched.title, revisionId: fetched.revisionId, candidates } };
  }

  // Classify the exclusion (the reconcile above already self-healed the persisted verdict for every case).
  if (decision.eligibility === "easy_win" && !revisionMatches) {
    // easy_win at the live revision, but the stored candidates describe an older one — not surfaced
    // (re-detection is Phase-3, not the lane's job); articles.revision_id is left untouched.
    await audit(decision.eligibility, decision.reasons, fetched.revisionId, "revision_drift");
    return { outcome: "revision_drift" };
  }
  // human_only at the live revision (incl. metadata_unavailable), with or without drift.
  await audit(decision.eligibility, decision.reasons, fetched.revisionId, "demoted");
  return { outcome: "demoted" };
}

export async function getEasyWinLane(db: SqlExecutor, options: EasyWinLaneOptions = {}): Promise<EasyWinLaneResult> {
  const now = options.now ?? new Date();
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const all = await selectEasyWinPageIds(db, GATE_VERSION);
  const pageIds = all.slice(0, maxPages);
  const deferred = all.length - pageIds.length;

  const items: EasyWinItem[] = [];
  const skipped: EasyWinLaneResult["summary"]["skipped"] = [];

  for (const pageId of pageIds) {  // bounded, sequential (G14-polite); concurrency cap is a future tuning
    const storedRev = await currentArticleRevision(db, pageId);
    const result = await revalidate(db, pageId, storedRev, now, options);
    if (result.outcome === "surfaced") items.push(result.item);
    else skipped.push({ pageId, outcome: result.outcome });
  }
  return { items, summary: { considered: pageIds.length, surfaced: items.length, deferred, skipped } };
}
