// ABOUTME: Persistence for articles and their stale candidates — upsert, replace-on-detect, read-back.
// ABOUTME: Engine-neutral via the async SqlExecutor port; the natural key (page_id) is never fabricated.
import type { SqlExecutor } from "./client";
import { DETECTOR_VERSION } from "../detector/detect";
import type { StaleCandidate } from "../domain/types";

/** Article metadata persisted on lookup. `pageId` is the Wikipedia pageid (natural key). */
export interface ArticleRecord {
  pageId: number;
  title: string;
  revisionId: number;
  fetchedAt: string;
}

/** A stale candidate as stored and read back from D1, with its surrogate row id. */
export interface PersistedCandidate {
  id: number;
  pageId: number;
  sectionHeading: string;
  sentenceText: string;
  year: number;
  marker: string;
  score: number;
  explanation: string;
  detectorVersion: string;
  sourceRevisionId: number;
}

/** Raw row shape from the stale_candidates table before mapping to camelCase. */
interface RawCandidateRow {
  id: number;
  page_id: number;
  section_heading: string;
  sentence_text: string;
  year: number;
  marker: string;
  score: number;
  explanation: string;
  detector_version: string;
  source_revision_id: number;
}

/**
 * Inserts an article or, if its page_id already exists, updates the mutable
 * fields in place. Idempotent on the natural key: re-looking-up an article
 * refreshes its title/revision/fetched-at rather than erroring or duplicating.
 */
export async function upsertArticle(db: SqlExecutor, article: ArticleRecord): Promise<void> {
  await db
    .prepare(
      "INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(page_id) DO UPDATE SET title = excluded.title, " +
        "revision_id = excluded.revision_id, fetched_at = excluded.fetched_at"
    )
    .bind(article.pageId, article.title, article.revisionId, article.fetchedAt)
    .run();
}

/**
 * Replaces the persisted candidate set for a page with the supplied set: deletes
 * the page's existing candidates, then inserts the fresh detector output. This
 * keeps the stored set equal to the latest run (idempotent re-detection) — a
 * re-run on a newer revision never leaves stale rows from a prior run.
 *
 * `sourceRevisionId` is the article revision the candidates were detected from;
 * `detector_version` is stamped from the detector's own version constant.
 *
 * Note: the delete + inserts are sequential statements, not a single atomic
 * transaction (the SqlExecutor port is intentionally minimal and engine-neutral;
 * D1 batching is an extension we don't need yet). Because the operation is a
 * full per-page replace, a re-run fully reconciles any partial state from an
 * interrupted prior call.
 */
export async function insertCandidates(
  db: SqlExecutor,
  pageId: number,
  sourceRevisionId: number,
  candidates: StaleCandidate[]
): Promise<void> {
  await db.prepare("DELETE FROM stale_candidates WHERE page_id = ?").bind(pageId).run();

  for (const c of candidates) {
    await db
      .prepare(
        "INSERT INTO stale_candidates " +
          "(page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        pageId,
        c.sectionHeading,
        c.sentenceText,
        c.year,
        c.marker,
        c.score.total,
        c.explanation,
        DETECTOR_VERSION,
        sourceRevisionId
      )
      .run();
  }
}

/** Reads a page's persisted candidates, highest score first (stable on id). */
export async function getCandidatesByPageId(
  db: SqlExecutor,
  pageId: number
): Promise<PersistedCandidate[]> {
  const rows = await db
    .prepare(
      "SELECT id, page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id " +
        "FROM stale_candidates WHERE page_id = ? ORDER BY score DESC, id ASC"
    )
    .bind(pageId)
    .all<RawCandidateRow>();

  return rows.map(row => ({
    id: row.id,
    pageId: row.page_id,
    sectionHeading: row.section_heading,
    sentenceText: row.sentence_text,
    year: row.year,
    marker: row.marker,
    score: row.score,
    explanation: row.explanation,
    detectorVersion: row.detector_version,
    sourceRevisionId: row.source_revision_id,
  }));
}
