// ABOUTME: SearchProvider seam — query → ranked REAL source URLs. SearchHit carries only the URL (never Brave snippets, ToS §3.2).
// ABOUTME: manualUrlsAsHits is the "I already have a source" paste path that bypasses search entirely.

/** A single search result — ONLY the resolving URL is retained (never the provider's title/snippet). */
export interface SearchHit {
  url: string;
}

export interface SearchProvider {
  /** Returns ranked real URLs for one neutral query. Implementations must throw ProviderUnavailableError on transport failure. */
  search(query: string): Promise<SearchHit[]>;
}

/** Turn user-pasted source URLs into SearchHits (manual path: bypasses search). De-dups, drops blanks. */
export function manualUrlsAsHits(urls: string[]): SearchHit[] {
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (url === "" || seen.has(url)) continue;
    seen.add(url);
    hits.push({ url });
  }
  return hits;
}
