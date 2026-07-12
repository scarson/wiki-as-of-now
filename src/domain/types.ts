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

/**
 * Authoritative single-snapshot metadata the safe-lane gate consumes. Every field
 * derives from one resolved page of one Action-API response (no two-snapshot skew),
 * so the wikitext scan and the category probe describe the same revision.
 */
export interface ArticleMetadata {
  resolvedPageId: number;
  resolvedTitle: string;
  revisionId: number;
  revisionTimestamp: string; // ISO 8601, from the same response
  namespace: number; // 0 = mainspace
  blpProbe: "present" | "absent" | "unknown"; // clcategories BLP-set result; "unknown" = indeterminate response
  wikitext: string; // same-snapshot revision content (for the advisory scan)
  fetchedAt: string; // ISO 8601, captured at response-parse time
}

/** Safe-lane eligibility verdict plus machine reason codes (never free text). */
export interface EligibilityDecision {
  eligibility: "easy_win" | "human_only";
  reasons: string[]; // canonical-ordered codes
}
