// ABOUTME: Single stale-candidate read by surrogate id — the enqueue route needs one candidate's fields to build a ResearchInput.
// ABOUTME: Engine-neutral via the async SqlExecutor port; returns null for an unknown id (no existence oracle).
import type { SqlExecutor } from "./client";
import type { PersistedCandidate } from "./articles";

/** A persisted candidate joined with its article's title — the claim-referent context the research input carries. */
export interface CandidateWithTitle extends PersistedCandidate {
  articleTitle: string;
}

interface RawCandidateRow {
  id: number; page_id: number; section_heading: string; sentence_text: string;
  year: number; marker: string; score: number; explanation: string;
  detector_version: string; source_revision_id: number;
  surrounding_text: string | null; article_title: string;
}

export async function getCandidateById(db: SqlExecutor, candidateId: number): Promise<CandidateWithTitle | null> {
  const rows = await db
    .prepare(
      "SELECT c.id, c.page_id, c.section_heading, c.sentence_text, c.year, c.marker, c.score, c.explanation, " +
      "c.detector_version, c.source_revision_id, c.surrounding_text, a.title AS article_title " +
      "FROM stale_candidates c JOIN articles a ON a.page_id = c.page_id WHERE c.id = ?",
    )
    .bind(candidateId)
    .all<RawCandidateRow>();
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, pageId: r.page_id, sectionHeading: r.section_heading, sentenceText: r.sentence_text,
    year: r.year, marker: r.marker, score: r.score, explanation: r.explanation,
    detectorVersion: r.detector_version, sourceRevisionId: r.source_revision_id,
    surroundingText: r.surrounding_text, articleTitle: r.article_title,
  };
}
