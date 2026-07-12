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
  return (
    isCrossClauseAside(sentence, markerIndex, occ) ||
    isNounModifier(sentence, markerIndex, occ) ||
    isNamedEntity(sentence, markerIndex, occ) ||
    isParentheticalOrRange(sentence, occ)
  );
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
 * A deadline preposition before a determiner-led year ("by the 2024 election", "until
 * the 2023 review"): by/before/until point the claim AT that year (a deadline target),
 * unlike background framing (during/in/after the <year>). So a deadline-framed year is
 * the marker's target regardless of marker position ("the bill will pass by the 2024
 * election" keeps 2024 even though the marker trails the year).
 */
const DEADLINE_DETERMINED_PREP_BEFORE = /\b(?:by|before|until)\s+the\s+$/i;

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
  // A deadline frame (by/before/until the <year> <event>) targets that year regardless
  // of marker position; only background frames (during/in/after the <year>) are dropped.
  if (DEADLINE_DETERMINED_PREP_BEFORE.test(before)) return false;
  return true;
}

/**
 * Month names — a month immediately before a year is a date ("March 2013"),
 * not a named entity; months must not be treated as proper-noun labels.
 */
const MONTH_NAME =
  /^(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)$/i;

/**
 * Temporal preposition words — when a capitalized token IS one of these, it is a
 * sentence-initial frame ("After 2020, …"; "From 2015 to 2022, …") rather than
 * a proper-noun entity label. "from" is excluded from TEMPORAL_PREP (used in
 * bare-frame and deadline guards elsewhere) to avoid widening those predicates,
 * but added here where the only check is "is this word itself a frame preposition."
 */
const TEMPORAL_PREP_WORD = new RegExp(`^(?:${TEMPORAL_PREP}|from)$`, "i");

/**
 * True when `occ` is part of a proper-noun name: a capitalized non-month token
 * sits IMMEDIATELY before the year with only whitespace between ("CES 2025",
 * "MSPO 2024", "PzH 2000"). Two over-drop guards keep real targets eligible:
 * (1) a temporal preposition immediately before the token ("at CES 2025" is fine
 *     to drop, but a bare-frame "in 2024" must not trigger via another token);
 * (2) the token itself is a temporal preposition (sentence-initial capital —
 *     "After 2020, the Army planned to buy …" must NOT be dropped);
 * (3) the marker precedes the year in its own clause — the year is the marker's
 *     complement target ("The Navy will request FY 2022 funding"), not a label
 *     in an aside that precedes the marker.
 */
function isNamedEntity(sentence: string, markerIndex: number, occ: YearOccurrence): boolean {
  // Extract the token immediately before the year (up to 24 chars back).
  const localBefore = sentence.slice(Math.max(0, occ.start - 24), occ.start);
  const m = /(\b[A-Z][A-Za-z0-9.&-]+)\s+$/.exec(localBefore);
  if (!m) return false;
  const token = m[1];
  // A month name is a date component, not an entity.
  if (MONTH_NAME.test(token)) return false;
  // A temporal preposition as the immediate token is a frame, not an entity
  // (handles sentence-initial capitalisation: "After 2020, …").
  if (TEMPORAL_PREP_WORD.test(token)) return false;
  // If the marker precedes the year, the year is in the marker's complement
  // clause — the marker governs it, not a proper-noun label.
  if (markerIndex >= 0 && markerIndex < occ.start) return false;
  // If a temporal preposition precedes this token, the year is a temporal frame.
  const beforeToken = localBefore.slice(0, m.index);
  if (BARE_FRAME_PREP_BEFORE.test(beforeToken + " ")) return false;
  return true;
}

/**
 * True when `occ` is inside balanced parentheses, OR part of a
 * `<year>[–-]<year>` / "from `<year>` to `<year>`" / "between `<year>` and
 * `<year>`" range (design §2 row 4). A range is only excluded as an incidental
 * anchor — never recovered as a target (design §5).
 *
 * Exception: a SENTENCE-INITIAL "From X to Y, ..." construct is the marker's
 * own temporal window (e.g. "From 2015 to 2022, units will be manufactured")
 * and MUST NOT be dropped — design §5 / README "excluded as not-incidental".
 */
function isParentheticalOrRange(sentence: string, occ: YearOccurrence): boolean {
  // --- Parenthetical check ---
  // Count unmatched open parens before the year; if there are more opens than
  // closes, and a closing paren appears after the year (within the sentence),
  // the year is inside balanced parentheses.
  const before = sentence.slice(0, occ.start);
  const opens = (before.match(/\(/g) || []).length;
  const closes = (before.match(/\)/g) || []).length;
  const inParens =
    opens > closes && /^[^)]*\)/.test(sentence.slice(occ.end));
  if (inParens) return true;

  // --- Range check ---
  // Adjacent hyphen/en-dash range: <year>[–-]<year>
  const around = sentence.slice(Math.max(0, occ.start - 10), occ.end + 10);
  if (/\d{4}\s*[–\-]\s*\d{4}/.test(around)) return true;

  // Multi-word range patterns: scan the full sentence so the end year can see
  // the opening keyword even when it sits > 10 characters before the year.
  // Each pattern object carries sentenceInitialSafe: a sentence-initial match
  // of that pattern is the marker's own temporal window and is kept eligible.
  const rangePatterns: { re: RegExp; sentenceInitialSafe: boolean }[] = [
    // "from <year> to <year>": sentence-initial form is the marker's window (KEEP).
    { re: /\bfrom\s+\d{4}\s+to\s+\d{4}\b/gi, sentenceInitialSafe: true },
    // "between <year> and <year>": always an incidental historical span (DROP).
    { re: /\bbetween\s+\d{4}\s+and\s+\d{4}\b/gi, sentenceInitialSafe: false },
  ];
  for (const { re, sentenceInitialSafe } of rangePatterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence)) !== null) {
      // Is this occurrence's start position inside this match span?
      if (occ.start < m.index || occ.start >= m.index + m[0].length) continue;
      // Sentence-initial "From X to Y" is the marker's forward window — KEEP.
      if (sentenceInitialSafe && m.index === 0) continue;
      return true;
    }
  }

  return false;
}
