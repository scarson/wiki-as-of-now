// ABOUTME: Abuse-report validation + codes-only audit row (G13, CC-12) for the compliance reporting path.
// ABOUTME: Persists a category code + optional claim key only; never the reporter's free text or identity.
import type { SqlExecutor } from "../db/client";
import { appendStatement } from "../db/audit-log";

export type AbuseCategory = "machine_text" | "unverified_citation" | "other";
export const ABUSE_CATEGORIES: readonly AbuseCategory[] = ["machine_text", "unverified_citation", "other"];

const CLAIM_KEY_RE = /^[0-9a-f]{64}$/;

export interface AbuseReportInput {
  category: string;
  claimKey?: string;
}

export type ValidationResult =
  | { ok: true; category: AbuseCategory; claimKey?: string }
  | { ok: false; error: string };

export function validateAbuseReport(input: AbuseReportInput): ValidationResult {
  if (!ABUSE_CATEGORIES.includes(input.category as AbuseCategory)) {
    return { ok: false, error: `unknown abuse category: ${String(input.category)}` };
  }
  if (input.claimKey !== undefined && !CLAIM_KEY_RE.test(input.claimKey)) {
    return { ok: false, error: "claimKey must be 64-char lowercase hex" };
  }
  return { ok: true, category: input.category as AbuseCategory, claimKey: input.claimKey };
}

/**
 * Validates the report and, if valid, writes a codes-only abuse.report audit row.
 * The persisted payload is a category code + optional claim key ONLY — any free-text
 * description on the input is intentionally dropped, never reaching the append-only
 * audit log (G13/CC-12). Returns the validation result so the caller can surface an
 * error without a second validation pass.
 */
export async function recordAbuseReport(db: SqlExecutor, input: AbuseReportInput): Promise<ValidationResult> {
  const v = validateAbuseReport(input);
  if (!v.ok) return v;
  const payload: { category: AbuseCategory; claimKey?: string } = { category: v.category };
  if (v.claimKey) payload.claimKey = v.claimKey; // codes-only; description is intentionally dropped
  await appendStatement(db, { actor: "AnonUser", eventType: "abuse.report", payload }).run();
  return v;
}
