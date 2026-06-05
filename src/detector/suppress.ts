// ABOUTME: Negative-pattern suppression — returns a penalty score that reduces false positives
// ABOUTME: in stale-claim detection by identifying historical narration, quotations, and resolved claims.
import { findExpectationMarkers } from "./markers";

/**
 * Month names (full + common abbreviations) and the loose date qualifiers
 * early/late/mid that legitimately precede a year in a leading dateline frame
 * (e.g. "In March 2013", "In early 2007"). Constraining the dateline's optional
 * pre-year slot to THIS set — rather than any word — stops budget-/document-year
 * references like "In the 2008 budget, the Navy plans to..." from being read as
 * a historical dateline and over-suppressed.
 */
const DATELINE_MONTH_OR_QUALIFIER =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December|" +
  "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|early|late|mid)\\.?\\s+";

/**
 * A sentence-initial temporal frame: In/By/During/As of + an optional month or
 * date qualifier + a 4-digit year (1900–2099). The year is captured in group 1.
 *
 * ⚠ The year alternatives MUST stay grouped — an un-grouped `...|20[0-2]\d`
 * would let the bare year branch match any 20xx year anywhere in the sentence
 * and over-suppress valid claims.
 */
const DATELINE_REGEX = new RegExp(
  `^(?:In|By|During|As of)\\s+(?:${DATELINE_MONTH_OR_QUALIFIER})?(1[89]\\d\\d|20[0-2]\\d)\\b`,
  "i"
);

/**
 * A resolution cue (later/subsequently/ultimately) IMMEDIATELY followed by a
 * past-participle resolution verb — the form that signals the article resolved
 * the claim nearby (e.g. "later completed", "subsequently cancelled"). Bare
 * "later"/"ultimately" are ordinary temporal adverbs ("deployed later in 2017")
 * and must NOT suppress, so the verb is required.
 */
const RESOLUTION_REGEX =
  /\b(?:later|subsequently|ultimately)\s+(?:was\s+|were\s+|been\s+)?(?:completed|cancell?ed|abandoned|withdrawn|terminated|scrapped|halted|shelved|delivered|finished|resolved|retired|decommissioned|dropped|suspended|postponed|delayed)\b/i;

/**
 * Veto-strength penalty applied when a suppression rule fires.
 *
 * Magnitude is calibrated to out-weigh `temporalRisk` in score.ts's
 * `total = max(0, temporalRisk + futureTenseConfidence - suppression)`,
 * ensuring a fired suppression rule drops even old claims that would
 * otherwise score high. Calibrated against the Task 2.7 precision gate;
 * this value embodies the precision-over-recall design choice.
 */
const SUPPRESSION_PENALTY = 100;

/**
 * Computes a non-negative suppression penalty for `sentence`.
 *
 * Returns `SUPPRESSION_PENALTY × (number of rules that fire)`, or `0` if
 * none fire. A non-zero return signals that the sentence matches a known
 * false-positive pattern and should be down-weighted by the scorer.
 *
 * @param sentence - The sentence under evaluation.
 * @param year     - The claim's anchor year (the past year the scorer is
 *                  scoring). Used by the dateline rule: a leading temporal
 *                  frame is only narration when its year IS the claim's year.
 */
export function suppressionScore(sentence: string, year: number): number {
  let rulesHit = 0;

  // Rule 1 — historical dateline narration.
  // Fires when the sentence opens with a temporal frame (DATELINE_REGEX) AND
  // that frame year equals the claim's anchor `year`. A leading dateline whose
  // year IS the claim year means the marker reports a past intention/statement
  // made AT that time (e.g. "In March 2013, the administration announced plans
  // to add...") rather than an unresolved forward claim.
  //
  // The `year` argument is the year detect.ts chose for this candidate. detect.ts
  // picks the EARLIEST past year in the sentence, so for a sentence that opens
  // with a dateline AND carries a later forward target (e.g. "In 2015, ... was
  // expected to deliver in 2020."), the chosen year is the dateline (2015) and
  // the whole sentence is suppressed. That is the deliberate precision-over-recall
  // choice: such "In <year-A>, ... <marker> ... in <year-B>" sentences are
  // ambiguous between historical narration and a live forward claim, and we
  // favour suppression. The accepted recall gap is recorded in the plan's
  // Discoveries and docs/pitfalls (DET-1). Called directly with year == the
  // later target (B != A), Rule 1 does NOT fire — but detect.ts never passes B.
  const datelineMatch = DATELINE_REGEX.exec(sentence);
  if (datelineMatch && Number(datelineMatch[1]) === year) {
    rulesHit++;
  }

  // Rule 2 — quotation.
  // Fires when an expectation marker sits inside a quoted span.
  // Guards: a marker quoted from a source is not asserted by the article
  // (e.g. 'a spokesman said it "is expected to launch in 2017"').
  const quotedSpanPattern = /"([^"]*)"/g;
  let quotedMatch: RegExpExecArray | null;
  while ((quotedMatch = quotedSpanPattern.exec(sentence)) !== null) {
    const span = quotedMatch[1];
    if (findExpectationMarkers(span).length >= 1) {
      rulesHit++;
      break; // one fired quote is enough to count the rule once
    }
  }

  // Rule 3 — later-resolution cue.
  // Fires only when a resolution cue is followed by a resolution verb
  // (RESOLUTION_REGEX), i.e. the article resolved the claim nearby
  // (e.g. "The merger, later completed, was expected to close in 2018.").
  // A bare temporal "later"/"ultimately" ("deployed later in 2017") is a
  // forward statement and must NOT suppress.
  if (RESOLUTION_REGEX.test(sentence)) {
    rulesHit++;
  }

  return SUPPRESSION_PENALTY * rulesHit;
}
