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
 * @param _year    - The year extracted from the claim. Reserved for future
 *                  year-aware suppression rules; the current three rules are
 *                  year-agnostic. Kept in the signature for symmetry with
 *                  `scoreClaim` (Task 2.5).
 */
export function suppressionScore(sentence: string, _year: number): number {
  let rulesHit = 0;

  // Rule 1 — historical past-frame narration.
  // Fires when the sentence BOTH:
  //   (a) opens with a past-time frame (In/By/During/As of + a 4-digit year), AND
  //   (b) contains a past-tense verb cue (planned, expected, was scheduled).
  // Guards: historical narration of a past plan is not an unresolved expectation
  // (e.g. "In 1944, the Army planned to invade.").
  //
  // ⚠ The year alternatives MUST stay grouped — the un-grouped form lets the
  // bare `20[0-2]\d` branch match any 20xx year anywhere in the sentence and
  // over-suppress valid claims.
  const pastFrameRegex = /^(In|By|During|As of)\s+(1[89]\d\d|20[0-2]\d)\b/i;
  const pastVerbRegex = /\b(planned|expected|was scheduled)\b/i;
  if (pastFrameRegex.test(sentence) && pastVerbRegex.test(sentence)) {
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
