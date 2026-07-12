// ABOUTME: Deterministic advisory scan of revision wikitext for safe-lane signals (BLP literal, dispute templates).
// ABOUTME: Strips comments/nowiki first so they cannot hide a live signal; no infobox-name matching (spec §4).
import {
  BLP_CATEGORIES,
  DISPUTE_TEMPLATES,
  canonicalizeCategoryTitle,
  canonicalizeTemplateName,
} from "./denylists";

const BLP_SET = new Set(BLP_CATEGORIES.map(canonicalizeCategoryTitle));
const DISPUTE_SET = new Set(DISPUTE_TEMPLATES.map(canonicalizeTemplateName));

function strip(wikitext: string): string {
  return wikitext
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<nowiki>[\s\S]*?<\/nowiki>/gi, " ");
}

/** Returns advisory reason codes found in the (stripped) wikitext, sorted + deduped. */
export function scanWikitextSignals(wikitext: string): string[] {
  const text = strip(wikitext);
  const codes = new Set<string>();

  // (a) literal BLP-set category links: [[Category:<title>]]. First captured char must not be
  // '[' or ']' — real category names never start with those — so on "[[[[..." the engine
  // rejects each start position in O(1) rather than scanning up to 255 chars before failing.
  for (const m of text.matchAll(/\[\[\s*category:\s*([^[\]|\n][^\]|\n]{0,254})(?:\|[^\]\n]*)?\]\]/gi)) {
    if (BLP_SET.has(canonicalizeCategoryTitle("Category:" + m[1]))) codes.add("blp_wikitext");
  }
  // (b) dispute templates: {{<name>...}}. First captured char must not be '{' or '}' — real
  // template names never start with those — so on "{{{{..." the engine rejects each start in O(1).
  for (const m of text.matchAll(/\{\{\s*([^{}|\n][^{}|\n]{0,99}?)\s*(?:\||\}\})/g)) {
    const name = canonicalizeTemplateName(m[1]);
    if (DISPUTE_SET.has(name)) codes.add(`dispute_template:${name}`);
  }

  return [...codes].sort();
}
