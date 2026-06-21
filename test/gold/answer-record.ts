// ABOUTME: Schema + validators for the verified current-state ground-truth corpus answer records.
// ABOUTME: Pure — types, the disposition→outcome nesting table, record validation, and snapshot body hashing.
import { createHash } from "node:crypto";

export type Disposition = "confirmed_stale" | "superseded" | "still_current" | "unverifiable";
export type Outcome =
  | "event_occurred" | "slipped_still_pending"
  | "event_cancelled" | "superseded"
  | "still_current"
  | "unverifiable";

/** The design §3.1 nesting table — each coarse disposition's allowed granular outcomes. */
export const DISPOSITION_OUTCOMES: Record<Disposition, readonly Outcome[]> = {
  confirmed_stale: ["event_occurred", "slipped_still_pending"],
  superseded: ["event_cancelled", "superseded"],
  still_current: ["still_current"],
  unverifiable: ["unverifiable"],
};

export type Certification = "agent_auto" | "human_confirmed";

export interface EvidenceRef {
  sourceUrl: string;
  snapshot: string;            // repo-relative path under test/gold/sources/
  contentHashSha256: string;   // body hash from the url-to-markdown --json envelope
  verbatimQuote: string;       // MUST be byte-present on the snapshot body (evaluateQuote)
  supportsStaleness: boolean;
}

export interface AnswerRecord {
  fixture: string;
  sentenceSubstring: string;
  expectedYear: number | null;
  disposition: Disposition;
  outcome: Outcome;
  evidence: EvidenceRef[];
  supersededBy: string | null; // only on superseded records
  certification: Certification;
  verifiedAsOf: string;        // YYYY-MM-DD
}

/** Structural + invariant validation. Does NOT check byte-presence/hash — those need the snapshot files (integrity test). */
export function validateAnswerRecord(rec: AnswerRecord): string[] {
  const errs: string[] = [];
  const allowed = DISPOSITION_OUTCOMES[rec.disposition];
  if (!allowed) errs.push(`unknown disposition: ${rec.disposition}`);
  else if (!allowed.includes(rec.outcome)) errs.push(`outcome ${rec.outcome} does not nest under disposition ${rec.disposition}`);

  if (rec.certification !== "agent_auto" && rec.certification !== "human_confirmed")
    errs.push(`unknown certification: ${rec.certification}`);

  if (rec.disposition === "unverifiable") {
    if (rec.evidence.length !== 0) errs.push("unverifiable record must carry evidence: []");
    if (rec.certification !== "human_confirmed") errs.push("unverifiable record must be human_confirmed");
  } else if (rec.evidence.length === 0) {
    errs.push(`${rec.disposition} record must carry >= 1 evidence entry`);
  }

  if (rec.supersededBy !== null && rec.disposition !== "superseded")
    errs.push("supersededBy is only valid on a superseded record");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.verifiedAsOf)) errs.push(`verifiedAsOf must be YYYY-MM-DD: ${rec.verifiedAsOf}`);
  return errs;
}

/** Strip a leading YAML frontmatter block delimited by the first two `---` lines; return the rest verbatim. */
export function stripFrontmatter(fileText: string): string {
  if (!fileText.startsWith("---")) return fileText;
  const closeIdx = fileText.indexOf("\n---", 3);
  if (closeIdx === -1) return fileText;
  const afterClose = fileText.indexOf("\n", closeIdx + 1);
  return afterClose === -1 ? "" : fileText.slice(afterClose + 1);
}

/** Recompute the url-to-markdown body hash: SHA256 of the markdown body, EXCLUDING the YAML frontmatter block. */
export function hashSnapshotBody(fileText: string): string {
  return createHash("sha256").update(stripFrontmatter(fileText), "utf8").digest("hex");
}
