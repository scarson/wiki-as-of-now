// ABOUTME: Deterministic circular-source exclusion — drops Wikipedia + known mirrors/derivatives from search hits.
// ABOUTME: Wikipedia can't be a reliable source FOR Wikipedia (WP:CIRCULAR); this is the authoritative filter, applied provider-agnostically at the search seam.
import type { SearchProvider, SearchHit } from "./search-provider";

/**
 * Registered domains that are circular sources for a Wikipedia-citation tool: Wikipedia itself
 * (all languages + m./zero. subdomains), plus known verbatim mirrors and Wikipedia-derived datasets.
 * Per WP:CIRCULAR — do not cite Wikipedia, sites that mirror it, or publications that rely on it.
 *
 * Config, not code — extend here. This list deliberately covers only the clear, machine-decidable
 * cases. The unbounded tail of obscure scraper-mirrors and circular reporting (a news article that
 * merely parrots Wikipedia) is NOT enumerable; the human verification gate is the backstop for those,
 * exactly as for the SSRF mirror-residuals. A provider-side pre-filter (Brave `-site:`, Tavily
 * `exclude_domains`) MAY be layered on later to save fetch budget, but this filter stays the authority.
 */
export const CIRCULAR_SOURCE_DOMAINS: readonly string[] = [
  "wikipedia.org", // the encyclopedia itself — all languages + m./zero. subdomains
  "wikimedia.org", // Wikimedia Foundation / Commons
  "wikidata.org", // user-generated, largely Wikipedia-derived structured data
  "dbpedia.org", // structured extraction OF Wikipedia
  "wikiwand.com", // verbatim Wikipedia mirror/reader
];

/**
 * True iff `host` is, or is a subdomain of, a registered circular-source domain.
 * Case-insensitive; suffix-safe — matches `D` or `*.D`, never look-alikes like `notwikipedia.org`
 * or `wikipedia.org.attacker.com` (the classic suffix-match escape).
 */
export function isCircularSource(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, ""); // drop a trailing root dot
  if (h === "") return false;
  return CIRCULAR_SOURCE_DOMAINS.some((d) => h === d || h.endsWith("." + d));
}

/**
 * Drop hits whose URL host is a circular source. An unparseable URL passes through untouched —
 * URL validity is the canonicalize/fetch step's responsibility, not this filter's.
 */
export function filterCircularHits(hits: SearchHit[]): SearchHit[] {
  return hits.filter((hit) => {
    let host: string;
    try {
      host = new URL(hit.url).hostname;
    } catch {
      return true; // not classifiable here → leave it to the downstream URL validation
    }
    return !isCircularSource(host);
  });
}

/** Provider-agnostic decorator: wrap any SearchProvider so circular sources never reach the pipeline. */
export function excludeCircularSources(provider: SearchProvider): SearchProvider {
  return { search: async (query) => filterCircularHits(await provider.search(query)) };
}
