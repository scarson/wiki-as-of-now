// ABOUTME: Brave Search API client (gated on BRAVE_API_KEY) — query → ranked REAL URLs.
// ABOUTME: Retains ONLY result URLs (never Brave titles/snippets). Result-storage ToS posture + accepted-risk decision: docs/design/2026-06-21-brave-vs-tavily-search-backend-research.md §4. Transport failure → ProviderUnavailableError.
import { ProviderUnavailableError } from "./provider";
import { MODEL_CONFIG } from "./model-config";
import type { SearchProvider, SearchHit } from "./search-provider";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

type BraveFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean; status: number; json(): Promise<unknown>;
}>;

export class BraveSearchProvider implements SearchProvider {
  // The default MUST be a lambda, not a detached `fetch` reference: workerd's global fetch
  // validates its receiver, and a detached reference later invoked as `this.fetchFn(...)`
  // (receiver = this provider) throws `TypeError: Illegal invocation` before any network I/O.
  // Node's fetch is receiver-insensitive, which is why unit tests can't see the difference.
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: BraveFetch = (url, init) => fetch(url, init),
  ) {}

  async search(query: string): Promise<SearchHit[]> {
    // URLSearchParams encodes spaces as `+` (application/x-www-form-urlencoded); Brave accepts both `+` and %20.
    const url = `${BRAVE_ENDPOINT}?${new URLSearchParams({ q: query, count: String(MODEL_CONFIG.braveCount) }).toString()}`;
    let res: Awaited<ReturnType<BraveFetch>>;
    try {
      res = await this.fetchFn(url, {
        headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
      });
    } catch (e) {
      // Codes-only observability (G13): the stage, a fixed code, and the error CLASS name —
      // never the query text or error message text.
      console.warn("research.search.failed", {
        status: "transport",
        reason: e instanceof Error ? e.name : "unknown",
      });
      throw new ProviderUnavailableError("brave search transport failure");
    }
    if (!res.ok) {
      console.warn("research.search.failed", { status: res.status });
      throw new ProviderUnavailableError(`brave search http ${res.status}`);
    }
    const body = (await res.json()) as { web?: { results?: { url?: unknown }[] } };
    const results = body.web?.results ?? [];
    // Retain ONLY the url — never title/description (ToS §3.2).
    return results
      .map((r) => r.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
      .map((url) => ({ url }));
  }
}
