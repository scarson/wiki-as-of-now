// ABOUTME: Single stale-candidate read by surrogate id — the enqueue route needs one candidate's fields to build a ResearchInput.
// ABOUTME: Engine-neutral via the async SqlExecutor port; returns null for an unknown id (no existence oracle).
import type { SqlExecutor } from "./client";
import type { PersistedCandidate } from "./articles";

interface RawCandidateRow {
  id: number; page_id: number; section_heading: string; sentence_text: string;
  year: number; marker: string; score: number; explanation: string;
  detector_version: string; source_revision_id: number;
}

export async function getCandidateById(db: SqlExecutor, candidateId: number): Promise<PersistedCandidate | null> {
  const rows = await db
    .prepare(
      "SELECT id, page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id " +
      "FROM stale_candidates WHERE id = ?",
    )
    .bind(candidateId)
    .all<RawCandidateRow>();
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, pageId: r.page_id, sectionHeading: r.section_heading, sentenceText: r.sentence_text,
    year: r.year, marker: r.marker, score: r.score, explanation: r.explanation,
    detectorVersion: r.detector_version, sourceRevisionId: r.source_revision_id,
  };
}
