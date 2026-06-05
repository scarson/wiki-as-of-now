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
  return isCrossClauseAside(sentence, markerIndex, occ) || isNounModifier(sentence, markerIndex, occ);
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

/** A determiner immediately before the year ("the 2021 update", "its 2024 plan"). */
const DETERMINER_BEFORE = /\b(?:the|a|an|its|their|this|that|each|every|same|our|his|her)\s+$/i;

/** A possessive immediately before the year ("Science's 2020 survey"). */
const POSSESSIVE_BEFORE = /['’]s\s+$/i;

/** Temporal prepositions that can frame a year as a target/window rather than label it. */
const TEMPORAL_PREP = "in|by|for|on|until|through|during|before|after|since|around";

/**
 * A bare temporal frame "<prep> <year>" with NO determiner ("by 2023 …", "after 2020 …",
 * "in 2024 …"): the year is a temporal window/target, so a proper-noun SUBJECT that
 * follows it ("by 2023 SpaceX will fly", "After 2020 the Army planned") is NOT a label.
 * KEPT regardless of marker position (README excluded-as-not-incidental frame years).
 */
const BARE_FRAME_PREP_BEFORE = new RegExp(`\\b(?:${TEMPORAL_PREP})\\s+$`, "i");

/**
 * A temporal preposition before a DETERMINER-led year ("in the 2022 …", "before the
 * 2024 …"): ambiguous between the marker's forward complement and an aside label. It is
 * the marker's complement (KEEP) only when the marker sits before the year in its clause
 * ("expected to give … a boost in the 2022 midterm elections"); the same "<prep> the
 * <year> <noun>" with the marker AFTER the year is a leading/embedded aside label and is
 * dropped ("During the 2025 … shutdown, … expected to …"; README over-drop cases).
 */
const DETERMINED_PREP_BEFORE = new RegExp(`\\b(?:${TEMPORAL_PREP})\\s+the\\s+$`, "i");

/**
 * True when `occ` is an attributive label on a noun ("the 2021 update of the IRDS",
 * "2024 Update", "Science's 2020 survey") rather than a temporal target. A determiner
 * or possessive immediately before the year, or a capitalized noun immediately after,
 * marks the label. Two temporal-frame escapes keep a real target year from being mislabeled:
 * a bare "<prep> <year>" frame (no determiner) is always a temporal window (KEEP), and a
 * "<prep> the <year> <noun>" frame is the marker's complement (KEEP) only when the marker
 * precedes the year — otherwise it is an aside label and IS dropped (design §2 row 2).
 */
function isNounModifier(sentence: string, markerIndex: number, occ: YearOccurrence): boolean {
  const after = sentence.slice(occ.end, occ.end + 24);
  if (!/^\s+[A-Za-z]/.test(after)) return false; // a word must follow the year
  const before = sentence.slice(Math.max(0, occ.start - 24), occ.start);
  const determinerBefore = DETERMINER_BEFORE.test(before);
  const possessiveBefore = POSSESSIVE_BEFORE.test(before);
  const capNounAfter = /^\s+[A-Z][a-z]+/.test(after); // "2024 Update"
  if (!(determinerBefore || possessiveBefore || capNounAfter)) return false;

  // Bare "<prep> <year>" (no determiner) is a temporal frame, never a label.
  if (!determinerBefore && BARE_FRAME_PREP_BEFORE.test(before)) return false;
  // "<prep> the <year> <noun>" is the marker's complement (KEEP) only if the marker
  // precedes the year; with the marker after, it is an aside label (DROP).
  const markerBeforeYear = markerIndex >= 0 && markerIndex < occ.start;
  if (markerBeforeYear && DETERMINED_PREP_BEFORE.test(before)) return false;
  return true;
}
