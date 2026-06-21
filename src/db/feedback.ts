// ABOUTME: Session-completion feedback as codes-only rows over the existing append-only audit_log (G13, CC-12).
// ABOUTME: Quality-not-volume — outcome codes only, never free text/PII; additive, no second pipeline or table.
import type { SqlExecutor, SqlStatement } from "./client";
import { appendStatement, type AuditEntry } from "./audit-log";

export type FeedbackOutcome = "edit_made" | "no_edit" | "abandoned";
const VALID_OUTCOMES: readonly FeedbackOutcome[] = ["edit_made", "no_edit", "abandoned"];

export interface FeedbackEntry {
  actor: string;
  outcome: FeedbackOutcome;
  claimKey?: string; // optional identifier; never free text
}

function toAuditEntry(entry: FeedbackEntry): AuditEntry {
  if (!VALID_OUTCOMES.includes(entry.outcome)) {
    throw new Error(`unknown feedback outcome: ${String(entry.outcome)}`);
  }
  const payload: { outcome: FeedbackOutcome; claimKey?: string } = { outcome: entry.outcome };
  if (entry.claimKey) payload.claimKey = entry.claimKey;
  return { actor: entry.actor, eventType: "session.feedback", payload };
}

/**
 * Returns a bound, unexecuted statement for one codes-only session.feedback row.
 * Mirrors appendStatement (audit-log.ts:36) so feedback can join an atomic
 * db.batch([...]) with another write. Validates the outcome before binding so an
 * invalid code never produces a statement.
 */
export function appendFeedbackStatement(db: SqlExecutor, entry: FeedbackEntry): SqlStatement {
  return appendStatement(db, toAuditEntry(entry));
}

export async function recordFeedback(db: SqlExecutor, entry: FeedbackEntry): Promise<void> {
  await appendFeedbackStatement(db, entry).run();
}
