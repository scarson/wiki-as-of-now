// ABOUTME: Seeder for the research queue — selects un-researched easy-win stale candidates at their live revision.
// ABOUTME: Uses packExists (full PK dedup) + in-memory claimKey dedup to collapse NFC/NFD byte-variant rows.
import type { SqlExecutor } from "../db/client";
import { computeClaimKey, packExists } from "../db/research-packs";
import type { ResearchMessage } from "./research-jobs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Over-select multiplier for the SQL LIMIT.
 *
 * Absorbs the shrinkage from SQL DISTINCT non-dedup and the in-memory claimKey/packed-skip
 * filters so the final set can still reach the requested `limit` after both filter passes.
 *
 * A fixed multiplier is sufficient ONLY while no scheduled job continuously drains and
 * re-seeds the queue (once every easy-win claim for a revision is packed, seeding goes idle).
 * A continuation-cursor seeder would be required to lift that constraint
 * (see the research-queue seeder design, spec §3).
 */
export const OVERSELECT_FACTOR = 3;

// ---------------------------------------------------------------------------
// Raw row shape from the seeder query
// ---------------------------------------------------------------------------

interface SeedRow {
  page_id: number;
  section_heading: string;
  sentence_text: string;
  year: number;
  source_revision_id: number;
}

// ---------------------------------------------------------------------------
// selectResearchSeeds
// ---------------------------------------------------------------------------

/**
 * Returns pre-built ResearchMessages for un-researched easy-win stale candidates
 * at their live revision.
 *
 * Dedup strategy (two layers):
 *  1. packExists(claimKey, source_revision_id) — exact match of the consumer's
 *     has() identity; never a SQL text JOIN (which would disagree after NFC fold).
 *  2. In-memory claimKey Set — collapses NFC/NFD byte-variant candidate rows
 *     that SQL DISTINCT keeps separate (both fold to the same claimKey).
 *
 * The SQL query joins to articles (live revision) and eligibility_verdicts (easy_win
 * at that revision + gateVersion), then applies a deterministic ORDER BY so two
 * calls on the same DB always return the same sequence.
 */
export async function selectResearchSeeds(
  db: SqlExecutor,
  opts: { gateVersion: string; limit: number },
): Promise<ResearchMessage[]> {
  const { gateVersion, limit } = opts;

  const rows = await db
    .prepare(
      "SELECT DISTINCT c.page_id, c.section_heading, c.sentence_text, c.year, c.source_revision_id " +
      "FROM stale_candidates c " +
      "JOIN articles a ON a.page_id = c.page_id AND c.source_revision_id = a.revision_id " +
      "JOIN eligibility_verdicts v ON v.page_id = a.page_id AND v.revision_id = a.revision_id " +
        "AND v.gate_version = ? AND v.eligibility = 'easy_win' " +
      "ORDER BY c.page_id, c.section_heading, c.year, c.sentence_text " +
      "LIMIT ?"
    )
    .bind(gateVersion, limit * OVERSELECT_FACTOR)
    .all<SeedRow>();

  const seen = new Set<string>();
  const messages: ResearchMessage[] = [];

  for (const row of rows) {
    if (messages.length >= limit) break;

    const claimKey = await computeClaimKey(row.page_id, row.section_heading, row.sentence_text, row.year);

    // Layer 1: packExists dedup — matches the consumer's has() identity exactly.
    if (await packExists(db, claimKey, row.source_revision_id)) continue;

    // Layer 2: in-memory claimKey dedup — collapses NFC/NFD byte-variant rows SQL DISTINCT kept separate.
    if (seen.has(claimKey)) continue;
    seen.add(claimKey);

    messages.push({
      claimKey,
      pageId: row.page_id,
      sourceRevisionId: row.source_revision_id,
      input: {
        claimText: row.sentence_text,
        sectionHeading: row.section_heading,
        year: row.year,
        sourceRevisionId: row.source_revision_id,
      },
    });
  }

  return messages;
}
