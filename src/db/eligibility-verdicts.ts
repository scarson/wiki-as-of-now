// ABOUTME: Persistence + pre-filter query for safe-lane eligibility verdicts (advisory, never the surfacing authority).
// ABOUTME: Keyed (page_id, revision_id, gate_version); upsert on re-eval; Stage-1 pre-filter for the easy-win lane.
import type { SqlExecutor } from "./client";
import type { EligibilityDecision } from "../domain/types";

export interface VerdictRecord {
  pageId: number;
  revisionId: number;
  gateVersion: string;
  eligibility: "easy_win" | "human_only";
  reasons: string[];
  evaluatedAt: string;
}

export async function upsertVerdict(db: SqlExecutor, v: VerdictRecord): Promise<void> {
  await db
    .prepare(
      "INSERT INTO eligibility_verdicts (page_id, revision_id, gate_version, eligibility, reasons_json, evaluated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(page_id, revision_id, gate_version) DO UPDATE SET " +
        "eligibility = excluded.eligibility, reasons_json = excluded.reasons_json, evaluated_at = excluded.evaluated_at"
    )
    .bind(v.pageId, v.revisionId, v.gateVersion, v.eligibility, JSON.stringify(v.reasons), v.evaluatedAt)
    .run();
}

/** Removes a single verdict row. The lane prunes a stale (page, old_revision) verdict on
 *  revision_drift/article_gone so Stage-1 stops re-selecting a page that can no longer surface,
 *  until a fresh lookup re-records it (R3-F8 self-heal). The audit log is append-only; the verdict
 *  table is mutable cache/history, so deleting here is allowed. */
export async function deleteVerdict(db: SqlExecutor, pageId: number, revisionId: number, gateVersion: string): Promise<void> {
  await db
    .prepare("DELETE FROM eligibility_verdicts WHERE page_id = ? AND revision_id = ? AND gate_version = ?")
    .bind(pageId, revisionId, gateVersion)
    .run();
}

/** Stage-1 pre-filter: pages currently recorded easy_win for their live revision + the given gate
 *  version that also have ≥1 detected candidate. A cheap, network-free narrowing — NOT authoritative
 *  (Stage 2 re-fetches + re-runs the gate before anything is surfaced). */
export async function selectEasyWinPageIds(db: SqlExecutor, gateVersion: string): Promise<number[]> {
  const rows = await db
    .prepare(
      "SELECT a.page_id AS page_id FROM articles a " +
        "JOIN eligibility_verdicts v ON v.page_id = a.page_id AND v.revision_id = a.revision_id " +
        "AND v.gate_version = ? AND v.eligibility = 'easy_win' " +
        "WHERE EXISTS (SELECT 1 FROM stale_candidates c WHERE c.page_id = a.page_id) " +
        "ORDER BY a.page_id ASC"
    )
    .bind(gateVersion)
    .all<{ page_id: number }>();
  return rows.map(r => r.page_id);
}

/** Reads the persisted eligibility verdict for one (page, revision, gateVersion) as an EligibilityDecision,
 *  or null if absent. Defensive: a corrupt reasons_json reads as null (the route fails closed to human_only). */
export async function getVerdict(
  db: SqlExecutor, pageId: number, revisionId: number, gateVersion: string,
): Promise<EligibilityDecision | null> {
  const rows = await db
    .prepare("SELECT eligibility, reasons_json FROM eligibility_verdicts WHERE page_id = ? AND revision_id = ? AND gate_version = ?")
    .bind(pageId, revisionId, gateVersion)
    .all<{ eligibility: string; reasons_json: string }>();
  const r = rows[0];
  if (!r) return null;
  if (r.eligibility !== "easy_win" && r.eligibility !== "human_only") return null;
  let reasons: unknown;
  try { reasons = JSON.parse(r.reasons_json); } catch { return null; }
  if (!Array.isArray(reasons) || !reasons.every((x) => typeof x === "string")) return null;
  return { eligibility: r.eligibility, reasons: reasons as string[] };
}
