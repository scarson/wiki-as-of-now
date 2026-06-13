// ABOUTME: loadWorksheetView — assembles the worksheet view (claim + pack honesty + verbatim cards) for a candidate.
// ABOUTME: Pure composition over Phase 2's surfaceResearchPack (SurfacedPack); does NOT re-call getSurfaceablePack (D-2).
import type { SqlExecutor } from "../db/client";
import { computeClaimKey } from "../db/research-packs";
import { surfaceResearchPack, type SurfacedPack } from "../research/surface-pack";
import { honestyFromSurfaced } from "./honesty-state";
import { toEvidenceCardView } from "./evidence-card";
import type { WorksheetView } from "./view-types";

interface ClaimRow {
  id: number;
  page_id: number;
  section_heading: string;
  sentence_text: string;
  year: number;
  marker: string;
  explanation: string;
  source_revision_id: number;
}

type SurfaceFn = (
  db: SqlExecutor,
  args: { pageId: number; claimKey: string; currentRevisionId: number },
) => Promise<SurfacedPack>;

export async function loadWorksheetView(
  db: SqlExecutor,
  candidateId: number,
  surface: SurfaceFn = surfaceResearchPack,
): Promise<WorksheetView | null> {
  const rows = await db.prepare(
    "SELECT id, page_id, section_heading, sentence_text, year, marker, explanation, source_revision_id FROM stale_candidates WHERE id = ?",
  ).bind(candidateId).all<ClaimRow>();
  if (rows.length === 0) return null;
  const c = rows[0];

  const articleRows = await db.prepare("SELECT revision_id FROM articles WHERE page_id = ?")
    .bind(c.page_id).all<{ revision_id: number }>();
  const currentRevisionId = articleRows.length > 0 ? articleRows[0].revision_id : c.source_revision_id;

  const claimKey = await computeClaimKey(c.page_id, c.section_heading, c.sentence_text, c.year);
  const surfaced = await surface(db, { pageId: c.page_id, claimKey, currentRevisionId });

  const honesty = honestyFromSurfaced(surfaced);
  const cards = surfaced.state === "surfaced" ? surfaced.cards.map(toEvidenceCardView) : [];
  const modelVersion = surfaced.state === "surfaced" ? surfaced.modelVersion : null;
  const queries = surfaced.state === "surfaced" ? surfaced.queries : [];

  return {
    claim: {
      candidateId: c.id,
      pageId: c.page_id,
      sectionHeading: c.section_heading,
      sentenceText: c.sentence_text,
      year: c.year,
      marker: c.marker,
      explanation: c.explanation,
      sourceRevisionId: c.source_revision_id,
    },
    honesty,
    cards,
    modelVersion,
    queries,
    claimKey,
  };
}
