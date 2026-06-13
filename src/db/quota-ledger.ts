// ABOUTME: Write-once quota ledger — one row per committed research pack (the metered unit; CC §3.4).
// ABOUTME: insertQuotaEntryStatement is bound/unexecuted for atomic batching with the pack insert; count queries for caps.
import type { SqlExecutor, SqlStatement } from "./client";

export interface QuotaLedgerEntry {
  claimKey: string;
  sourceRevisionId: number;
  userId: string;
  evaluatedAt: string;
  neurons: number;
  braveQueryCount: number;
}

/** Bound, UNEXECUTED insert — ON CONFLICT DO NOTHING mirrors the pack's write-once semantics.
 *  Must be produced by the SAME executor passed to db.batch([...]) (CC-3). */
export function insertQuotaEntryStatement(db: SqlExecutor, e: QuotaLedgerEntry): SqlStatement {
  return db
    .prepare(
      "INSERT INTO quota_ledger (claim_key, source_revision_id, user_id, evaluated_at, neurons, brave_query_count) " +
        "VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(claim_key, source_revision_id) DO NOTHING",
    )
    .bind(e.claimKey, e.sourceRevisionId, e.userId, e.evaluatedAt, e.neurons, e.braveQueryCount);
}

/** Count of packs committed by one user on a given UTC day (cap input). */
export async function countPacksForUserOnDay(db: SqlExecutor, userId: string, utcDay: string): Promise<number> {
  const rows = await db
    .prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE user_id = ? AND substr(evaluated_at, 1, 10) = ?")
    .bind(userId, utcDay)
    .all<{ n: number }>();
  return rows[0]?.n ?? 0;
}

/** Count of packs committed globally on a given UTC day (global-cap input). */
export async function countPacksGlobalOnDay(db: SqlExecutor, utcDay: string): Promise<number> {
  const rows = await db
    .prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE substr(evaluated_at, 1, 10) = ?")
    .bind(utcDay)
    .all<{ n: number }>();
  return rows[0]?.n ?? 0;
}
