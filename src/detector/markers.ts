// ABOUTME: Expectation-marker lexicon and year extraction for stale-claim detection.
// ABOUTME: Deterministic, LLM-free, network-free — pure text pattern matching only.

/**
 * Maps each expectation/future-tense phrase to its staleness-signal strength.
 * Strength 2 = strong signal (explicit scheduling language).
 * Strength 1 = weak signal (general forward intent).
 *
 * This is the SINGLE SOURCE OF TRUTH for marker strengths.
 * Tasks 2.5 and 2.6 import this map rather than maintaining their own copies.
 */
export const MARKER_STRENGTH: Record<string, number> = {
  "is expected to": 2,
  "is scheduled to": 2,
  "is slated to": 2,
  "is due to": 2,
  "plans to": 2,
  "aims to": 1,
  "anticipated": 1,
  "to be completed by": 2,
  "will": 1,
};

/** Escapes regex-special characters in a literal phrase so it can be embedded in a RegExp. */
function escapeRegex(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scans `text` for any expectation/future-tense markers from the lexicon.
 * Matching is case-insensitive and word-boundary-anchored so that e.g.
 * "will" matches in "ambassadors will attend" but NOT inside "Goodwill".
 *
 * @returns The matched canonical lexicon phrases (lowercase, as defined in
 *   MARKER_STRENGTH), each appearing at most once, in lexicon-definition order.
 */
export function findExpectationMarkers(text: string): string[] {
  const matched: string[] = [];
  for (const phrase of Object.keys(MARKER_STRENGTH)) {
    const pattern = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
    if (pattern.test(text)) {
      matched.push(phrase);
    }
  }
  return matched;
}

/**
 * Extracts all 4-digit years in the range 1900–2099 from `text`, in the order
 * they appear. Word boundaries prevent matching years embedded inside longer
 * digit runs (e.g. "20171" does not yield 2017).
 *
 * @returns An array of year numbers in appearance order.
 */
export function extractYears(text: string): number[] {
  const pattern = /\b(?:19\d\d|20\d\d)\b/g;
  const years: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    years.push(Number(match[0]));
  }
  return years;
}
