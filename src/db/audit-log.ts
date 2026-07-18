// ABOUTME: Append-only audit-log module — insert and read audit_log rows.
// ABOUTME: Compliance invariant: exposes only append and read; no mutation or deletion.
import type { SqlExecutor, SqlStatement } from "./client";

/** Input shape for a single audit-log entry. Payload is identifiers only — never PII or document content. */
export interface AuditEntry {
  actor: string;
  eventType: string;
  payload: unknown;
}

/** A row returned from the audit log, with payload parsed from JSON. */
export interface AuditRow {
  id: number;
  ts: string;
  actor: string;
  eventType: string;
  payload: unknown;
}

/** Internal shape of a raw DB row before mapping. */
interface RawAuditRow {
  id: number;
  ts: string;
  actor: string;
  event_type: string;
  payload_json: string;
}

/**
 * Returns a bound SqlStatement for one audit_log insert without executing it.
 * The timestamp is captured at call time (not at .run() time) so the statement
 * can be batched with other statements while preserving a deterministic ts.
 * Callers can pass this to `db.batch([...])` for atomic multi-statement commits.
 */
export function appendStatement(db: SqlExecutor, entry: AuditEntry): SqlStatement {
  const ts = new Date().toISOString();
  const payloadJson = JSON.stringify(entry.payload);
  return db
    .prepare("INSERT INTO audit_log (ts, actor, event_type, payload_json) VALUES (?, ?, ?, ?)")
    .bind(ts, entry.actor, entry.eventType, payloadJson);
}

/**
 * Like {@link appendStatement}, but the insert is conditional on a users row existing —
 * the EXISTS check runs inside the same transaction as the batch it joins, so a
 * check-then-write race (e.g. two concurrent account deletions) cannot append a
 * duplicate event for an already-deleted user. Place it BEFORE the DELETE in the batch.
 */
export function appendIfUserExistsStatement(db: SqlExecutor, entry: AuditEntry, requiredUserId: string): SqlStatement {
  const ts = new Date().toISOString();
  const payloadJson = JSON.stringify(entry.payload);
  return db
    .prepare(
      "INSERT INTO audit_log (ts, actor, event_type, payload_json) " +
        "SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE user_id = ?)",
    )
    .bind(ts, entry.actor, entry.eventType, payloadJson, requiredUserId);
}

/**
 * Creates the append-only audit log bound to the given database.
 * Only `append` and `read` are exposed — no update, delete, or truncate.
 */
export function makeAuditLog(db: SqlExecutor) {
  return {
    async append(entry: AuditEntry): Promise<void> {
      await appendStatement(db, entry).run();
    },

    // Reads all audit rows in insertion order, parsing each payload from JSON.
    // NOTE: JSON.parse throws if a row's payload_json is corrupt (e.g. a manual
    // DB edit); append() always writes valid JSON, so this cannot happen for rows
    // this module wrote. Before read() is used in a user-facing path (disclosure /
    // show-your-work), wrap per-row parsing so one bad row cannot abort the read.
    async read(): Promise<AuditRow[]> {
      const rows = await db
        .prepare("SELECT id, ts, actor, event_type, payload_json FROM audit_log ORDER BY id")
        .all<RawAuditRow>();
      return rows.map(row => ({
        id: row.id,
        ts: row.ts,
        actor: row.actor,
        eventType: row.event_type,
        payload: JSON.parse(row.payload_json),
      }));
    },
  };
}
