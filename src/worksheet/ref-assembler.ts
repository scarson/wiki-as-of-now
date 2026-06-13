// ABOUTME: Builds a mechanical wikitext <ref>{{cite web ...}}</ref> from deterministic source metadata (G2).
// ABOUTME: Never accepts the human's sentence or the model's quote; escapes template metacharacters (G16/injection).
import type { RefAssemblyInput } from "./view-types";

/**
 * Escapes the three wikitext template metacharacters as HTML entities so an attacker-controlled source title
 * (e.g. one pulled from a page) cannot open a new template arg (`|`), open a nested template (`{{`), or close
 * the cite early (`}}`). The substituted entities render as the literal characters in the article.
 */
function escapeWikitextArg(v: string): string {
  return v
    .replace(/\|/g, "&#124;")
    .replace(/\{\{/g, "&#123;&#123;")
    .replace(/\}\}/g, "&#125;&#125;");
}

export function buildRefWikitext(input: RefAssemblyInput): string {
  const parts = [`|url=${escapeWikitextArg(input.url)}`, `|title=${escapeWikitextArg(input.title)}`];
  if (input.publisher) parts.push(`|publisher=${escapeWikitextArg(input.publisher)}`);
  if (input.publishedDate) parts.push(`|date=${escapeWikitextArg(input.publishedDate)}`);
  parts.push(`|access-date=${escapeWikitextArg(input.accessedDate)}`);
  return `<ref>{{cite web ${parts.join(" ")}}}</ref>`;
}
