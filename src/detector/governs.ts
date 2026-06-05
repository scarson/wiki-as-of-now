// ABOUTME: Year-eligibility filter — returns the past years a forward marker grammatically governs.
// ABOUTME: Deterministic and LLM-free; drops incidental years (side-clause asides, noun/label/range years).
import { DATELINE_REGEX } from "./suppress";

/** A 4-digit year with its character span in the sentence. */
export interface YearOccurrence {
  value: number;
  start: number;
  end: number;
}

const YEAR_PATTERN = /\b(?:19\d\d|20\d\d)\b/g;

/** Finds every 4-digit year (1900–2099) with its character offsets, in appearance order. */
export function yearOccurrences(sentence: string): YearOccurrence[] {
  const out: YearOccurrence[] = [];
  YEAR_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = YEAR_PATTERN.exec(sentence)) !== null) {
    out.push({ value: Number(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Returns the subset of `pastYears` that `marker` grammatically governs — the
 * anchorable target years. Incidental years are dropped (design §2). A leading
 * sentence-initial dateline year is intentionally KEPT eligible (deferred to
 * suppress.ts Rule 1; design §2.2) so this stays a DET-3-only precision change.
 */
export function governedYears(sentence: string, marker: string, pastYears: number[]): number[] {
  const markerIndex = markerPosition(sentence, marker);
  const past = new Set(pastYears);
  const eligible = yearOccurrences(sentence).filter(
    occ => past.has(occ.value) && !isIncidental(sentence, markerIndex, occ)
  );
  return [...new Set(eligible.map(o => o.value))];
}

/**
 * Word-boundary character offset of `marker` in `sentence` (case-insensitive),
 * or -1. Word-boundary-matched to stay consistent with findExpectationMarkers —
 * a plain indexOf would match "will" inside "willing" and misplace the marker.
 */
function markerPosition(sentence: string, marker: string): number {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\b${escaped}\\b`, "i").exec(sentence);
  return m ? m.index : -1;
}

/** Composes the role discriminators. Built up across Phase 2. */
function isIncidental(sentence: string, markerIndex: number, occ: YearOccurrence): boolean {
  if (isLeadingDatelineYear(sentence, occ)) return false; // §2.2 — defer to suppress Rule 1
  return isCrossClauseAside(sentence, markerIndex, occ);
  // Further discriminators are OR-ed in by later tasks.
}

/**
 * True when `occ` IS the leading sentence-initial dateline year that suppress.ts
 * Rule 1 handles. Reuses Rule 1's DATELINE_REGEX so the two never diverge (§2.2).
 */
function isLeadingDatelineYear(sentence: string, occ: YearOccurrence): boolean {
  const m = DATELINE_REGEX.exec(sentence);
  if (!m) return false;
  // DATELINE_REGEX is anchored (^) and captures the frame year in group 1.
  const yearStart = m.index + m[0].lastIndexOf(m[1]);
  return occ.start === yearStart;
}

/**
 * Past-participle verbs that head an aside ("…, built in 1910", "…, updated in
 * 2019,"): the year belongs to the aside, not the marker. Extended only to
 * participles the curated `cross-clause-aside` entries (or a locked mixed-case
 * test) actually exhibit — a broad speculative list widens the precision surface
 * for no curated benefit (design §6, YAGNI). Each is safe because the
 * CLAUSE_BOUNDARY check below means a forward target ("expected to be completed
 * in 2024", "expected to be updated in 2027") — which has NO boundary between the
 * marker and the year — is never matched.
 */
const ASIDE_PARTICIPLE =
  /\b(?:built|constructed|opened|founded|established|completed|updated)\s+(?:in\s+)?$/i;

/** Clause boundaries that separate an aside from the marker's clause (§2.1). */
const CLAUSE_BOUNDARY = /[,;—]|\b(?:which|who|that|where)\b/i;

/**
 * A non-leading dateline frame ("… km. In 2017, …"): a sentence-period followed
 * by an In/By/During/On/As-of frame immediately before the year. The two-sentence
 * unit the parser merged dates a SEPARATE trailing clause to that year; the period
 * is the clause boundary. Distinct from the protected sentence-INITIAL dateline
 * (§2.2), which `isLeadingDatelineYear` keeps eligible.
 */
const NONLEADING_DATELINE = /[.]\s+(?:In|By|During|On|As of)\s+$/i;

/**
 * Subordinating conjunctions that open a leading status clause ("Though tunneling
 * had still not begun by mid-2025, … scheduled to …"): a year inside that leading
 * clause is the status of a different subject, not the marker's target.
 */
const LEADING_SUBORDINATE = /^(?:Though|Although|While|Whilst|Whereas)\b/i;

function isCrossClauseAside(sentence: string, markerIndex: number, occ: YearOccurrence): boolean {
  if (markerIndex < 0) return false;
  const localBefore = sentence.slice(Math.max(0, occ.start - 40), occ.start);
  const lo = Math.min(markerIndex, occ.start);
  const hi = Math.max(markerIndex, occ.start);
  const boundaryBetween = CLAUSE_BOUNDARY.test(sentence.slice(lo, hi)); // §2.1

  // (1) Participial aside: a clause boundary between marker and year, and the year
  // is governed by an aside participle ("…, built in 1910").
  if (boundaryBetween && ASIDE_PARTICIPLE.test(localBefore)) return true;

  // (2) Non-leading dateline: the year dates a trailing clause after a sentence
  // period ("… expected … . In 2017, …"). The period is the boundary, so this does
  // not also require a comma — but the marker must sit in the earlier clause.
  if (markerIndex < occ.start && NONLEADING_DATELINE.test(localBefore)) return true;

  // (3) Leading subordinate clause: sentence opens with Though/Although/While… and
  // the year sits in that leading clause (before the first comma), the marker after.
  if (boundaryBetween && LEADING_SUBORDINATE.test(sentence)) {
    const firstComma = sentence.indexOf(",");
    if (firstComma > occ.start && firstComma < markerIndex) return true;
  }

  return false;
}
