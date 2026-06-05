// ABOUTME: Stale-claim detection orchestrator — iterates parsed article sections and sentences.
// ABOUTME: Deterministic and LLM-free; asOfYear is always injected, never read from the clock.
import { findExpectationMarkers, extractYears, MARKER_STRENGTH } from "./markers";
import { scoreClaim } from "./score";
import type { ParsedArticle, StaleCandidate } from "../domain/types";

/** Semantic version of the deterministic detector algorithm. */
export const DETECTOR_VERSION = "1.0.0";

/**
 * Scans a parsed article for stale expectation claims and returns them sorted
 * by total score descending.
 *
 * For each sentence the detector:
 *   1. Finds expectation markers — sentences with none are skipped.
 *   2. Applies the year gate — only past years (year < asOfYear) are eligible.
 *      Sentences whose only year(s) are future are skipped entirely.
 *   3. Picks the highest-strength marker (first on ties) and the earliest past
 *      year (highest temporal risk).
 *   4. Scores the candidate; drops it when the scorer returns total === 0.
 *   5. Attaches a human-readable explanation including the section heading.
 *
 * Invariants: pure, no network, no model calls, no `new Date()`. Same inputs
 * always produce deeply-equal output.
 *
 * @param article  - A ParsedArticle produced by `parseArticle`.
 * @param asOfYear - The reference year to compare candidate years against.
 * @returns        StaleCandidate array sorted by score.total descending.
 */
export function detectStaleClaims(
  article: ParsedArticle,
  asOfYear: number
): StaleCandidate[] {
  const candidates: StaleCandidate[] = [];

  for (let sectionIndex = 0; sectionIndex < article.sections.length; sectionIndex++) {
    const section = article.sections[sectionIndex];

    for (let sentenceIndex = 0; sentenceIndex < section.sentences.length; sentenceIndex++) {
      const text = section.sentences[sentenceIndex].text;

      // Step 1: require at least one expectation marker.
      const markers = findExpectationMarkers(text);
      if (markers.length === 0) continue;

      // Step 2: year gate — keep only past years.
      const pastYears = extractYears(text).filter(y => y < asOfYear);
      if (pastYears.length === 0) continue;

      // Step 3: choose the strongest marker (first on ties) and the earliest past year.
      // NB: picking the EARLIEST past year means a sentence that opens with a
      // dateline AND carries a later forward target (e.g. "In 2015, ... expected
      // to deliver in 2020.") is anchored to the dateline year and suppressed by
      // suppress.ts Rule 1 — a deliberate precision-over-recall choice, not a bug
      // (see suppress.ts Rule 1 and docs/pitfalls DET-1 for the accepted recall gap).
      let chosenMarker = markers[0];
      for (let i = 1; i < markers.length; i++) {
        if ((MARKER_STRENGTH[markers[i]] ?? 0) > (MARKER_STRENGTH[chosenMarker] ?? 0)) {
          chosenMarker = markers[i];
        }
      }
      const chosenYear = Math.min(...pastYears);

      // Step 4: score; drop if the scorer suppressed the candidate (total === 0).
      const scored = scoreClaim({ sentence: text, year: chosenYear, marker: chosenMarker, asOfYear });
      if (scored.total === 0) continue;

      // Step 5: build the candidate with a section-aware explanation clause.
      const sectionClause =
        section.heading !== ""
          ? ` Appears in section '${section.heading}'.`
          : " Appears in the lead.";

      candidates.push({
        sentenceText: text,
        sectionHeading: section.heading,
        year: chosenYear,
        marker: chosenMarker,
        score: scored.breakdown,
        explanation: scored.explanation + sectionClause,
        sectionIndex,
        sentenceIndex,
      });
    }
  }

  // Sort by total descending; ties keep insertion order (stable sort in V8 ≥ Node 11).
  candidates.sort((a, b) => b.score.total - a.score.total);

  return candidates;
}
