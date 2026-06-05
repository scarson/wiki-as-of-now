// ABOUTME: Core domain types for the WikiAsOfNow stale-claim detector pipeline.
// ABOUTME: Pure type definitions only — no runtime values, no imports, no logic.

/** A single tokenized sentence within a section. */
export interface SentenceUnit {
  text: string;
}

/** A parsed article section with its heading, depth level, and constituent sentences. */
export interface Section {
  heading: string;
  level: number;
  sentences: SentenceUnit[];
}

/** A Wikipedia article parsed into its structural sections, bound to a specific revision. */
export interface ParsedArticle {
  title: string;
  revisionId: number;
  sections: Section[];
}

/** Numeric breakdown of the scoring factors that contribute to a stale-claim score. */
export interface ScoreBreakdown {
  temporalRisk: number;
  futureTenseConfidence: number;
  suppression: number;
  total: number;
}

/**
 * A sentence flagged as a potential stale claim, with scoring and provenance.
 *
 * Location is captured as section + sentence index paired with the section heading
 * for human-readable context. Precise wikitext byte offset is deferred per the
 * design doc — the index pair is sufficient for the deterministic detector phase.
 */
export interface StaleCandidate {
  sentenceText: string;
  sectionHeading: string;
  year: number;
  marker: string;
  score: ScoreBreakdown;
  explanation: string;
  sectionIndex: number;
  sentenceIndex: number;
}
