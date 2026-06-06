// ABOUTME: Safe-lane denylists (BLP categories, dispute templates) + MediaWiki title canonicalizers.
// ABOUTME: Constants are stored canonical; canonicalizers normalize API/wikitext tokens for exact matching.

/** Uppercase only the first character (MediaWiki first-letter rule; the rest is case-sensitive). */
function upperFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function canonicalize(raw: string, prefix: RegExp): string {
  const noPrefix = raw.replace(prefix, "");
  const folded = noPrefix.replace(/_/g, " ").replace(/\s+/g, " ").trim().normalize("NFC");
  return upperFirst(folded);
}

/** Canonicalize a category title to the form `clcategories` matches and our constants use. */
export function canonicalizeCategoryTitle(raw: string): string {
  return canonicalize(raw, /^\s*category:/i);
}

/** Canonicalize a template name (no namespace prefix) for wikitext matching. */
export function canonicalizeTemplateName(raw: string): string {
  return canonicalize(raw, /^\s*template:/i);
}

/**
 * WP:BLPCAT machine signal — the hard-floor categories (biographies of living persons).
 * Re-verify against live en.wikipedia on the compliance doc's review cadence; a rename here
 * silently fail-OPENs (covered by the per-category gold cases in the eligibility gold set).
 */
export const BLP_CATEGORIES: readonly string[] = [
  "Living people",
  "Possibly living people",
  "Year of birth missing (living people)",
  "Recent deaths",
];

/** Conservative dispute/maintenance templates (advisory, one-way). Extensible. */
export const DISPUTE_TEMPLATES: readonly string[] = [
  "POV",
  "Disputed",
  "Disputed inline",
  "Contradict",
  "Current",
  "BLP",
  "BLP sources",
];
