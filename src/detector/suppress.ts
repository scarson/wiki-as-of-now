// ABOUTME: Negative-pattern suppression — returns a penalty score that reduces false positives
// ABOUTME: in stale-claim detection by identifying historical narration, quotations, and resolved claims.
import { findExpectationMarkers } from "./markers";

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
  // Fires when the sentence opens with a temporal frame (In/By/During/As of +
  // an optional month/qualifier + a 4-digit year) AND that frame year equals
  // the claim's anchor `year`. A leading dateline whose year is the claim year
  // means the marker reports a past intention/statement made AT that time
  // (e.g. "In March 2013, the administration announced plans to add..."), not
  // an unresolved forward claim. The year-match keeps this precise: a claim
  // whose target year differs from the dateline (e.g. "In 2015, ... expected
  // to deliver in 2020.") is NOT suppressed, preserving the forward target.
  //
  // ⚠ The year alternatives MUST stay grouped — an un-grouped `...|20[0-2]\d`
  // would let the bare year branch match any 20xx year anywhere in the
  // sentence and over-suppress valid claims.
  const datelineRegex = /^(?:In|By|During|As of)\s+(?:[A-Za-z]+\.?\s+)?(1[89]\d\d|20[0-2]\d)\b/i;
  const datelineMatch = datelineRegex.exec(sentence);
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
  // Fires when a resolution cue appears alongside the claim.
  // Guards: claims the article itself resolves nearby are not stale
  // (e.g. "The merger, later completed, was expected to close in 2018.").
  const resolutionCueRegex = /\b(later|subsequently|ultimately)\b/i;
  if (resolutionCueRegex.test(sentence)) {
    rulesHit++;
  }

  return SUPPRESSION_PENALTY * rulesHit;
}
