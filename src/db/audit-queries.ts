// ABOUTME: Defensive read helpers over audit_log for the user-facing transparency/disclosure trail (CC-19, G13).
// ABOUTME: Per-row JSON isolation (one corrupt row never aborts the read); codes-only — never joins in PII.
import type { SqlExecutor } from "./client";

export interface AuditTrailRow {
  id: number;
  ts: string;
  actor: string;
  eventType: string;
  payload: unknown | null; // null when payload_json failed to parse
  corrupt: boolean;
}

interface RawAuditRow {
  id: number;
  ts: string;
  actor: string;
  event_type: string;
  payload_json: string;
}

/**
 * Reads the full audit trail in insertion order with per-row JSON isolation.
 * Unlike makeAuditLog().read(), one corrupt payload_json degrades to a placeholder
 * ({ payload: null, corrupt: true }) instead of throwing and blanking the whole
 * user-facing trail (CC-19, audit-log.ts:57-58). Codes-only: returns identifiers
 * exactly as the log stored them; never joins in titles or sentence text (G13/CC-12).
 */
export async function readAuditTrail(db: SqlExecutor): Promise<AuditTrailRow[]> {
  const rows = await db
    .prepare("SELECT id, ts, actor, event_type, payload_json FROM audit_log ORDER BY id ASC")
    .all<RawAuditRow>();
  return rows.map((r) => {
    try {
      return { id: r.id, ts: r.ts, actor: r.actor, eventType: r.event_type, payload: JSON.parse(r.payload_json), corrupt: false };
    } catch {
      // CC-19: a single corrupt payload must degrade, not abort the user-facing trail.
      return { id: r.id, ts: r.ts, actor: r.actor, eventType: r.event_type, payload: null, corrupt: true };
    }
  });
}

/**
 * Counts session.feedback rows grouped by outcome code. Corrupt rows are skipped
 * (they do not abort the summary). Codes-only — reads the outcome code, never any
 * other payload field, and never joins in PII (G13/CC-12).
 */
export async function summarizeFeedback(db: SqlExecutor): Promise<Record<string, number>> {
  const rows = await db
    .prepare("SELECT payload_json FROM audit_log WHERE event_type = ? ORDER BY id ASC")
    .bind("session.feedback")
    .all<{ payload_json: string }>();
  const counts: Record<string, number> = {};
  for (const r of rows) {
    try {
      const outcome = (JSON.parse(r.payload_json) as { outcome?: string }).outcome;
      if (typeof outcome === "string") counts[outcome] = (counts[outcome] ?? 0) + 1;
    } catch {
      // skip corrupt rows; they do not abort the summary
    }
  }
  return counts;
}
